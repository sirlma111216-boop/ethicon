import type { ApiError, CreateRoomResponse, JoinRoomResponse } from '../../shared/types';

export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiFailure('offline', '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    const e = data as ApiError | null;
    throw new ApiFailure(e?.code ?? 'http', e?.error ?? `요청에 실패했어요 (${res.status}).`, res.status);
  }
  return data as T;
}

export const api = {
  createRoom: (secret?: string) => call<CreateRoomResponse>('/api/rooms', { method: 'POST', body: JSON.stringify({ secret }) }),
  roomStatus: (code: string) => call<{ exists: boolean; locked: boolean; joined: number; phase: string; expiresAt: number }>(`/api/rooms/${encodeURIComponent(code)}`),
  join: (code: string) => call<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: '{}' }),
  recoverTeacher: (code: string, token: string) =>
    call<{ ok: boolean; code: string; expiresAt: number; phase: string }>(`/api/rooms/${encodeURIComponent(code)}/teacher`, { method: 'POST', body: JSON.stringify({ token }) }),
  exportUrl: (code: string, token: string) => `/api/rooms/${encodeURIComponent(code)}/export?token=${encodeURIComponent(token)}`,
};
