// 극단적인 학급 선택 검증: 전원 보류, 전원 거부, 토큰 1개에서 한 카드 몰표, 질문 한 개 몰표,
// '그대로' 묶음 선택(자리 변화 없음), 과거 장면에서 재투표·결정 시도 차단.
// 사용: node scripts/edge-cases.mjs [baseUrl=http://localhost:5173]
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const WS_BASE = BASE.replace(/^http/, 'ws');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const api = async (p, init) => {
  const r = await fetch(BASE + p, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: r.status, body: await r.json().catch(() => null) };
};
function connect(code, role, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}&role=${role}`);
    const c = { ws, snap: null, pending: new Map(), ls: new Set() };
    const t = setTimeout(() => reject(new Error('connect timeout')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'snapshot') {
        c.snap = m;
        clearTimeout(t);
        resolve(c);
        for (const l of [...c.ls]) l(m);
      } else if (m.type === 'ack') c.pending.get(m.messageId)?.(m);
      else if (m.type === 'error' && m.fatal) reject(new Error(m.message));
    });
  });
}
const req = (c, msg) =>
  new Promise((resolve) => {
    const messageId = uuid();
    c.pending.set(messageId, resolve);
    c.ws.send(JSON.stringify({ ...msg, messageId }));
  });
const cmd = async (c, command) => {
  for (let i = 0; i < 4; i++) {
    const r = await req(c, { type: 'teacher', command, expectedRevision: c.snap.state.flowRevision });
    if (r.ok || r.code !== 'stale') return r;
    await sleep(250);
  }
  return { ok: false, code: 'stale' };
};
const waitFor = (c, pred, ms = 10000) =>
  new Promise((resolve, reject) => {
    if (c.snap && pred(c.snap)) return resolve(c.snap);
    const t = setTimeout(() => {
      c.ls.delete(l);
      reject(new Error('waitFor timeout'));
    }, ms);
    const l = (m) => {
      if (pred(m)) {
        clearTimeout(t);
        c.ls.delete(l);
        resolve(m);
      }
    };
    c.ls.add(l);
  });
const submitAll = (students, payloadOf) => Promise.all(students.map((s, i) => req(s, { type: 'submit', roundId: s.snap.state.round.roundId, phase: s.snap.state.phase, payload: payloadOf(i, s) })));
const revealed = (t) => waitFor(t, (s) => s.state.round.revealed);
const toPhase = async (t, students, phase) => {
  await cmd(t, { op: 'next' });
  await waitFor(t, (s) => s.state.phase === phase);
  await Promise.all(students.map((s) => waitFor(s, (x) => x.state.phase === phase)));
};

async function room(n) {
  const created = await api('/api/rooms', { method: 'POST', body: '{}' });
  const joins = await Promise.all(Array.from({ length: n }, () => api(`/api/rooms/${created.body.code}/join`, { method: 'POST', body: '{}' })));
  const t = await connect(created.body.code, 'teacher', created.body.teacherToken);
  const students = await Promise.all(joins.map((j) => connect(created.body.code, 'student', j.body.studentToken)));
  await cmd(t, { op: 'start' });
  await waitFor(t, (s) => s.state.phase === 'intro');
  return { t, students, code: created.body.code };
}

async function main() {
  // ---------- 시나리오 A: 전원 보류 → 교사 결정(거부) → 토큰 1개 몰표 → '그대로' 묶음 ----------
  {
    const { t, students } = await room(12);
    await toPhase(t, students, 'pre_check');
    await submitAll(students, () => ({ kind: 'precheck', choice: 'unsure' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    await toPhase(t, students, 'ai_verdict');
    await submitAll(students, () => ({ kind: 'verdict', choice: 'abstain' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    const tally = t.snap.state.tallies.ai_verdict;
    check('A1 전원 보류: tie=[] 이고 기권 수 = 응답 수 (화면은 "모두 보류" 문구)', Array.isArray(t.snap.state.round.tie) && t.snap.state.round.tie.length === 0 && tally.counts.abstain === tally.responded && tally.responded === 12, JSON.stringify(tally.counts));
    const blocked = await cmd(t, { op: 'next' });
    check('A2 보류 상태에서 다음 장면 차단', !blocked.ok && blocked.code === 'blocked', blocked.message);
    const rr = await cmd(t, { op: 'rerun', seconds: 30 });
    await waitFor(t, (s) => !s.state.round.revealed);
    check('A3 전원 보류 뒤 재투표는 선택지 제한 없음', rr.ok && t.snap.state.round.limitTo === null, '');
    await submitAll(students, () => ({ kind: 'verdict', choice: 'reject' }));
    await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.decisions.verdict === 'reject');
    check('A4 전원 거부 → 토큰 2', t.snap.state.decisions.tokens === 2, '');
    await toPhase(t, students, 'verdict_result');
    check('A5 거부 분기 장면 전달', t.snap.state.verdictScene?.verdict === 'reject' && t.snap.state.verdictScene.letters.length === 2, t.snap.state.verdictScene?.title);
    await toPhase(t, students, 'investigate');
    // 토큰 2인데 모두가 같은 두 장을 고름 → 정확히 2장 결정
    await submitAll(students, (i, s) => ({ kind: 'investigate', picks: ['explanation', 'experience'], tag: s.snap.me.perspective === 'applicant' ? 'why' : s.snap.me.perspective === 'newcomer' ? 'no_chance' : s.snap.me.perspective === 'organizer' ? 'time' : 'criteria' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    check('A6 몰표 두 장 → 그대로 결정, access 는 기본 자료로', JSON.stringify([...(t.snap.state.decisions.clues ?? [])].sort()) === JSON.stringify(['experience', 'explanation']), JSON.stringify(t.snap.state.decisions.clues));
    await toPhase(t, students, 'investigate_reveal');
    check('A7 열린 카드 2 + 기본 자료 2', students[0].snap.state.revealedClues.length === 2 && students[0].snap.state.baseClues.length === 2, '');
    await toPhase(t, students, 'redesign');
    await submitAll(students, () => ({ kind: 'package', choice: 'keep' }));
    await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.decisions.pkg === 'keep');
    await toPhase(t, students, 'redesign_result');
    const c = t.snap.state.allocations.r3;
    check('A8 "그대로" 묶음: 유리/불리 없음, 설명 시간 동일', c.gained.length === 0 && c.lost.length === 0 && c.after.explanationMinutes === c.before.explanationMinutes, '');
    // 과거 장면(ai_verdict)으로 돌아가 재투표·결정 시도 → 차단
    await cmd(t, { op: 'goto', phase: 'ai_verdict' });
    await waitFor(t, (s) => s.state.phase === 'ai_verdict');
    const rerunPast = await cmd(t, { op: 'rerun', seconds: 30 });
    const decidePast = await cmd(t, { op: 'decide', choice: 'approve', reason: 'x' });
    check('A9 과거 장면에서 재투표·결정 차단', !rerunPast.ok && rerunPast.code === 'bad_state' && !decidePast.ok, `${rerunPast.code}/${decidePast.code}`);
    check('A10 과거 장면 보기 중 결정값 유지', t.snap.state.decisions.verdict === 'reject' && t.snap.state.decisions.pkg === 'keep', '');
    await cmd(t, { op: 'goto', phase: 'redesign_result' });
    await waitFor(t, (s) => s.state.phase === 'redesign_result');
    await toPhase(t, students, 'transfer');
    // 질문 한 개 몰표 + 나머지 보류 → top 1개 → 교사가 2개 결정
    await submitAll(students, (i) => ({ kind: 'transfer', choice: i < 8 ? 'q_limits' : 'abstain' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    check('A11 질문 한 개만 뽑힘 → tie 길이 1 (화면은 "1개만 뽑혔어요")', Array.isArray(t.snap.state.round.tie) && t.snap.state.round.tie.length === 1, JSON.stringify(t.snap.state.round.tie));
    const one = await cmd(t, { op: 'decide', choice: 'q_limits', reason: 'x' });
    check('A12 교사 결정은 질문 2개 필요', !one.ok && one.code === 'invalid', one.code);
    await cmd(t, { op: 'decide', choice: 'q_limits,q_start', reason: '하나만 뽑혀 교사가 둘째를 정함' });
    await waitFor(t, (s) => s.state.decisions.questions?.length === 2);
    await toPhase(t, students, 'post_check');
    await submitAll(students, () => ({ kind: 'postcheck', choice: 'yes' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    await toPhase(t, students, 'ending');
    const e = t.snap.state.ending;
    check('A13 엔딩: 거부·그대로 조합의 문구가 서로 모순되지 않음', e.verdictLabel === '근거 없이 거부' && e.pkgName.startsWith('AI 추천 그대로') && e.gained.length === 0 && !e.openQuestion.includes('자리를 잃은') && e.principles[0].whatWeDid.includes('바꾸지 않기로'), JSON.stringify({ v: e.verdictLabel, p: e.pkgName, oq: e.openQuestion.slice(0, 40) }));
    check('A14 엔딩: 사전 전원 모르겠다 → 사후 전원 공정하다 분포 표시', e.surveyShift && e.surveyShift.before.unsure === 12 && e.surveyShift.after.yes === 12, JSON.stringify(e.surveyShift));
    await cmd(t, { op: 'delete_room' });
    students.forEach((s) => s.ws.close());
  }

  // ---------- 시나리오 B: 전원 승인(토큰 1) → 한 카드 몰표 → mix 묶음 → 편지 쓴 사람 들어옴 ----------
  {
    const { t, students } = await room(9);
    await toPhase(t, students, 'pre_check');
    await cmd(t, { op: 'skip', reason: '시간 부족' });
    await revealed(t);
    await toPhase(t, students, 'ai_verdict');
    await submitAll(students, () => ({ kind: 'verdict', choice: 'approve' }));
    await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.decisions.verdict === 'approve');
    check('B1 전원 승인 → 토큰 1', t.snap.state.decisions.tokens === 1, '');
    await toPhase(t, students, 'verdict_result');
    const letters = t.snap.state.verdictScene.letters.map((l) => l.applicantId);
    await toPhase(t, students, 'investigate');
    const two = await req(students[0], { type: 'submit', roundId: students[0].snap.state.round.roundId, phase: 'investigate', payload: { kind: 'investigate', picks: ['access', 'rules'], tag: 'why' } });
    check('B2 토큰 1개인데 두 장 제출 → 거부', !two.ok && two.code === 'invalid', two.code);
    await submitAll(students, (i, s) => ({ kind: 'investigate', picks: ['explanation'], tag: s.snap.me.perspective === 'applicant' ? 'why' : s.snap.me.perspective === 'newcomer' ? 'no_chance' : s.snap.me.perspective === 'organizer' ? 'time' : 'criteria' }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    await toPhase(t, students, 'investigate_reveal');
    check('B3 열린 카드 1장(explanation) + 기본 자료 3장', students[0].snap.state.revealedClues.length === 1 && students[0].snap.state.revealedClues[0].id === 'explanation' && students[0].snap.state.baseClues.length === 3, '');
    await toPhase(t, students, 'redesign');
    await submitAll(students, () => ({ kind: 'package', choice: 'mix' }));
    await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.decisions.pkg === 'mix');
    await toPhase(t, students, 'redesign_result');
    const c = t.snap.state.allocations.r3;
    const lettersIn = letters.filter((id) => c.after.selected.includes(id));
    check('B4 승인→mix: 편지 쓴 신청자 중 일부가 새로 들어오고, 잃은 사람이 함께 표시됨', lettersIn.length > 0 && c.lost.length === c.gained.length && c.lost.length > 0, `in=${lettersIn} lost=${c.lost}`);
    await toPhase(t, students, 'transfer');
    await submitAll(students, (i) => ({ kind: 'transfer', choice: ['q_start', 'q_appeal', 'q_data'][i % 3] }));
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    check('B5 세 질문 동률(3:3:3) → tie 3개', t.snap.state.round.tie?.length === 3, JSON.stringify(t.snap.state.round.tie));
    await cmd(t, { op: 'rerun', seconds: 30 });
    await waitFor(t, (s) => !s.state.round.revealed);
    await Promise.all(students.map((s) => waitFor(s, (x) => !x.state.round.revealed)));
    const outside = await req(students[0], { type: 'submit', roundId: students[0].snap.state.round.roundId, phase: 'transfer', payload: { kind: 'transfer', choice: 'q_tie' } });
    check('B6 재투표에서 동률 밖 질문 거부', !outside.ok && outside.code === 'not_allowed', outside.code);
    await submitAll(students, (i) => ({ kind: 'transfer', choice: i < 5 ? 'q_start' : 'q_appeal' }));
    await cmd(t, { op: 'reveal' });
    await waitFor(t, (s) => s.state.decisions.questions?.length === 2);
    await toPhase(t, students, 'post_check');
    await cmd(t, { op: 'reveal' });
    await revealed(t);
    await toPhase(t, students, 'ending');
    const e = t.snap.state.ending;
    check('B7 엔딩: 사전 건너뜀 → 분포 null, 승인·mix 문구와 자리 잃은 사람 이름 포함', e.surveyShift === null && e.verdictLabel === '확인 없이 승인' && e.openQuestion.includes('자리를 잃은') && e.lost.length === e.gained.length && e.lost.length > 0, JSON.stringify({ oq: e.openQuestion.slice(-60), lost: e.lost }));
    await cmd(t, { op: 'delete_room' });
    students.forEach((s) => s.ws.close());
  }
}

main()
  .catch((e) => check('예외 없이 완료', false, e.message))
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n결과: ${passed}/${results.length} 통과`);
    process.exit(passed === results.length ? 0 : 1);
  });
