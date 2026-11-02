// 하나의 게임방 = 하나의 Durable Object. 방 상태의 유일한 기준.
// WebSocket Hibernation API + SQLite 저장소. 역할별로 다른 스냅샷을 내려보낸다.
import { DurableObject } from 'cloudflare:workers';
import {
  APPLICANTS,
  AVATAR_EMOJI,
  CLUES,
  MAX_STUDENTS,
  PACKAGES,
  PERSPECTIVES,
  PHASE_KIND,
  POLICIES,
  PRACTICE_OPTIONS,
  QUESTION_CANDIDATES,
  PSEUDONYM_ADJ,
  PSEUDONYM_NOUN,
  SURVEY_OPTIONS,
  TRANSFER_SCENARIO,
  packageById,
  phaseIndex,
  phaseMeta,
  policyById,
} from '../shared/content';
import {
  allocateByPackage,
  changeMatrix,
  compareAllocations,
  makeLottery,
  perspectiveBoard,
  r1Allocation,
  shuffleWithSeed,
  surveyShift,
  tallyMulti,
  tallyVotes,
} from '../shared/engine';
import {
  PHASES,
  type AllocationResult,
  type ClueId,
  type Comparison,
  type EndingSummary,
  type MeState,
  type PackageId,
  type PerspectiveId,
  type Phase,
  type PhaseRound,
  type PolicyId,
  type PublicState,
  type RevealedClue,
  type RoomDecisions,
  type ServerMessage,
  type SubmissionPayload,
  type SurveyChoice,
  type Tally,
  type TeacherDecision,
  type TeacherState,
  type TeacherSummary,
} from '../shared/types';
import { BOT_ADJ, BOT_NOUNS, botPayload } from './bots';
import { BARRIERS, CLUE_SECRETS, OPEN_QUESTION_BY_PACKAGE, TEACHER_NOTES } from './secretContent';
import { clientMessageSchema, type ParsedClientMessage } from './validate';

// ---------- 저장 문서 ----------

interface RoomDoc {
  code: string;
  createdAt: number;
  expiresAt: number;
  teacherTokenHash: string;
  publicToken: string;
  lotterySeed: string;
  phase: Phase;
  rounds: Partial<Record<Phase, PhaseRound>>;
  revision: number;
  flowRevision: number;
  locked: boolean;
  paused: boolean;
  soundScreen: 'teacher' | 'public';
  bgmDucked: boolean;
  decisions: RoomDecisions;
  teacherDecisions: TeacherDecision[];
  tallies: Partial<Record<Phase, Tally>>;
  allocations: { r1?: AllocationResult; r3?: Comparison };
  ending?: EndingSummary;
  recentMessageIds: string[];
  /** 연습용 봇이 다음에 제출할 시각(서버 시각). null 이면 예약 없음 */
  botsDueAt?: number | null;
  deleted?: boolean;
}

interface Attachment {
  role: 'teacher' | 'student' | 'public';
  authed: boolean;
  pid?: string;
  at: number;
}

interface ParticipantRow {
  [key: string]: SqlStorageValue;
  id: string;
  pseudonym: string;
  avatar: number;
  perspective: PerspectiveId;
  joined_at: number;
  last_seen: number;
}

const DECISION_PHASES: Phase[] = ['r1_vote', 'r2_choose', 'r3_vote', 'r4_questions'];
const PRIVATE_TALLY_PHASES: Phase[] = ['pre_survey', 'r5_post'];
const UNAUTH_GRACE_MS = 20_000;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 24): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const newRoundId = (phase: Phase) => `${phase}-${Date.now().toString(36)}-${randomToken(4)}`;

class CommandError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export class RoomDO extends DurableObject<Env> {
  private doc: RoomDoc | null = null;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // 하이버네이션에서 깨어날 때마다 생성자가 다시 실행되므로 최소한의 작업만 한다.
    ctx.blockConcurrencyWhile(async () => {
      this.initSchema();
      this.doc = this.loadDoc();
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // ---------- 스키마 / 문서 ----------

  private initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        pseudonym TEXT NOT NULL,
        avatar INTEGER NOT NULL,
        perspective TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS submissions (
        round_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (round_id, participant_id)
      );
      CREATE INDEX IF NOT EXISTS submissions_phase ON submissions(phase);
      CREATE TABLE IF NOT EXISTS texts (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (round_id, participant_id, kind)
      );
      CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
    `);
    // 기존 방(배포 전 생성)에도 봇 열을 추가한다. 이미 있으면 무시.
    try {
      this.sql.exec(`ALTER TABLE participants ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0`);
    } catch {
      /* already exists */
    }
  }

  private loadDoc(): RoomDoc | null {
    const row = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = 'room'`).toArray()[0];
    if (!row) return null;
    const doc = JSON.parse(row.value) as RoomDoc;
    doc.flowRevision ??= 1;
    return doc;
  }

  private saveDoc() {
    if (!this.doc) return;
    this.sql.exec(`INSERT INTO meta (key, value) VALUES ('room', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, JSON.stringify(this.doc));
  }

  private log(kind: string, data: Record<string, unknown>) {
    // 원문 응답·토큰은 기록하지 않는다.
    this.sql.exec(`INSERT INTO log (at, kind, data) VALUES (?, ?, ?)`, Date.now(), kind, JSON.stringify(data));
  }

  private requireDoc(): RoomDoc {
    if (!this.doc || this.doc.deleted) throw new CommandError('no_room', '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.');
    if (Date.now() > this.doc.expiresAt) throw new CommandError('expired', '이 방은 보존 기간이 지나 정리되었어요.');
    return this.doc;
  }

  // ---------- HTTP (Worker 내부 호출) ----------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/init':
          return await this.handleInit(request);
        case '/status':
          return this.handleStatus();
        case '/join':
          return await this.handleJoin(request);
        case '/teacher':
          return await this.handleTeacherRecover(request);
        case '/export':
          return await this.handleExport(request);
        case '/ws':
          return await this.handleWs(request, url);
        default:
          return Response.json({ error: 'not found', code: 'not_found' }, { status: 404 });
      }
    } catch (e) {
      if (e instanceof CommandError) {
        const status = e.code === 'no_room' || e.code === 'expired' ? 404 : e.code === 'forbidden' ? 403 : 400;
        return Response.json({ error: e.message, code: e.code }, { status });
      }
      console.error('room error', (e as Error).message);
      return Response.json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', code: 'internal' }, { status: 500 });
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as { code: string; teacherToken: string; publicToken: string; ttlHours: number };
    if (this.doc && !this.doc.deleted && Date.now() < this.doc.expiresAt) {
      return Response.json({ error: 'code in use', code: 'conflict' }, { status: 409 });
    }
    // 이전 방 흔적이 있으면 완전히 지운다.
    await this.wipe(false);
    const now = Date.now();
    const doc: RoomDoc = {
      code: body.code,
      createdAt: now,
      expiresAt: now + body.ttlHours * 3600_000,
      teacherTokenHash: await sha256Hex(body.teacherToken),
      publicToken: body.publicToken,
      lotterySeed: randomToken(12),
      phase: 'lobby',
      rounds: {},
      revision: 1,
      flowRevision: 1,
      locked: false,
      paused: false,
      soundScreen: 'public',
      bgmDucked: false,
      decisions: {},
      teacherDecisions: [],
      tallies: {},
      allocations: {},
      recentMessageIds: [],
    };
    this.doc = doc;
    this.initSchema();
    this.saveDoc();
    this.log('room_created', { code: body.code });
    await this.scheduleAlarm();
    return Response.json({ ok: true, expiresAt: doc.expiresAt });
  }

  private handleStatus(): Response {
    const doc = this.requireDoc();
    return Response.json({ exists: true, locked: doc.locked, joined: this.participantCount(), phase: doc.phase, expiresAt: doc.expiresAt });
  }

  private participantCount(): number {
    return Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM participants`).one().n);
  }

  private async handleJoin(_request: Request): Promise<Response> {
    const doc = this.requireDoc();
    if (doc.phase === 'closed') throw new CommandError('closed', '이 수업은 끝났어요.');
    if (doc.locked) throw new CommandError('locked', '선생님이 입장을 잠갔어요. 선생님께 말씀해 주세요.');
    const count = this.participantCount();
    if (count >= MAX_STUDENTS) throw new CommandError('full', `이 방은 정원(${MAX_STUDENTS}명)이 찼어요.`);

    const used = new Set(this.sql.exec<{ pseudonym: string }>(`SELECT pseudonym FROM participants`).toArray().map((r) => r.pseudonym));
    let pseudonym = '';
    let avatar = 0;
    for (let i = 0; i < 200; i++) {
      const ai = Math.floor(Math.random() * PSEUDONYM_ADJ.length);
      const ni = Math.floor(Math.random() * PSEUDONYM_NOUN.length);
      const cand = `${PSEUDONYM_ADJ[ai]} ${PSEUDONYM_NOUN[ni]}`;
      if (!used.has(cand)) {
        pseudonym = cand;
        avatar = ni;
        break;
      }
    }
    if (!pseudonym) {
      pseudonym = `참가자 ${count + 1}`;
      avatar = count % AVATAR_EMOJI.length;
    }
    // 관점 카드: 가장 적게 배정된 관점 중 무작위
    const counts = new Map<PerspectiveId, number>(PERSPECTIVES.map((p) => [p.id, 0]));
    for (const r of this.sql.exec<{ perspective: PerspectiveId; n: number }>(`SELECT perspective, COUNT(*) AS n FROM participants GROUP BY perspective`).toArray()) {
      counts.set(r.perspective, Number(r.n));
    }
    const min = Math.min(...counts.values());
    const pool = [...counts.entries()].filter(([, n]) => n === min).map(([p]) => p);
    const perspective = pool[Math.floor(Math.random() * pool.length)]!;

    const id = `p_${randomToken(9)}`;
    const token = randomToken(24);
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO participants (id, token_hash, pseudonym, avatar, perspective, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      await sha256Hex(token),
      pseudonym,
      avatar,
      perspective,
      now,
      now,
    );
    this.log('join', { count: count + 1 });
    this.bump();
    await this.broadcast();
    return Response.json({ participantId: id, studentToken: token, pseudonym, avatar });
  }

  private async handleTeacherRecover(request: Request): Promise<Response> {
    const doc = this.requireDoc();
    const { token } = (await request.json()) as { token: string };
    if ((await sha256Hex(token ?? '')) !== doc.teacherTokenHash) throw new CommandError('forbidden', '교사 자격이 맞지 않아요.');
    return Response.json({ ok: true, code: doc.code, expiresAt: doc.expiresAt, phase: doc.phase });
  }

  private async handleExport(request: Request): Promise<Response> {
    const doc = this.requireDoc();
    const token = new URL(request.url).searchParams.get('token') ?? '';
    if ((await sha256Hex(token)) !== doc.teacherTokenHash) throw new CommandError('forbidden', '교사 자격이 맞지 않아요.');
    return Response.json(this.buildSummary(), {
      headers: { 'content-disposition': `attachment; filename="festival-summary-${doc.code}.json"` },
    });
  }

  // ---------- WebSocket ----------

  private async handleWs(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const role = url.searchParams.get('role');
    if (role !== 'teacher' && role !== 'student' && role !== 'public') return new Response('bad role', { status: 400 });
    // 방이 없더라도 소켓을 열어 한국어 안내를 보낸 뒤 닫는다.
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [role]);
    const att: Attachment = { role, authed: false, at: Date.now() };
    server.serializeAttachment(att);
    if (!this.doc || this.doc.deleted) {
      this.send(server, { type: 'error', code: 'no_room', message: '방을 찾을 수 없어요. 코드를 다시 확인해 주세요.', fatal: true });
      server.close(4404, 'no_room');
    } else if (Date.now() > this.doc.expiresAt) {
      this.send(server, { type: 'error', code: 'expired', message: '이 방은 보존 기간이 지나 정리되었어요.', fatal: true });
      server.close(4410, 'expired');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* 닫힌 소켓 */
    }
  }

  private att(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { role: 'public', authed: false, at: 0 };
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 8_000) return;
    let parsed: ParsedClientMessage;
    try {
      parsed = clientMessageSchema.parse(JSON.parse(raw));
    } catch {
      const maybe = safeJson(raw);
      const id = typeof maybe?.messageId === 'string' ? maybe.messageId : undefined;
      if (id) this.send(ws, { type: 'ack', messageId: id, ok: false, code: 'invalid', message: '형식이 맞지 않는 응답이에요. 화면을 새로고침해 주세요.' });
      else this.send(ws, { type: 'error', code: 'invalid', message: '형식이 맞지 않는 메시지예요.' });
      return;
    }
    const att = this.att(ws);
    try {
      if (parsed.type === 'ping') {
        this.send(ws, { type: 'pong', serverNow: Date.now() });
        return;
      }
      if (parsed.type === 'auth') {
        await this.authenticate(ws, att, parsed.token);
        return;
      }
      if (!att.authed) {
        this.send(ws, { type: 'error', code: 'unauthenticated', message: '먼저 인증이 필요해요.', fatal: true });
        ws.close(4401, 'unauthenticated');
        return;
      }
      const doc = this.requireDoc();
      if (parsed.type === 'hello') {
        this.sendSnapshot(ws, att);
        return;
      }
      if (parsed.type === 'submit') {
        if (att.role !== 'student' || !att.pid) throw new CommandError('forbidden', '학생만 제출할 수 있어요.');
        await this.handleSubmit(ws, att.pid, parsed, doc);
        return;
      }
      if (parsed.type === 'teacher') {
        if (att.role !== 'teacher') {
          // 학생·공개 화면 소켓의 교사 명령은 거부하고 기록만 남긴다(원문 없음).
          this.log('rejected_teacher_command', { role: att.role, op: parsed.command.op });
          this.send(ws, { type: 'ack', messageId: parsed.messageId, ok: false, code: 'forbidden', message: '교사만 진행할 수 있어요.' });
          return;
        }
        await this.handleTeacherCommand(ws, parsed, doc);
      }
    } catch (e) {
      const messageId = 'messageId' in parsed ? parsed.messageId : undefined;
      const code = e instanceof CommandError ? e.code : 'internal';
      const message = e instanceof CommandError ? e.message : '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
      if (!(e instanceof CommandError)) console.error('ws error', (e as Error).message);
      if (messageId) this.send(ws, { type: 'ack', messageId, ok: false, code, message });
      else this.send(ws, { type: 'error', code, message, fatal: code === 'no_room' || code === 'expired' });
    }
  }

  private async authenticate(ws: WebSocket, att: Attachment, token: string) {
    const doc = this.requireDoc();
    const hash = await sha256Hex(token);
    if (att.role === 'teacher') {
      if (hash !== doc.teacherTokenHash) {
        this.send(ws, { type: 'error', code: 'forbidden', message: '교사 자격이 맞지 않아요. 방을 만든 창에서 다시 열어 주세요.', fatal: true });
        ws.close(4403, 'forbidden');
        return;
      }
    } else if (att.role === 'public') {
      if (token !== doc.publicToken) {
        this.send(ws, { type: 'error', code: 'forbidden', message: '공개 화면 링크가 맞지 않아요. 교사 화면에서 링크를 다시 복사해 주세요.', fatal: true });
        ws.close(4403, 'forbidden');
        return;
      }
    } else {
      const row = this.sql.exec<{ id: string }>(`SELECT id FROM participants WHERE token_hash = ?`, hash).toArray()[0];
      if (!row) {
        this.send(ws, { type: 'error', code: 'unknown_student', message: '참가 정보를 찾을 수 없어요. 코드를 다시 입력해 입장해 주세요.', fatal: true });
        ws.close(4403, 'unknown_student');
        return;
      }
      att.pid = row.id;
      // 같은 학생의 다른 소켓은 닫는다(중복 세션 방지).
      for (const other of this.ctx.getWebSockets('student')) {
        if (other === ws) continue;
        const oa = this.att(other);
        if (oa.pid === row.id) {
          this.send(other, { type: 'kicked', reason: '다른 창에서 접속해서 이 창의 연결을 종료했어요.' });
          try {
            other.close(4409, 'duplicate');
          } catch {
            /* ignore */
          }
        }
      }
      this.sql.exec(`UPDATE participants SET last_seen = ? WHERE id = ?`, Date.now(), row.id);
    }
    att.authed = true;
    att.at = Date.now();
    ws.serializeAttachment(att);
    this.sendSnapshot(ws, att);
    if (att.role === 'teacher') {
      this.log('teacher_connected', {});
      await this.broadcast(); // teacherConnected 갱신
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const att = this.att(ws);
    try {
      ws.close(code, 'bye');
    } catch {
      /* ignore */
    }
    if (att.role === 'teacher' && att.authed) {
      // 남은 교사 소켓이 없으면 학생 화면에 '교사 연결 끊김' 상태를 알린다.
      if (this.teacherConnected(ws)) return;
      this.log('teacher_disconnected', {});
      await this.broadcast();
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1011, 'error', false);
  }

  private teacherConnected(except?: WebSocket): boolean {
    return this.ctx.getWebSockets('teacher').some((s) => s !== except && this.att(s).authed);
  }

  // ---------- 학생 제출 ----------

  private async handleSubmit(ws: WebSocket, pid: string, msg: Extract<ParsedClientMessage, { type: 'submit' }>, doc: RoomDoc) {
    const round = doc.rounds[doc.phase];
    if (!round || msg.phase !== doc.phase || msg.roundId !== round.roundId) {
      throw new CommandError('stale_round', '이 활동은 이미 끝났어요. 선생님이 다음 장면으로 넘어갔어요.');
    }
    if (round.locked) throw new CommandError('locked', '제출이 마감됐어요. 지금 응답은 저장되지 않았어요.');
    if (doc.paused) throw new CommandError('paused', '선생님이 일시정지했어요. 재개되면 다시 제출해 주세요.');
    const expectedKind = PHASE_KIND[doc.phase];
    if (!expectedKind || msg.payload.kind !== expectedKind) throw new CommandError('wrong_kind', '지금 단계의 활동이 아니에요.');
    if (round.limitTo) {
      const choice = 'choice' in msg.payload ? msg.payload.choice : null;
      if (choice && choice !== 'abstain' && !round.limitTo.includes(choice)) {
        throw new CommandError('not_allowed', '재투표에서는 동률인 선택지 중에서만 고를 수 있어요.');
      }
    }
    this.storeSubmission(pid, round, doc.phase, msg.payload as SubmissionPayload);
    this.bump();
    this.send(ws, { type: 'ack', messageId: msg.messageId, ok: true, revision: doc.revision });
    await this.broadcast();
  }

  /** 제출 저장(학생·봇 공용): 마지막 유효 응답으로 교체, 자유 응답은 승인 대기열로 */
  private storeSubmission(pid: string, round: PhaseRound, phase: Phase, payload: SubmissionPayload) {
    const now = Date.now();
    // 마지막 유효 응답으로 교체 (1인 1표)
    this.sql.exec(
      `INSERT INTO submissions (round_id, participant_id, phase, payload, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(round_id, participant_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      round.roundId,
      pid,
      phase,
      JSON.stringify(stripText(payload)),
      now,
    );
    // 자유 응답은 별도 테이블(승인 대기)
    const texts: { kind: string; text: string }[] = [];
    if ('reason' in payload && payload.reason) texts.push({ kind: `${payload.kind}_reason`, text: payload.reason });
    if (payload.kind === 'post' && payload.changeNote) texts.push({ kind: 'post_change', text: payload.changeNote });
    for (const t of texts) {
      this.sql.exec(
        `INSERT INTO texts (id, round_id, participant_id, kind, text, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)
         ON CONFLICT(round_id, participant_id, kind) DO UPDATE SET text = excluded.text, status = 'pending', created_at = excluded.created_at`,
        `t_${randomToken(9)}`,
        round.roundId,
        pid,
        t.kind,
        t.text,
        now,
      );
    }
  }

  // ---------- 교사 명령 ----------

  private async handleTeacherCommand(ws: WebSocket, msg: Extract<ParsedClientMessage, { type: 'teacher' }>, doc: RoomDoc) {
    if (doc.recentMessageIds.includes(msg.messageId)) {
      this.send(ws, { type: 'ack', messageId: msg.messageId, ok: true, revision: doc.revision });
      return;
    }
    const FLOW_OPS = ['start', 'next', 'back', 'goto', 'reveal', 'rerun', 'decide', 'skip', 'end', 'close_submissions'];
    if (msg.expectedRevision !== undefined && FLOW_OPS.includes(msg.command.op) && msg.expectedRevision !== doc.flowRevision) {
      // 연타·늦게 도착한 명령: 최신 스냅샷만 다시 보낸다.
      this.send(ws, { type: 'ack', messageId: msg.messageId, ok: false, code: 'stale', message: '화면이 최신 상태가 아니어서 명령을 건너뛰었어요. 다시 확인해 주세요.' });
      this.sendSnapshot(ws, this.att(ws));
      return;
    }
    const c = msg.command;
    const now = Date.now();
    const round = doc.rounds[doc.phase];
    switch (c.op) {
      case 'start':
        if (doc.phase !== 'lobby') throw new CommandError('bad_state', '이미 시작했어요.');
        this.enterPhase(doc, 'intro');
        break;
      case 'next': {
        const reason = this.advanceBlockedReason(doc);
        if (reason) throw new CommandError('blocked', reason);
        const idx = phaseIndex(doc.phase);
        const nextPhase = PHASES[idx + 1];
        if (!nextPhase) throw new CommandError('bad_state', '마지막 장면이에요.');
        this.enterPhase(doc, nextPhase);
        break;
      }
      case 'back': {
        const idx = phaseIndex(doc.phase);
        if (idx <= 1) throw new CommandError('bad_state', '더 이전 장면이 없어요.');
        // 과거 장면은 보기만 가능: 기존 라운드를 그대로 유지(재개방 없음)
        doc.phase = PHASES[idx - 1]!;
        this.log('phase_back', { phase: doc.phase });
        break;
      }
      case 'goto': {
        const target = phaseIndex(c.phase);
        const cur = phaseIndex(doc.phase);
        if (target > cur) throw new CommandError('bad_state', '앞 장면으로 건너뛸 수 없어요. "다음 장면"을 사용해 주세요.');
        if (target < 1) throw new CommandError('bad_state', '대기실로는 돌아갈 수 없어요.');
        doc.phase = c.phase;
        this.log('phase_goto', { phase: doc.phase });
        break;
      }
      case 'lock_room':
        doc.locked = c.locked;
        this.log('room_lock', { locked: c.locked });
        break;
      case 'close_submissions':
        if (!round || round.locked) throw new CommandError('bad_state', '이미 마감됐어요.');
        round.locked = true;
        round.endsAt = null;
        round.pausedRemainingMs = null;
        this.log('closed', { phase: doc.phase, roundId: round.roundId });
        break;
      case 'reveal':
        if (!round) throw new CommandError('bad_state', '이 장면에는 공개할 활동이 없어요.');
        if (round.revealed) throw new CommandError('bad_state', '이미 공개했어요.');
        round.locked = true;
        round.endsAt = null;
        round.pausedRemainingMs = null;
        this.reveal(doc, round);
        break;
      case 'rerun': {
        if (!round) throw new CommandError('bad_state', '이 장면에는 활동이 없어요.');
        const limitTo = round.tie && round.tie.length > 1 ? round.tie : null;
        const seconds = c.seconds ?? 30;
        doc.rounds[doc.phase] = {
          roundId: newRoundId(doc.phase),
          startedAt: now,
          endsAt: now + seconds * 1000,
          pausedRemainingMs: null,
          locked: false,
          revealed: false,
          tie: null,
          limitTo,
          rerunCount: round.rerunCount + 1,
          durationSeconds: seconds,
        };
        delete doc.tallies[doc.phase];
        doc.paused = false;
        this.armBots(doc, 2500);
        this.log('rerun', { phase: doc.phase, limitTo, seconds });
        break;
      }
      case 'extend': {
        if (!round || round.revealed) throw new CommandError('bad_state', '지금은 시간을 연장할 수 없어요.');
        if (doc.paused) {
          round.pausedRemainingMs = (round.pausedRemainingMs ?? 0) + c.seconds * 1000;
        } else if (round.locked) {
          // 마감 후 연장: 같은 라운드를 다시 연다(공개 전이므로 허용)
          round.locked = false;
          round.endsAt = now + c.seconds * 1000;
        } else {
          round.endsAt = (round.endsAt ?? now) + c.seconds * 1000;
        }
        this.log('extend', { phase: doc.phase, seconds: c.seconds });
        break;
      }
      case 'pause':
        if (doc.paused) throw new CommandError('bad_state', '이미 일시정지 중이에요.');
        doc.paused = true;
        if (round && round.endsAt && !round.locked) {
          round.pausedRemainingMs = Math.max(0, round.endsAt - now);
          round.endsAt = null;
        }
        this.log('pause', {});
        break;
      case 'resume':
        if (!doc.paused) throw new CommandError('bad_state', '일시정지 상태가 아니에요.');
        doc.paused = false;
        this.armBots(doc, 1500);
        if (round && round.pausedRemainingMs !== null && !round.locked) {
          round.endsAt = now + round.pausedRemainingMs;
          round.pausedRemainingMs = null;
        }
        this.log('resume', {});
        break;
      case 'decide':
        if (!round) throw new CommandError('bad_state', '이 장면에는 결정할 활동이 없어요.');
        this.teacherDecide(doc, round, c.choice, c.reason);
        break;
      case 'skip':
        if (!round) throw new CommandError('bad_state', '이 장면에는 건너뛸 활동이 없어요.');
        if (DECISION_PHASES.includes(doc.phase)) throw new CommandError('bad_state', '이 활동은 건너뛸 수 없어요. 교사 결정으로 선택지를 정해 주세요.');
        round.locked = true;
        round.endsAt = null;
        round.revealed = true;
        round.tie = null;
        this.log('skip', { phase: doc.phase, reason: c.reason.slice(0, 200) });
        break;
      case 'moderate': {
        const r = this.sql.exec(`UPDATE texts SET status = ? WHERE id = ?`, c.status, c.textId);
        if (r.rowsWritten === 0) throw new CommandError('not_found', '해당 응답을 찾을 수 없어요.');
        break;
      }
      case 'sound_screen':
        doc.soundScreen = c.screen;
        break;
      case 'duck':
        doc.bgmDucked = c.ducked;
        break;
      case 'end':
        doc.phase = 'closed';
        doc.locked = true;
        this.log('ended', {});
        break;
      case 'add_bots':
        this.addBots(doc, c.count);
        break;
      case 'remove_bots':
        this.removeBots(doc);
        break;
      case 'delete_room':
        this.log('deleted', {});
        this.send(ws, { type: 'ack', messageId: msg.messageId, ok: true, revision: doc.revision + 1 });
        await this.wipe(true);
        return;
    }
    doc.recentMessageIds = [...doc.recentMessageIds.slice(-49), msg.messageId];
    if (FLOW_OPS.includes(c.op)) doc.flowRevision += 1;
    this.bump();
    this.send(ws, { type: 'ack', messageId: msg.messageId, ok: true, revision: doc.revision });
    await this.scheduleAlarm();
    await this.broadcast();
  }

  private enterPhase(doc: RoomDoc, phase: Phase) {
    doc.phase = phase;
    doc.paused = false;
    const meta = phaseMeta(phase);
    if (meta.activity && !doc.rounds[phase]) {
      const now = Date.now();
      doc.rounds[phase] = {
        roundId: newRoundId(phase),
        startedAt: now,
        endsAt: meta.defaultSeconds ? now + meta.defaultSeconds * 1000 : null,
        pausedRemainingMs: null,
        locked: false,
        revealed: false,
        tie: null,
        limitTo: null,
        rerunCount: 0,
        durationSeconds: meta.defaultSeconds,
      };
      this.armBots(doc, 2500);
    }
    if (phase === 'ending' && !doc.ending) doc.ending = this.buildEnding(doc);
    this.log('phase', { phase });
  }

  private advanceBlockedReason(doc: RoomDoc): string | null {
    const meta = phaseMeta(doc.phase);
    const round = doc.rounds[doc.phase];
    if (!meta.activity || !round) {
      if (doc.phase === 'r3_result' && !doc.allocations.r3) return '라운드 3 결과가 아직 없어요.';
      return null;
    }
    if (!round.revealed) return '먼저 결과를 공개하거나 활동을 건너뛰어 주세요.';
    if (round.tie && round.tie.length > 1) return '동률이에요. 30초 재투표 또는 교사 결정으로 정해 주세요.';
    if (doc.phase === 'r1_vote' && !doc.decisions.policy) return '배정 규칙이 아직 정해지지 않았어요.';
    if (doc.phase === 'r2_choose' && !doc.decisions.clues) return '공개할 조사 카드가 아직 정해지지 않았어요.';
    if (doc.phase === 'r3_vote' && !doc.decisions.pkg) return '새 규칙 패키지가 아직 정해지지 않았어요.';
    if (doc.phase === 'r4_questions' && !doc.decisions.questions) return '공동 질문이 아직 정해지지 않았어요.';
    return null;
  }

  private bump() {
    if (!this.doc) return;
    this.doc.revision += 1;
    this.saveDoc();
  }

  // ---------- 집계·공개 ----------

  private submissionsFor(roundId: string): { pid: string; payload: SubmissionPayload }[] {
    return this.sql
      .exec<{ participant_id: string; payload: string }>(`SELECT participant_id, payload FROM submissions WHERE round_id = ?`, roundId)
      .toArray()
      .map((r) => ({ pid: r.participant_id, payload: JSON.parse(r.payload) as SubmissionPayload }));
  }

  private reveal(doc: RoomDoc, round: PhaseRound) {
    const subs = this.submissionsFor(round.roundId);
    const eligible = this.participantCount();
    const phase = doc.phase;
    round.revealed = true;
    round.tie = null;
    switch (phase) {
      case 'practice': {
        doc.tallies[phase] = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, PRACTICE_OPTIONS.map((o) => o.id));
        break;
      }
      case 'pre_survey':
      case 'r5_post': {
        // 분포는 공개하지 않고 응답 수만 기록한다. (엔딩·교사 요약에서 3명 이상일 때 묶음으로만 표시)
        const t = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, SURVEY_OPTIONS.map((o) => o.id));
        doc.tallies[phase] = { ...t, counts: {}, top: [] };
        break;
      }
      case 'r1_vote': {
        const t = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, POLICIES.map((p) => p.id));
        doc.tallies[phase] = t;
        if (t.top.length === 1) this.applyPolicy(doc, t.top[0] as PolicyId, false);
        else round.tie = t.top.length > 1 ? t.top : [];
        break;
      }
      case 'r1_info': {
        const t = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, CLUES.map((c) => c.id));
        doc.tallies[phase] = t;
        doc.decisions.infoTop = t.top as ClueId[];
        break;
      }
      case 'r2_choose': {
        const picks = subs.map((s) => {
          const p = s.payload as Extract<SubmissionPayload, { kind: 'investigate' }>;
          return [p.first, p.second];
        });
        const t = tallyMulti(round.roundId, picks, eligible, CLUES.map((c) => c.id), 2);
        doc.tallies[phase] = { roundId: t.roundId, counts: t.counts, responded: t.responded, eligible: t.eligible, top: t.top, smallGroupsMerged: t.smallGroupsMerged };
        if (t.top.length === 2) this.applyClues(doc, t.top as ClueId[], false);
        else round.tie = t.top; // 0개(미응답) 또는 3개 이상(동률)
        break;
      }
      case 'r3_vote': {
        const t = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, PACKAGES.map((p) => p.id));
        doc.tallies[phase] = t;
        if (t.top.length === 1) this.applyPackage(doc, t.top[0] as PackageId, false);
        else round.tie = t.top.length > 1 ? t.top : [];
        break;
      }
      case 'r4_questions': {
        const picks = subs.map((s) => (s.payload as Extract<SubmissionPayload, { kind: 'questions' }>).picks as string[]);
        const t = tallyMulti(round.roundId, picks, eligible, QUESTION_CANDIDATES.map((q) => q.id), 2);
        doc.tallies[phase] = { roundId: t.roundId, counts: t.counts, responded: t.responded, eligible: t.eligible, top: t.top, smallGroupsMerged: t.smallGroupsMerged };
        if (t.top.length === 2) {
          doc.decisions.questions = t.top;
          doc.decisions.questionsByTeacher = false;
        } else round.tie = t.top;
        break;
      }
      case 'r4_transfer': {
        const t = tallyVotes(round.roundId, subs.map((s) => (s.payload as { choice: string }).choice), eligible, TRANSFER_SCENARIO.options.filter((o) => o.id !== 'abstain').map((o) => o.id));
        doc.tallies[phase] = t;
        doc.decisions.transferTop = t.top;
        break;
      }
      default:
        break;
    }
    this.log('reveal', { phase, roundId: round.roundId, responded: subs.length, eligible, tie: round.tie });
  }

  private teacherDecide(doc: RoomDoc, round: PhaseRound, choice: string, reason: string) {
    const phase = doc.phase;
    if (!DECISION_PHASES.includes(phase)) throw new CommandError('bad_state', '이 활동은 교사 결정 대상이 아니에요.');
    if (round.revealed && !round.tie && this.decisionMade(doc, phase)) throw new CommandError('bad_state', '이미 결정됐어요.');
    const record: TeacherDecision = { phase, roundId: round.roundId, choice, reason: reason.slice(0, 200), at: Date.now() };
    switch (phase) {
      case 'r1_vote':
        if (!POLICIES.some((p) => p.id === choice)) throw new CommandError('invalid', '알 수 없는 규칙이에요.');
        this.applyPolicy(doc, choice as PolicyId, true);
        break;
      case 'r2_choose': {
        const ids = choice.split(',').map((s) => s.trim()) as ClueId[];
        if (ids.length !== 2 || ids[0] === ids[1] || !ids.every((id) => CLUES.some((c) => c.id === id))) throw new CommandError('invalid', '서로 다른 조사 카드 2장을 골라 주세요.');
        this.applyClues(doc, ids, true);
        break;
      }
      case 'r3_vote':
        if (!PACKAGES.some((p) => p.id === choice)) throw new CommandError('invalid', '알 수 없는 패키지예요.');
        this.applyPackage(doc, choice as PackageId, true);
        break;
      case 'r4_questions': {
        const ids = choice.split(',').map((s) => s.trim());
        if (ids.length !== 2 || ids[0] === ids[1] || !ids.every((id) => QUESTION_CANDIDATES.some((q) => q.id === id))) throw new CommandError('invalid', '서로 다른 질문 2개를 골라 주세요.');
        doc.decisions.questions = ids;
        doc.decisions.questionsByTeacher = true;
        break;
      }
      default:
        break;
    }
    if (!round.revealed) {
      round.locked = true;
      round.endsAt = null;
      round.revealed = true;
      if (!doc.tallies[phase]) {
        doc.tallies[phase] = { roundId: round.roundId, counts: {}, responded: this.submissionsFor(round.roundId).length, eligible: this.participantCount(), top: [], smallGroupsMerged: false };
      }
    }
    round.tie = null;
    doc.teacherDecisions.push(record);
    this.log('teacher_decision', { phase, choice });
  }

  private decisionMade(doc: RoomDoc, phase: Phase): boolean {
    switch (phase) {
      case 'r1_vote':
        return !!doc.decisions.policy;
      case 'r2_choose':
        return !!doc.decisions.clues;
      case 'r3_vote':
        return !!doc.decisions.pkg;
      case 'r4_questions':
        return !!doc.decisions.questions;
      default:
        return true;
    }
  }

  private lottery(doc: RoomDoc): string[] {
    return makeLottery(doc.lotterySeed);
  }

  private applyPolicy(doc: RoomDoc, policy: PolicyId, byTeacher: boolean) {
    doc.decisions.policy = policy;
    doc.decisions.policyByTeacher = byTeacher;
    doc.allocations.r1 = r1Allocation(policy, this.lottery(doc));
    // 규칙이 바뀌면 이후 결과는 무효 (재실행 경로)
    delete doc.allocations.r3;
    delete doc.decisions.pkg;
  }

  private applyClues(doc: RoomDoc, clues: ClueId[], byTeacher: boolean) {
    doc.decisions.clues = clues;
    doc.decisions.cluesByTeacher = byTeacher;
  }

  private applyPackage(doc: RoomDoc, pkg: PackageId, byTeacher: boolean) {
    if (!doc.decisions.policy || !doc.allocations.r1) throw new CommandError('bad_state', '라운드 1 규칙이 먼저 정해져야 해요.');
    doc.decisions.pkg = pkg;
    doc.decisions.pkgByTeacher = byTeacher;
    const after = allocateByPackage(pkg, doc.decisions.policy, this.lottery(doc), BARRIERS);
    doc.allocations.r3 = compareAllocations(doc.allocations.r1, after);
  }

  private revealedClues(doc: RoomDoc): { revealed: RevealedClue[]; base: RevealedClue[] } {
    if (!doc.decisions.clues || phaseIndex(doc.phase) < phaseIndex('r2_reveal')) return { revealed: [], base: [] };
    const selected = new Set(doc.allocations.r1?.selected ?? []);
    const build = (id: ClueId): RevealedClue => {
      const s = CLUE_SECRETS.find((c) => c.id === id)!;
      return {
        id,
        evidence: s.evidence,
        reactions: s.reactions.map((r) => ({ applicantId: r.applicantId, text: selected.has(r.applicantId) ? r.whenSelected : r.whenWaiting })),
      };
    };
    const chosen = doc.decisions.clues;
    return {
      revealed: chosen.map(build),
      base: CLUES.filter((c) => !chosen.includes(c.id)).map((c) => build(c.id)),
    };
  }

  private buildEnding(doc: RoomDoc): EndingSummary {
    const pre = doc.rounds.pre_survey ? this.submissionsFor(doc.rounds.pre_survey.roundId) : [];
    const post = doc.rounds.r5_post ? this.submissionsFor(doc.rounds.r5_post.roundId) : [];
    const pkg = doc.decisions.pkg;
    const comparison = doc.allocations.r3;
    let openQuestion = pkg ? OPEN_QUESTION_BY_PACKAGE[pkg] : '우리는 아직 새 규칙을 정하지 못했어요. 다음 시간에 무엇부터 정해야 할까요?';
    if (comparison && comparison.lost.length > 0) {
      const names = comparison.lost.map((id) => APPLICANTS.find((a) => a.id === id)!.name).join('·');
      openQuestion = `${openQuestion} 그리고 새 규칙으로 자리를 잃은 ${names}에게는 무엇을 설명해야 할까요?`;
    }
    return {
      policyName: doc.decisions.policy ? policyById(doc.decisions.policy).name : '(정하지 못함)',
      pkgName: pkg ? packageById(pkg).name : '(정하지 못함)',
      questions: (doc.decisions.questions ?? []).map((id) => QUESTION_CANDIDATES.find((q) => q.id === id)?.text ?? id),
      openQuestion,
      surveyShift: surveyShift(
        pre.map((s) => (s.payload as { choice: string }).choice),
        post.map((s) => (s.payload as { choice: string }).choice),
      ),
      badges: {
        perspective: !!doc.rounds.r2_choose?.revealed,
        evidence: !!doc.decisions.clues,
        revision: !!doc.decisions.pkg,
      },
    };
  }

  private buildSummary(): TeacherSummary {
    const doc = this.requireDoc();
    const pre = doc.rounds.pre_survey ? this.submissionsFor(doc.rounds.pre_survey.roundId) : [];
    const post = doc.rounds.r5_post ? this.submissionsFor(doc.rounds.r5_post.roundId) : [];
    const preMap = new Map(pre.map((s) => [s.pid, (s.payload as { choice: string }).choice]));
    const pairs = post.flatMap((s) => {
      const b = preMap.get(s.pid);
      return b ? [{ before: b, after: (s.payload as { choice: string }).choice }] : [];
    });
    return {
      generatedAt: Date.now(),
      joined: this.participantCount(),
      decisions: doc.decisions,
      tallies: doc.tallies,
      surveyShift: surveyShift(
        pre.map((s) => (s.payload as { choice: string }).choice),
        post.map((s) => (s.payload as { choice: string }).choice),
      ),
      changeMatrix: changeMatrix(pairs),
      perspectiveBoard: this.perspectiveBoard(doc),
      approvedTexts: this.approvedTexts(doc),
    };
  }

  private perspectiveBoard(doc: RoomDoc) {
    const round = doc.rounds.r2_choose;
    if (!round || !round.revealed) return [];
    const rows = this.sql
      .exec<{ perspective: PerspectiveId; payload: string }>(
        `SELECT p.perspective AS perspective, s.payload AS payload FROM submissions s JOIN participants p ON p.id = s.participant_id WHERE s.round_id = ?`,
        round.roundId,
      )
      .toArray()
      .map((r) => ({ perspective: r.perspective, tag: (JSON.parse(r.payload) as { tag: string }).tag }));
    return perspectiveBoard(
      rows,
      PERSPECTIVES.map((p) => p.id),
    );
  }

  private approvedTexts(doc: RoomDoc): { kind: string; text: string }[] {
    const rows = this.sql.exec<{ kind: string; text: string }>(`SELECT kind, text FROM texts WHERE status = 'approved'`).toArray();
    // 식별자·시각 제거, 순서 섞기(회차별 고정 seed → 새로고침마다 바뀌지 않음)
    return shuffleWithSeed(rows, `${doc.lotterySeed}:${rows.length}`);
  }

  // ---------- 스냅샷 ----------

  private publicState(doc: RoomDoc): PublicState {
    const round = doc.rounds[doc.phase] ?? {
      roundId: `${doc.phase}-view`,
      startedAt: 0,
      endsAt: null,
      pausedRemainingMs: null,
      locked: true,
      revealed: true,
      tie: null,
      limitTo: null,
      rerunCount: 0,
      durationSeconds: null,
    };
    const responded = doc.rounds[doc.phase] ? Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?`, round.roundId).one().n) : 0;
    const clues = this.revealedClues(doc);
    const visibleTallies: Partial<Record<Phase, Tally>> = {};
    for (const [p, t] of Object.entries(doc.tallies) as [Phase, Tally][]) {
      // 공개된 라운드만, 사전·사후는 응답 수만
      if (PRIVATE_TALLY_PHASES.includes(p)) visibleTallies[p] = { ...t, counts: {}, top: [] };
      else visibleTallies[p] = t;
    }
    const pastR2 = phaseIndex(doc.phase) >= phaseIndex('r2_reveal');
    return {
      code: doc.code,
      appEnv: this.env.APP_ENV ?? 'development',
      phase: doc.phase,
      phaseIndex: phaseIndex(doc.phase),
      round,
      revision: doc.revision,
      flowRevision: doc.flowRevision,
      serverNow: Date.now(),
      joined: this.participantCount(),
      locked: doc.locked,
      paused: doc.paused,
      teacherConnected: this.teacherConnected(),
      soundScreen: doc.soundScreen,
      bgmDucked: doc.bgmDucked,
      responded,
      decisions: doc.decisions,
      teacherDecisions: doc.teacherDecisions,
      tallies: visibleTallies,
      allocations: {
        r1: phaseIndex(doc.phase) >= phaseIndex('r1_result') ? doc.allocations.r1 : undefined,
        r3: phaseIndex(doc.phase) >= phaseIndex('r3_result') ? doc.allocations.r3 : undefined,
      },
      revealedClues: clues.revealed,
      baseClues: clues.base,
      perspectiveBoard: pastR2 ? this.perspectiveBoard(doc) : [],
      approvedTexts: pastR2 ? this.approvedTexts(doc) : [],
      lottery: phaseIndex(doc.phase) >= phaseIndex('r1_result') ? this.lottery(doc) : [],
      ending: doc.phase === 'ending' || doc.phase === 'closed' ? doc.ending : undefined,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    };
  }

  private meState(doc: RoomDoc, pid: string, row?: ParticipantRow): MeState | null {
    const p = row ?? this.sql.exec<ParticipantRow>(`SELECT id, pseudonym, avatar, perspective, joined_at, last_seen FROM participants WHERE id = ?`, pid).toArray()[0];
    if (!p) return null;
    const submissions: MeState['submissions'] = {};
    const rows = this.sql
      .exec<{ round_id: string; phase: Phase; payload: string; updated_at: number }>(`SELECT round_id, phase, payload, updated_at FROM submissions WHERE participant_id = ?`, pid)
      .toArray();
    for (const r of rows) {
      const cur = doc.rounds[r.phase];
      if (cur && cur.roundId === r.round_id) submissions[r.phase] = { roundId: r.round_id, payload: JSON.parse(r.payload) as SubmissionPayload, at: Number(r.updated_at) };
    }
    const curRound = doc.rounds[doc.phase];
    return {
      participantId: p.id,
      pseudonym: p.pseudonym,
      avatar: p.avatar,
      perspective: p.perspective,
      submissions,
      submittedThisRound: !!(curRound && submissions[doc.phase]?.roundId === curRound.roundId),
      joinedAt: Number(p.joined_at),
    };
  }

  private teacherState(doc: RoomDoc): TeacherState {
    const pending = this.sql
      .exec<{ id: string; kind: string; text: string; status: 'pending' | 'approved' | 'hidden' }>(`SELECT id, kind, text, status FROM texts ORDER BY created_at DESC LIMIT 200`)
      .toArray();
    const connected = this.ctx.getWebSockets('student').filter((s) => this.att(s).authed).length;
    const reason = this.advanceBlockedReason(doc);
    const round = doc.rounds[doc.phase];
    return {
      publicToken: doc.publicToken,
      pendingTexts: shuffleWithSeed(pending, doc.lotterySeed),
      notes: TEACHER_NOTES[doc.phase] ?? null,
      participants: { connected, total: this.participantCount(), bots: this.botCount() },
      responseCount: round ? Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?`, round.roundId).one().n) : 0,
      canAdvance: !reason,
      advanceBlockedReason: reason,
      summary: doc.phase === 'ending' || doc.phase === 'closed' ? this.buildSummary() : undefined,
    };
  }

  private sendSnapshot(ws: WebSocket, att: Attachment) {
    const doc = this.requireDoc();
    const state = this.publicState(doc);
    this.sendRoleSnapshot(ws, att, doc, state);
  }

  private sendRoleSnapshot(ws: WebSocket, att: Attachment, doc: RoomDoc, state: PublicState, participants?: Map<string, ParticipantRow>) {
    if (att.role === 'student' && att.pid) {
      const me = this.meState(doc, att.pid, participants?.get(att.pid));
      if (!me) {
        this.send(ws, { type: 'error', code: 'unknown_student', message: '참가 정보가 삭제되었어요. 다시 입장해 주세요.', fatal: true });
        return;
      }
      this.send(ws, { type: 'snapshot', state, me });
    } else if (att.role === 'teacher') {
      this.send(ws, { type: 'snapshot', state, teacher: this.teacherState(doc) });
    } else {
      this.send(ws, { type: 'snapshot', state });
    }
  }

  /** 모든 소켓에 역할별 스냅샷 전송. 미인증 소켓은 유예 시간 후 닫는다. */
  private async broadcast() {
    if (!this.doc || this.doc.deleted) return;
    const doc = this.doc;
    const state = this.publicState(doc);
    const participants = new Map(
      this.sql
        .exec<ParticipantRow>(`SELECT id, pseudonym, avatar, perspective, joined_at, last_seen FROM participants`)
        .toArray()
        .map((r) => [r.id, r]),
    );
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.att(ws);
      if (!att.authed) {
        if (now - att.at > UNAUTH_GRACE_MS) {
          try {
            ws.close(4401, 'auth timeout');
          } catch {
            /* ignore */
          }
        }
        continue;
      }
      this.sendRoleSnapshot(ws, att, doc, state, participants);
    }
  }

  // ---------- 알람 (타이머 마감 · 만료 삭제) ----------

  private async scheduleAlarm() {
    const doc = this.doc;
    if (!doc || doc.deleted) return;
    let next = doc.expiresAt;
    const round = doc.rounds[doc.phase];
    if (round && round.endsAt && !round.locked && !doc.paused) next = Math.min(next, round.endsAt);
    if (doc.botsDueAt) next = Math.min(next, doc.botsDueAt);
    await this.ctx.storage.setAlarm(next);
  }

  async alarm(): Promise<void> {
    const doc = this.doc;
    if (!doc || doc.deleted) return;
    const now = Date.now();
    if (now >= doc.expiresAt) {
      this.log('expired_wipe', {});
      await this.wipe(true);
      return;
    }
    const round = doc.rounds[doc.phase];
    if (round && round.endsAt && now >= round.endsAt && !round.locked) {
      round.locked = true;
      round.endsAt = null;
      this.log('timeout', { phase: doc.phase, roundId: round.roundId });
      this.bump();
      await this.broadcast();
    }
    if (doc.botsDueAt && now >= doc.botsDueAt) await this.runBots(doc);
    await this.scheduleAlarm();
  }

  // ---------- 연습용 봇 ----------

  private botCount(): number {
    return Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM participants WHERE is_bot = 1`).one().n);
  }

  private armBots(doc: RoomDoc, delayMs: number) {
    if (this.botCount() === 0) {
      doc.botsDueAt = null;
      return;
    }
    doc.botsDueAt = Date.now() + delayMs;
  }

  private addBots(doc: RoomDoc, count: number) {
    if (doc.phase === 'closed') throw new CommandError('bad_state', '수업이 끝난 방에는 봇을 추가할 수 없어요.');
    const current = this.participantCount();
    const room = Math.max(0, MAX_STUDENTS - current);
    const n = Math.min(count, room);
    if (n === 0) throw new CommandError('full', `정원(${MAX_STUDENTS}명)이 차서 봇을 더 추가할 수 없어요.`);
    const used = new Set(this.sql.exec<{ pseudonym: string }>(`SELECT pseudonym FROM participants`).toArray().map((r) => r.pseudonym));
    const counts = new Map<PerspectiveId, number>(PERSPECTIVES.map((p) => [p.id, 0]));
    for (const r of this.sql.exec<{ perspective: PerspectiveId; n: number }>(`SELECT perspective, COUNT(*) AS n FROM participants GROUP BY perspective`).toArray()) {
      counts.set(r.perspective, Number(r.n));
    }
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      let pseudonym = '';
      for (let k = 0; k < 300 && !pseudonym; k++) {
        const cand = `${BOT_ADJ[Math.floor(Math.random() * BOT_ADJ.length)]} ${BOT_NOUNS[Math.floor(Math.random() * BOT_NOUNS.length)]} ${Math.floor(Math.random() * 90) + 10}`;
        if (!used.has(cand)) pseudonym = cand;
      }
      if (!pseudonym) pseudonym = `봇 ${current + i + 1}`;
      used.add(pseudonym);
      const min = Math.min(...counts.values());
      const pool = [...counts.entries()].filter(([, c]) => c === min).map(([p]) => p);
      const perspective = pool[Math.floor(Math.random() * pool.length)]!;
      counts.set(perspective, (counts.get(perspective) ?? 0) + 1);
      // 봇은 로그인할 수 없다: 토큰을 발급하지 않고 임의 값만 저장
      this.sql.exec(
        `INSERT INTO participants (id, token_hash, pseudonym, avatar, perspective, joined_at, last_seen, is_bot) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        `b_${randomToken(9)}`,
        `bot:${randomToken(24)}`,
        pseudonym,
        Math.floor(Math.random() * AVATAR_EMOJI.length),
        perspective,
        now,
        now,
      );
    }
    this.log('bots_added', { count: n });
    const round = doc.rounds[doc.phase];
    if (round && !round.locked && !round.revealed && !doc.paused) this.armBots(doc, 1500);
  }

  private removeBots(doc: RoomDoc) {
    // 봇의 제출·자유 응답까지 함께 제거한다.
    this.sql.exec(`DELETE FROM submissions WHERE participant_id IN (SELECT id FROM participants WHERE is_bot = 1)`);
    this.sql.exec(`DELETE FROM texts WHERE participant_id IN (SELECT id FROM participants WHERE is_bot = 1)`);
    const r = this.sql.exec(`DELETE FROM participants WHERE is_bot = 1`);
    doc.botsDueAt = null;
    this.log('bots_removed', { count: r.rowsWritten });
  }

  /** 아직 제출하지 않은 봇 일부가 제출한다. 남은 봇이 있으면 1~2초 뒤 다시 예약한다. */
  private async runBots(doc: RoomDoc) {
    doc.botsDueAt = null;
    const round = doc.rounds[doc.phase];
    const kind = PHASE_KIND[doc.phase];
    if (!round || !kind || round.locked || round.revealed || doc.paused) {
      this.saveDoc();
      return;
    }
    const pending = this.sql
      .exec<{ id: string; perspective: PerspectiveId }>(
        `SELECT id, perspective FROM participants WHERE is_bot = 1 AND id NOT IN (SELECT participant_id FROM submissions WHERE round_id = ?)`,
        round.roundId,
      )
      .toArray();
    if (pending.length === 0) {
      this.saveDoc();
      return;
    }
    const preRound = doc.rounds.pre_survey;
    const batch = pending.sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.ceil(pending.length / 3)));
    for (const b of batch) {
      let before: SurveyChoice | undefined;
      if (doc.phase === 'r5_post' && preRound) {
        const row = this.sql.exec<{ payload: string }>(`SELECT payload FROM submissions WHERE round_id = ? AND participant_id = ?`, preRound.roundId, b.id).toArray()[0];
        if (row) before = (JSON.parse(row.payload) as { choice: SurveyChoice }).choice;
      }
      const payload = botPayload(doc.phase, round, b.perspective, before);
      if (payload) this.storeSubmission(b.id, round, doc.phase, payload);
    }
    if (pending.length > batch.length) doc.botsDueAt = Date.now() + 1000 + Math.floor(Math.random() * 1200);
    this.bump();
    await this.broadcast();
  }

  /** 모든 데이터 삭제. 소켓에 안내 후 닫는다. */
  private async wipe(notify: boolean) {
    if (notify) {
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { type: 'kicked', reason: '선생님이 방을 정리했어요. 수고했어요!' });
        try {
          ws.close(4000, 'room deleted');
        } catch {
          /* ignore */
        }
      }
    }
    this.doc = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.initSchema();
  }

}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 제출 payload 에서 자유 응답을 떼어 낸다(별도 테이블에서 승인 관리). */
function stripText(p: SubmissionPayload): SubmissionPayload {
  if ('reason' in p) {
    const { reason: _r, ...rest } = p as SubmissionPayload & { reason?: string };
    if ('changeNote' in rest) {
      const { changeNote: _c, ...rest2 } = rest as SubmissionPayload & { changeNote?: string };
      return rest2 as SubmissionPayload;
    }
    return rest as SubmissionPayload;
  }
  return p;
}
