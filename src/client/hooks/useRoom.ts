import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Phase, Role, SubmissionPayload, TeacherCommandBody } from '../../shared/types';
import { RoomSocket, uuid, type ConnStatus, type RoomSnapshot } from '../lib/ws';

export interface RoomHandle {
  snap: RoomSnapshot | null;
  status: ConnStatus;
  fatal: { code: string; message: string } | null;
  notice: { code: string; message: string } | null;
  kicked: string | null;
  serverNow: () => number;
  submit: (phase: Phase, roundId: string, payload: SubmissionPayload) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  command: (body: TeacherCommandBody, opts?: { expectRevision?: boolean }) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  reconnect: () => void;
}

export function useRoom(code: string | null, role: Role, token: string | null): RoomHandle {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ code: string; message: string } | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const sockRef = useRef<RoomSocket | null>(null);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (!code || !token) return;
    const sock = new RoomSocket(code, role, token);
    sockRef.current = sock;
    const offs = [
      sock.on('snapshot', (s) => setSnap(s)),
      sock.on('status', (s, detail) => {
        setStatus(s);
        if (s === 'fatal' && detail) setFatal(detail);
        else if (detail) {
          setNotice(detail);
          window.setTimeout(() => setNotice(null), 6000);
        }
      }),
      sock.on('kicked', (r) => setKicked(r)),
    ];
    sock.connect();
    return () => {
      offs.forEach((f) => f());
      sock.close();
      sockRef.current = null;
    };
  }, [code, role, token, gen]);

  const submit = useCallback<RoomHandle['submit']>(async (phase, roundId, payload) => {
    const sock = sockRef.current;
    if (!sock) return { ok: false, code: 'offline', message: '연결이 없어요.' };
    const r = await sock.request({ type: 'submit', messageId: uuid(), roundId, phase, payload });
    return r.ok ? { ok: true } : r;
  }, []);

  const command = useCallback<RoomHandle['command']>(async (body, opts) => {
    const sock = sockRef.current;
    if (!sock) return { ok: false, code: 'offline', message: '연결이 없어요.' };
    const expectedRevision = opts?.expectRevision === false ? undefined : snapRef.current?.state.flowRevision;
    const r = await sock.request({ type: 'teacher', messageId: uuid(), expectedRevision, command: body });
    return r.ok ? { ok: true } : r;
  }, []);

  const snapRef = useRef<RoomSnapshot | null>(null);
  snapRef.current = snap;

  const serverNow = useCallback(() => sockRef.current?.serverNow() ?? Date.now(), []);
  const reconnect = useCallback(() => {
    setFatal(null);
    setKicked(null);
    setGen((g) => g + 1);
  }, []);

  return useMemo(() => ({ snap, status, fatal, notice, kicked, serverNow, submit, command, reconnect }), [snap, status, fatal, notice, kicked, serverNow, submit, command, reconnect]);
}
