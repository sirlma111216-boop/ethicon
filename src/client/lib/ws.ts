// 방 WebSocket 클라이언트: 인증, 재연결, 서버 시각 보정, ack 기반 제출.
import type { ClientMessage, MeState, PublicState, Role, ServerMessage, TeacherState } from '../../shared/types';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'fatal';

export interface RoomSnapshot {
  state: PublicState;
  me?: MeState;
  teacher?: TeacherState;
}

export interface RoomEvents {
  snapshot: (s: RoomSnapshot) => void;
  status: (s: ConnStatus, detail?: { code: string; message: string }) => void;
  kicked: (reason: string) => void;
}

type AckWaiter = { resolve: (v: { ok: true; revision: number } | { ok: false; code: string; message: string }) => void; timer: number };

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private closedByUser = false;
  private waiters = new Map<string, AckWaiter>();
  private listeners: { [K in keyof RoomEvents]: Set<RoomEvents[K]> } = { snapshot: new Set(), status: new Set(), kicked: new Set() };
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  /** serverNow - Date.now() */
  offsetMs = 0;
  status: ConnStatus = 'connecting';
  fatal: { code: string; message: string } | null = null;

  constructor(
    private code: string,
    private role: Role,
    private token: string,
  ) {}

  on<K extends keyof RoomEvents>(ev: K, fn: RoomEvents[K]): () => void {
    this.listeners[ev].add(fn);
    return () => this.listeners[ev].delete(fn);
  }

  private emitStatus(s: ConnStatus, detail?: { code: string; message: string }) {
    this.status = s;
    for (const fn of this.listeners.status) fn(s, detail);
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    if (this.closedByUser) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?code=${encodeURIComponent(this.code)}&role=${this.role}`;
    this.emitStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      // 토큰은 첫 메시지로만 보낸다.
      ws.send(JSON.stringify({ type: 'auth', token: this.token }));
      this.startPing();
    };
    ws.onmessage = (ev) => this.handle(ev.data as string);
    ws.onclose = (ev) => {
      this.stopPing();
      this.failAllWaiters('disconnected', '연결이 끊겨 제출이 확인되지 않았어요.');
      if (this.closedByUser || this.fatal) return;
      // 4xxx 코드는 서버가 의도적으로 닫은 경우
      if (ev.code === 4409 || ev.code === 4000) return;
      if (ev.code === 4403 || ev.code === 4404 || ev.code === 4410 || ev.code === 4401) {
        if (!this.fatal) this.setFatal('closed', '서버가 연결을 종료했어요. 다시 입장해 주세요.');
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose 가 이어서 호출됨 */
    };
  }

  private setFatal(code: string, message: string) {
    this.fatal = { code, message };
    this.emitStatus('fatal', this.fatal);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.attempts += 1;
    const delay = Math.min(8000, 500 * 2 ** Math.min(this.attempts, 4)) + Math.random() * 300;
    this.emitStatus('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }));
    }, 25_000);
  }
  private stopPing() {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private handle(raw: string) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'snapshot': {
        this.offsetMs = msg.state.serverNow - Date.now();
        if (this.status !== 'open') {
          this.attempts = 0;
          this.emitStatus('open');
        }
        for (const fn of this.listeners.snapshot) fn({ state: msg.state, me: msg.me, teacher: msg.teacher });
        break;
      }
      case 'ack': {
        const w = this.waiters.get(msg.messageId);
        if (w) {
          window.clearTimeout(w.timer);
          this.waiters.delete(msg.messageId);
          w.resolve(msg.ok ? { ok: true, revision: msg.revision } : { ok: false, code: msg.code, message: msg.message });
        }
        break;
      }
      case 'pong':
        this.offsetMs = msg.serverNow - Date.now();
        break;
      case 'error':
        if (msg.fatal) this.setFatal(msg.code, msg.message);
        else for (const fn of this.listeners.status) fn(this.status, { code: msg.code, message: msg.message });
        break;
      case 'kicked':
        this.closedByUser = true;
        for (const fn of this.listeners.kicked) fn(msg.reason);
        this.emitStatus('closed');
        break;
    }
  }

  private failAllWaiters(code: string, message: string) {
    for (const [id, w] of this.waiters) {
      window.clearTimeout(w.timer);
      w.resolve({ ok: false, code, message });
      this.waiters.delete(id);
    }
  }

  /** ack 를 기다리는 전송. 연결이 없으면 즉시 실패를 돌려준다(성공처럼 보이지 않게). */
  request(msg: ClientMessage & { messageId: string }, timeoutMs = 8000): Promise<{ ok: true; revision: number } | { ok: false; code: string; message: string }> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, code: 'offline', message: '연결이 끊겨 있어요. 다시 연결되면 다시 제출해 주세요.' });
        return;
      }
      const timer = window.setTimeout(() => {
        this.waiters.delete(msg.messageId);
        resolve({ ok: false, code: 'timeout', message: '서버 응답이 없어요. 제출이 확인되지 않았어요. 다시 시도해 주세요.' });
      }, timeoutMs);
      this.waiters.set(msg.messageId, { resolve, timer });
      this.ws.send(JSON.stringify(msg));
    });
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  close() {
    this.closedByUser = true;
    this.stopPing();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'bye');
    this.emitStatus('closed');
  }
}
