import { DurableObject } from 'cloudflare:workers';

/**
 * 아주 단순한 고정 창(fixed window) 제한기. IP 별로 하나의 인스턴스를 쓴다.
 * 방 생성 남용과 코드 무작위 대입을 늦추는 용도이며, 완전한 보안 장치는 아니다.
 */
export class LimiterDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('method', { status: 405 });
    const { key, limit, windowMs } = (await request.json()) as { key: string; limit: number; windowMs: number };
    const now = Date.now();
    const stored = (await this.ctx.storage.get<{ start: number; count: number }>(key)) ?? { start: now, count: 0 };
    const bucket = now - stored.start > windowMs ? { start: now, count: 0 } : stored;
    bucket.count += 1;
    await this.ctx.storage.put(key, bucket);
    // 오래된 키 정리용 알람
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm) await this.ctx.storage.setAlarm(now + windowMs * 2);
    const allowed = bucket.count <= limit;
    return Response.json({ allowed, remaining: Math.max(0, limit - bucket.count), retryAfterMs: allowed ? 0 : bucket.start + windowMs - now });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export async function rateLimit(env: Env, ip: string, key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
  // 로컬 개발(.dev.vars 의 APP_ENV=development)에서는 제한을 끈다. 운영·스테이징에서는 항상 켜진다.
  if ((env.APP_ENV as string) === 'development') return { allowed: true, retryAfterMs: 0 };
  try {
    const stub = env.LIMITER.getByName(`ip:${ip}`);
    const res = await stub.fetch('https://limiter/hit', { method: 'POST', body: JSON.stringify({ key, limit, windowMs }) });
    return (await res.json()) as { allowed: boolean; retryAfterMs: number };
  } catch {
    // 제한기 장애가 수업을 막지 않도록 허용 쪽으로 실패한다.
    return { allowed: true, retryAfterMs: 0 };
  }
}
