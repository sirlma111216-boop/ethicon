// 서버 재시작(또는 hibernation) 전후 상태 복원 검사.
// 1단계: node scripts/restart-check.mjs prepare  → 방을 만들고 r1_vote 까지 진행, 상태를 test-results/restart-state.json 에 저장
// (여기서 서버를 재시작한다)
// 2단계: node scripts/restart-check.mjs verify   → 같은 자격으로 재접속해 phase·roundId·제출 상태가 같은지 확인
import { readFileSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const WS_BASE = BASE.replace(/^http/, 'ws');
const mode = process.argv[2] ?? 'prepare';
const FILE = 'test-results/restart-state.json';

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: await res.json().catch(() => null) };
};
function connect(code, role, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}&role=${role}`);
    const timer = setTimeout(() => reject(new Error('timeout')), 10000);
    const client = { ws, snap: null, pending: new Map() };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot') {
        client.snap = m;
        clearTimeout(timer);
        resolve(client);
      } else if (m.type === 'ack') client.pending.get(m.messageId)?.(m);
      else if (m.type === 'error' && m.fatal) reject(new Error(m.message));
    });
  });
}
const request = (c, msg) =>
  new Promise((resolve) => {
    const messageId = Math.random().toString(36).slice(2);
    c.pending.set(messageId, resolve);
    c.ws.send(JSON.stringify({ ...msg, messageId }));
  });
const waitFor = (c, pred) =>
  new Promise((resolve) => {
    const h = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot') {
        c.snap = m;
        if (pred(m)) {
          c.ws.off('message', h);
          resolve(m);
        }
      }
    };
    c.ws.on('message', h);
    if (c.snap && pred(c.snap)) {
      c.ws.off('message', h);
      resolve(c.snap);
    }
  });

if (mode === 'prepare') {
  const created = await api('/api/rooms', { method: 'POST', body: '{}' });
  const { code, teacherToken, publicToken } = created.body;
  const joins = await Promise.all([0, 1, 2].map(() => api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' })));
  const t = await connect(code, 'teacher', teacherToken);
  const students = await Promise.all(joins.map((j) => connect(code, 'student', j.body.studentToken)));
  await request(t, { type: 'teacher', command: { op: 'start' } });
  await waitFor(t, (s) => s.state.phase === 'intro');
  for (const target of ['practice', 'pre_survey', 'r1_vote']) {
    if (t.snap.state.round && t.snap.state.phase !== 'intro' && !t.snap.state.round.revealed) {
      await request(t, { type: 'teacher', command: { op: 'reveal' } });
      await waitFor(t, (s) => s.state.round.revealed);
    }
    await request(t, { type: 'teacher', command: { op: 'next' } });
    await waitFor(t, (s) => s.state.phase === target);
  }
  await Promise.all(students.map((s) => waitFor(s, (x) => x.state.phase === 'r1_vote')));
  const ack = await request(students[0], { type: 'submit', roundId: t.snap.state.round.roundId, phase: 'r1_vote', payload: { kind: 'policy', choice: 'newcomer' } });
  await request(t, { type: 'teacher', command: { op: 'pause' } });
  await waitFor(t, (s) => s.state.paused);
  const saved = {
    code,
    teacherToken,
    publicToken,
    studentToken: joins[0].body.studentToken,
    pseudonym: joins[0].body.pseudonym,
    phase: t.snap.state.phase,
    roundId: t.snap.state.round.roundId,
    pausedRemainingMs: t.snap.state.round.pausedRemainingMs,
    revision: t.snap.state.revision,
    joined: t.snap.state.joined,
    submitAck: ack.ok,
    at: Date.now(),
  };
  writeFileSync(FILE, JSON.stringify(saved, null, 2));
  console.log('prepared', saved);
  t.ws.close();
  students.forEach((s) => s.ws.close());
  process.exit(0);
}

if (mode === 'verify') {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  const t = await connect(saved.code, 'teacher', saved.teacherToken);
  const s = await connect(saved.code, 'student', saved.studentToken);
  const b = await connect(saved.code, 'public', saved.publicToken);
  const checks = [
    ['교사 재접속: 같은 단계', t.snap.state.phase === saved.phase, `${t.snap.state.phase}`],
    ['같은 roundId', t.snap.state.round.roundId === saved.roundId, t.snap.state.round.roundId],
    ['일시정지 남은 시간 보존', t.snap.state.paused && t.snap.state.round.pausedRemainingMs === saved.pausedRemainingMs, `${t.snap.state.round.pausedRemainingMs}`],
    ['참여 인원 보존', t.snap.state.joined === saved.joined, `${t.snap.state.joined}`],
    ['학생 가명·제출 상태 복원', s.snap.me.pseudonym === saved.pseudonym && s.snap.me.submittedThisRound === true, s.snap.me.pseudonym],
    ['공개 화면 재접속', b.snap.state.phase === saved.phase, ''],
  ];
  // 재개 후 제출이 계속 동작하는지
  await request(t, { type: 'teacher', command: { op: 'resume' } });
  await waitFor(t, (x) => !x.state.paused);
  const ack = await request(s, { type: 'submit', roundId: saved.roundId, phase: 'r1_vote', payload: { kind: 'policy', choice: 'first' } });
  checks.push(['재개 후 제출 정상', ack.ok === true, ack.code ?? 'ok']);
  await request(t, { type: 'teacher', command: { op: 'delete_room' } });
  let ok = 0;
  for (const [name, pass, detail] of checks) {
    console.log(pass ? 'PASS' : 'FAIL', name, detail);
    if (pass) ok++;
  }
  console.log(`결과: ${ok}/${checks.length}`);
  process.exit(ok === checks.length ? 0 : 1);
}
