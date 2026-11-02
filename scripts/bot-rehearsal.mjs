// 연습용 봇 검증: 교사 혼자 봇 N명을 추가하고 전 과정을 진행했을 때
// 봇이 매 활동마다 제출하고, 집계·결정·엔딩이 만들어지는지 확인한다.
// 사용: node scripts/bot-rehearsal.mjs [baseUrl=http://localhost:5173] [bots=25]
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const BOTS = Number(process.argv[3] ?? 25);
const WS_BASE = BASE.replace(/^http/, 'ws');
const results = [];
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(6)}ms]`, ...a);
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  log(ok ? 'PASS' : 'FAIL', name, detail);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: await res.json().catch(() => null) };
};

function connect(code, role, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}&role=${role}`);
    const c = { ws, snap: null, pending: new Map(), listeners: new Set() };
    const timer = setTimeout(() => reject(new Error('connect timeout')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot') {
        c.snap = m;
        clearTimeout(timer);
        resolve(c);
        for (const l of [...c.listeners]) l(m);
      } else if (m.type === 'ack') c.pending.get(m.messageId)?.(m);
      else if (m.type === 'error' && m.fatal) reject(new Error(m.message));
    });
  });
}
const cmd = (c, command) =>
  new Promise((resolve) => {
    const messageId = uuid();
    c.pending.set(messageId, resolve);
    c.ws.send(JSON.stringify({ type: 'teacher', messageId, expectedRevision: c.snap.state.flowRevision, command }));
  });
const waitFor = (c, pred, ms = 20000) =>
  new Promise((resolve, reject) => {
    if (c.snap && pred(c.snap)) return resolve(c.snap);
    const timer = setTimeout(() => {
      c.listeners.delete(l);
      reject(new Error('waitFor timeout'));
    }, ms);
    const l = (m) => {
      if (pred(m)) {
        clearTimeout(timer);
        c.listeners.delete(l);
        resolve(m);
      }
    };
    c.listeners.add(l);
  });

async function main() {
  const created = await api('/api/rooms', { method: 'POST', body: '{}' });
  const { code, teacherToken } = created.body;
  const t = await connect(code, 'teacher', teacherToken);
  check('봇 0명으로 시작', t.snap.teacher.participants.bots === 0, '');
  let r = await cmd(t, { op: 'add_bots', count: BOTS });
  await waitFor(t, (s) => s.teacher.participants.bots === BOTS);
  check(`봇 ${BOTS}명 추가`, r.ok && t.snap.state.joined === BOTS, `joined=${t.snap.state.joined}`);
  const over = await cmd(t, { op: 'add_bots', count: 40 });
  await sleep(300);
  check('정원 40 초과 봇 추가 불가', t.snap.teacher.participants.bots <= 40, `bots=${t.snap.teacher.participants.bots} ack=${over.ok}`);
  // 40명 넘게 추가하려던 것은 정원까지만 채워진다. 검증을 위해 다시 BOTS 명으로 맞춘다.
  await cmd(t, { op: 'remove_bots' });
  await waitFor(t, (s) => s.teacher.participants.bots === 0);
  check('봇 제거', t.snap.state.joined === 0, '');
  await cmd(t, { op: 'add_bots', count: BOTS });
  await waitFor(t, (s) => s.teacher.participants.bots === BOTS);

  await cmd(t, { op: 'start' });
  await waitFor(t, (s) => s.state.phase === 'intro');

  const activityPhases = ['practice', 'pre_survey', 'r1_vote', 'r1_info', 'r2_choose', 'r3_vote', 'r4_questions', 'r4_transfer', 'r5_post'];
  const timings = {};
  while (t.snap.state.phase !== 'ending') {
    const before = t.snap.state.phase;
    r = await cmd(t, { op: 'next' });
    if (!r.ok) throw new Error(`next 실패 at ${before}: ${r.code} ${r.message}`);
    await waitFor(t, (s) => s.state.phase !== before);
    const phase = t.snap.state.phase;
    if (!activityPhases.includes(phase)) continue;
    const started = Date.now();
    try {
      await waitFor(t, (s) => s.teacher.responseCount >= BOTS, 30000);
    } catch {
      /* 아래 check 에서 실패로 기록 */
    }
    timings[phase] = Date.now() - started;
    check(`${phase}: 봇 ${BOTS}명 전원 제출`, t.snap.teacher.responseCount === BOTS, `${t.snap.teacher.responseCount}/${BOTS} in ${timings[phase]}ms`);
    r = await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.round.revealed);
    const round = t.snap.state.round;
    if (round.tie && round.tie.length !== 0) {
      // 동률: 재투표 한 번 → 여전히 동률이면 교사 결정
      await cmd(t, { op: 'rerun', seconds: 30 });
      await waitFor(t, (s) => !s.state.round.revealed);
      try {
        await waitFor(t, (s) => s.teacher.responseCount >= BOTS, 30000);
      } catch {
        /* ignore */
      }
      check(`${phase}: 재투표에서도 봇 제출`, t.snap.teacher.responseCount > 0, `${t.snap.teacher.responseCount}`);
      await cmd(t, { op: 'reveal' });
      await waitFor(t, (s) => s.state.round.revealed);
      if (t.snap.state.round.tie) {
        const tie = t.snap.state.round.tie;
        const choice = phase === 'r2_choose' || phase === 'r4_questions' ? tie.slice(0, 2).join(',') : tie[0];
        await cmd(t, { op: 'decide', choice, reason: '리허설 동률 처리' });
        await waitFor(t, (s) => !s.state.round.tie);
      }
    }
    if (t.snap.state.round.tie && t.snap.state.round.tie.length === 0) {
      check(`${phase}: 응답 없음 상태가 아님`, false, '');
    }
  }
  const e = t.snap.state.ending;
  check('엔딩 생성 (규칙·질문 2개·남은 질문)', !!e && e.questions.length === 2 && e.pkgName.length > 0, JSON.stringify({ pkg: e?.pkgName, q: e?.questions?.length }));
  check('사전·사후 분포 생성 (3명 이상)', !!e?.surveyShift, JSON.stringify(e?.surveyShift));
  const s = t.snap.teacher.summary;
  check('교사 요약 유지/변화 묶음', !!s?.changeMatrix && s.changeMatrix.kept + s.changeMatrix.changed === BOTS, JSON.stringify(s?.changeMatrix));
  check('자유 응답 대기열에 봇 응답 존재', t.snap.teacher.pendingTexts.length > 0, `${t.snap.teacher.pendingTexts.length}`);
  check('관점 보드 4종 응답', t.snap.state.perspectiveBoard.length === 4 && t.snap.state.perspectiveBoard.every((b) => b.responded > 0), JSON.stringify(t.snap.state.perspectiveBoard.map((b) => b.responded)));
  await cmd(t, { op: 'delete_room' });
  log('제출 소요(ms)', JSON.stringify(timings));
  t.ws.close();
}

main()
  .catch((e) => check('예외 없이 완료', false, e.message))
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n결과: ${passed}/${results.length} 통과`);
    process.exit(passed === results.length ? 0 : 1);
  });
