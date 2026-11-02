// Cloudflare Worker 진입점: 정적 자산 + REST API + WebSocket 라우팅.
// 방 상태는 전부 RoomDO 가 가진다. 이 파일은 코드 생성·속도 제한·전달만 담당한다.
import { MAX_STUDENTS } from '../shared/content';
import type { ApiError, CreateRoomResponse } from '../shared/types';
import { LimiterDO, rateLimit } from './limiter';
import { RoomDO, randomToken } from './room';

export { RoomDO, LimiterDO };

// 혼동되는 문자(0/O, 1/I/L) 를 뺀 코드 알파벳
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{6}$/;

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function err(code: string, message: string, status: number): Response {
  const body: ApiError = { error: message, code };
  return json(body, status);
}

function normalizeCode(raw: string | undefined | null): string | null {
  const c = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE_RE.test(c)) return null;
  // 혼동 문자는 비슷한 문자로 정정한다 (O→0 은 알파벳에 없으므로 0→O 등)
  const fixed = c.replace(/0/g, 'O').replace(/1/g, 'I').replace(/I/g, 'J').replace(/L/g, 'J').replace(/O/g, 'Q');
  // 위 정정이 실제 알파벳 밖 문자를 만들 수 있으므로, 원문이 알파벳에 모두 속하면 원문 사용
  return [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : fixed;
}

// 교실 전체가 학교 공용 IP 하나를 쓰는 경우가 흔하므로 IP 기준 제한은 남용 방지 수준으로만 둔다.
const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? '127.0.0.1';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') return handleWs(request, env, url);
    if (path.startsWith('/api/')) return handleApi(request, env, url);
    if (path === '/healthz') return json({ ok: true, env: env.APP_ENV ?? 'development' });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleWs(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
  if (request.method !== 'GET') return new Response('method', { status: 405 });
  const code = normalizeCode(url.searchParams.get('code'));
  const role = url.searchParams.get('role');
  if (!code || (role !== 'teacher' && role !== 'student' && role !== 'public')) return new Response('bad request', { status: 400 });
  const limit = await rateLimit(env, clientIp(request), 'ws', 900, 60_000);
  if (!limit.allowed) return new Response('too many connections', { status: 429 });
  const stub = env.ROOM.getByName(code);
  // 토큰은 URL 에 싣지 않고 연결 후 첫 메시지로 보낸다(로그 노출 방지).
  const target = new URL(request.url);
  target.pathname = '/ws';
  target.search = `?role=${role}`;
  return stub.fetch(new Request(target.toString(), request));
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code?, action?]
  if (parts[1] !== 'rooms') return err('not_found', '없는 경로예요.', 404);
  const ip = clientIp(request);

  // POST /api/rooms — 교사 방 만들기
  if (parts.length === 2 && request.method === 'POST') {
    const limit = await rateLimit(env, ip, 'create', 10, 10 * 60_000);
    if (!limit.allowed) return err('rate_limited', '방을 너무 자주 만들었어요. 잠시 후 다시 시도해 주세요.', 429);
    if (env.TEACHER_CREATE_SECRET) {
      const body = (await request.clone().json().catch(() => ({}))) as { secret?: string };
      if (body.secret !== env.TEACHER_CREATE_SECRET) return err('forbidden', '교사용 비밀번호가 맞지 않아요.', 403);
    }
    const ttlHours = Math.min(24, Math.max(1, Number(env.ROOM_TTL_HOURS ?? '24') || 24));
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeCode();
      const teacherToken = randomToken(32);
      const publicToken = randomToken(16);
      const stub = env.ROOM.getByName(code);
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, teacherToken, publicToken, ttlHours }) });
      if (res.status === 409) continue; // 코드 충돌 → 다시 생성
      if (!res.ok) return err('internal', '방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      const { expiresAt } = (await res.json()) as { expiresAt: number };
      const body: CreateRoomResponse = { code, teacherToken, publicToken, expiresAt };
      return json(body, 201);
    }
    return err('internal', '방 코드를 만들지 못했어요. 다시 시도해 주세요.', 500);
  }

  const code = normalizeCode(parts[2]);
  if (!code) return err('bad_code', '코드는 영문·숫자 6자리예요.', 400);
  const stub = env.ROOM.getByName(code);
  const action = parts[3];

  if (!action && request.method === 'GET') {
    const limit = await rateLimit(env, ip, 'lookup', 600, 10 * 60_000);
    if (!limit.allowed) return err('rate_limited', '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
    return passthrough(await stub.fetch('https://room/status'));
  }
  if (action === 'join' && request.method === 'POST') {
    const limit = await rateLimit(env, ip, 'join', 300, 10 * 60_000);
    if (!limit.allowed) return err('rate_limited', '입장 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
    return passthrough(await stub.fetch('https://room/join', { method: 'POST', body: '{}' }));
  }
  if (action === 'teacher' && request.method === 'POST') {
    const limit = await rateLimit(env, ip, 'teacher', 60, 10 * 60_000);
    if (!limit.allowed) return err('rate_limited', '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
    const body = await request.text();
    return passthrough(await stub.fetch('https://room/teacher', { method: 'POST', body }));
  }
  if (action === 'export' && request.method === 'GET') {
    const token = url.searchParams.get('token') ?? '';
    return passthrough(await stub.fetch(`https://room/export?token=${encodeURIComponent(token)}`));
  }
  return err('not_found', '없는 경로예요.', 404);
}

async function passthrough(res: Response): Promise<Response> {
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}

export const limits = { MAX_STUDENTS };
