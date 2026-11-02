// 멀티플레이 시뮬레이션(개편판): 교사 1 + 학생 N + 공개 화면 1 을 독립 WebSocket 으로 연결해
// 입장 → 결정 1~6 → 분기 → 집계 → 엔딩 → 삭제 전 과정을 자동 실행하고 검증한다.
// 사용: node scripts/sim.mjs [baseUrl=http://localhost:5173] [students=40] [verdict=approve|investigate|reject]
// 로컬/스테이징 서버 대상의 기술 검증이며, 실제 학급 수업 실증이 아니다.
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const N = Number(process.argv[3] ?? 40);
const VERDICT = process.argv[4] ?? 'approve';
const WS_BASE = BASE.replace(/^http/, 'ws');
const results = [];
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(6)}ms]`, ...a);
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(ok ? 'PASS' : 'FAIL', name, detail);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

class Client {
  constructor(code, role, token, name) {
    Object.assign(this, { code, role, token, name, snap: null, waiters: new Map(), closedCode: null, errors: [], kicked: null, listeners: new Set() });
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws?code=${this.code}&role=${this.role}`);
      const to = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 15000);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'auth', token: this.token })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'snapshot') {
          this.snap = m;
          if (!this.ready) {
            this.ready = true;
            clearTimeout(to);
            resolve();
          }
          for (const l of [...this.listeners]) l(m);
        } else if (m.type === 'ack') {
          const w = this.waiters.get(m.messageId);
          if (w) {
            this.waiters.delete(m.messageId);
            w(m);
          }
        } else if (m.type === 'error') {
          this.errors.push(m);
          if (m.fatal) {
            clearTimeout(to);
            reject(new Error(`${this.name}: ${m.code} ${m.message}`));
          }
        } else if (m.type === 'kicked') this.kicked = m.reason;
      });
      this.ws.on('close', (c) => (this.closedCode = c));
      this.ws.on('error', (e) => this.errors.push({ code: 'socket', message: e.message }));
    });
  }
  request(msg) {
    return new Promise((resolve) => {
      const messageId = uuid();
      const timer = setTimeout(() => {
        this.waiters.delete(messageId);
        resolve({ ok: false, code: 'timeout' });
      }, 15000);
      this.waiters.set(messageId, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.ws.send(JSON.stringify({ ...msg, messageId }));
    });
  }
  submit(payload) {
    const s = this.snap.state;
    return this.request({ type: 'submit', roundId: s.round.roundId, phase: s.phase, payload });
  }
  async cmd(command) {
    // 교사 화면의 스냅샷이 아직 도착하지 않았을 수 있으므로 stale 이면 새 스냅샷으로 다시 시도한다(실제 UI 와 같은 동작).
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await this.request({ type: 'teacher', command, expectedRevision: this.snap.state.flowRevision });
      if (r.ok || r.code !== 'stale') {
        if (!r.ok) log(`  (cmd ${command.op} → ${r.code}: ${r.message ?? ''})`);
        return r;
      }
      await sleep(300);
    }
    return { ok: false, code: 'stale' };
  }
  waitFor(pred, ms = 10000) {
    if (this.snap && pred(this.snap)) return Promise.resolve(this.snap);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.listeners.delete(l);
        reject(new Error(`${this.name}: waitFor timeout`));
      }, ms);
      const l = (m) => {
        if (pred(m)) {
          clearTimeout(to);
          this.listeners.delete(l);
          resolve(m);
        }
      };
      this.listeners.add(l);
    });
  }
  close() {
    this.ws?.close(1000);
  }
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  log(`대상 ${BASE}, 학생 ${N}명, 결정 2 시나리오=${VERDICT}`);
  const created = await api('/api/rooms', { method: 'POST', body: '{}' });
  check('방 생성 201', created.status === 201, JSON.stringify(created.body).slice(0, 60));
  const { code, teacherToken, publicToken } = created.body;
  check('코드 6자리·혼동 문자 제외', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code), code);
  const bad = await api('/api/rooms/ZZZZZZ/join', { method: 'POST', body: '{}' });
  check('없는 방 입장 → 404 한국어 안내', bad.status === 404 && /방을 찾을 수 없어요/.test(bad.body?.error ?? ''), bad.body?.error);

  const joins = await Promise.all(Array.from({ length: N }, () => api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' })));
  check(`학생 ${N}명 입장 성공`, joins.every((j) => j.status === 200), `${joins.filter((j) => j.status === 200).length}/${N}`);
  check('가명 중복 없음', new Set(joins.map((j) => j.body.pseudonym)).size === N, '');
  if (N >= 40) {
    const over = await api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' });
    check('41번째 입장 → 정원 초과 안내', over.status === 400 && /정원/.test(over.body?.error ?? ''), over.body?.error ?? '');
  }

  const teacher = new Client(code, 'teacher', teacherToken, 'teacher');
  const board = new Client(code, 'public', publicToken, 'board');
  const students = joins.map((j, i) => new Client(code, 'student', j.body.studentToken, `s${i}`));
  await teacher.connect();
  await board.connect();
  const tConn = Date.now();
  await Promise.all(students.map((s) => s.connect()));
  check(`학생 ${N}명 소켓 연결·스냅샷 수신`, students.every((s) => s.snap?.me), `${Date.now() - tConn}ms`);
  check('학생/공개 스냅샷에 교사 전용·개인 상태 없음', students.every((s) => !s.snap.teacher) && !board.snap.teacher && !board.snap.me, '');

  // 권한
  const sAdv = await students[0].cmd({ op: 'start' });
  check('학생 소켓의 교사 명령 → forbidden', !sAdv.ok && sAdv.code === 'forbidden', sAdv.code);
  const bAdv = await board.cmd({ op: 'start' });
  check('공개 토큰의 교사 명령 → forbidden', !bAdv.ok && bAdv.code === 'forbidden', bAdv.code);
  const fakeOk = await new Client(code, 'teacher', 'not-a-real-token-123', 'fake').connect().then(() => true, () => false);
  check('가짜 교사 토큰 → 연결 거부', !fakeOk, '');
  const other = await api('/api/rooms', { method: 'POST', body: '{}' });
  const otherJoin = await api(`/api/rooms/${other.body.code}/join`, { method: 'POST', body: '{}' });
  const crossOk = await new Client(code, 'student', otherJoin.body.studentToken, 'cross').connect().then(() => true, () => false);
  check('다른 방 학생 토큰으로 접근 불가', !crossOk, '');
  const exp = await api(`/api/rooms/${code}/export?token=${publicToken}`);
  check('공개 토큰으로 내보내기 불가 (403)', exp.status === 403, String(exp.status));
  check('AI 추천 명단은 결정 2 전에 노출되지 않음', !students[0].snap.state.allocations.r1 && students[0].snap.state.lottery.length === 0, '');

  // 시작 → 인트로 → 결정 1
  await teacher.cmd({ op: 'start' });
  await teacher.waitFor((s) => s.state.phase === 'intro');
  const rev = teacher.snap.state.flowRevision;
  const [n1, n2] = await Promise.all([teacher.request({ type: 'teacher', command: { op: 'next' }, expectedRevision: rev }), teacher.request({ type: 'teacher', command: { op: 'next' }, expectedRevision: rev })]);
  check('교사 버튼 연타 → 한 번만 적용 (stale 거부)', (n1.ok && n2.code === 'stale') || (n2.ok && n1.code === 'stale'), `${n1.code ?? 'ok'}/${n2.code ?? 'ok'}`);
  await teacher.waitFor((s) => s.state.phase === 'pre_check');
  const tSync = Date.now();
  await Promise.all([...students, board].map((c) => c.waitFor((s) => s.state.phase === 'pre_check')));
  check(`단계 전환 동기화 (${N + 1}개 화면) 2초 이내`, Date.now() - tSync < 2000, `${Date.now() - tSync}ms`);

  const tSub = Date.now();
  const acks = await Promise.all(students.map((s, i) => s.submit({ kind: 'precheck', choice: ['yes', 'no', 'unsure'][i % 3] })));
  check(`${N}명 동시 제출 ack`, acks.every((a) => a.ok), `${Date.now() - tSub}ms`);
  const re = await students[0].submit({ kind: 'precheck', choice: 'no' });
  check('재제출 ack (마지막 응답으로 교체)', re.ok, '');
  await teacher.waitFor((s) => s.teacher.responseCount === N);
  check('제출 전 학생·공개 화면에 분포 없음', !students[0].snap.state.tallies.pre_check && !board.snap.state.tallies.pre_check, '');
  await teacher.cmd({ op: 'reveal' });
  await teacher.waitFor((s) => s.state.round.revealed);
  await Promise.all([students[0], board].map((c) => c.waitFor((x) => x.state.round.revealed)));
  check('결정 1 분포는 비공개 (응답 수만)', Object.keys(students[0].snap.state.tallies.pre_check.counts).length === 0 && students[0].snap.state.tallies.pre_check.responded === N, '');
  const late = await students[1].submit({ kind: 'precheck', choice: 'yes' });
  check('마감 후 제출 거부 (locked)', !late.ok && late.code === 'locked', late.code);

  // 결정 2: 동률 → 재투표 → 시나리오대로 결정
  await teacher.cmd({ op: 'next' });
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'ai_verdict')));
  check('결정 2에서 AI 추천 명단 제공 (정원 6)', students[0].snap.state.allocations.r1?.selected.length === 6 && students[0].snap.state.lottery.length === 12, '');
  check('미공개 단서는 스냅샷에 없음', students[0].snap.state.revealedClues.length === 0 && !students[0].snap.state.verdictScene, '');
  const half = Math.floor((N - 1) / 2);
  await Promise.all(students.map((s, i) => s.submit({ kind: 'verdict', choice: i === N - 1 ? 'abstain' : i < half ? 'approve' : i < half * 2 ? 'investigate' : 'abstain' })));
  await teacher.cmd({ op: 'reveal' });
  await teacher.waitFor((s) => s.state.round.revealed);
  check('동률 표시 + 기권은 분모 포함·동의 아님', teacher.snap.state.round.tie?.length === 2 && teacher.snap.state.tallies.ai_verdict.counts.abstain >= 1 && !teacher.snap.state.decisions.verdict, JSON.stringify(teacher.snap.state.tallies.ai_verdict.counts));
  const blocked = await teacher.cmd({ op: 'next' });
  check('동률 상태에서 다음 장면 차단', !blocked.ok && blocked.code === 'blocked', blocked.message);
  const oldRound = teacher.snap.state.round.roundId;
  await teacher.cmd({ op: 'rerun', seconds: 30 });
  await teacher.waitFor((s) => s.state.round.roundId !== oldRound);
  check('재투표는 새 roundId, 선택지는 동률 항목만', teacher.snap.state.round.limitTo?.length === 2 && !teacher.snap.state.tallies.ai_verdict, '');
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.round.roundId !== oldRound)));
  const notAllowed = await students[0].submit({ kind: 'verdict', choice: 'reject' });
  check('재투표에서 동률 외 선택 거부', !notAllowed.ok && notAllowed.code === 'not_allowed', notAllowed.code);
  const stale = await students[0].request({ type: 'submit', roundId: oldRound, phase: 'ai_verdict', payload: { kind: 'verdict', choice: 'approve' } });
  check('이전 라운드 ID 제출 거부 (stale_round)', !stale.ok && stale.code === 'stale_round', stale.code);
  // 거부 시나리오: 재투표에서 모두 보류 → 응답 없음 → 교사 결정으로 '거부' (미응답 처리 경로 검증)
  await Promise.all(students.map((s) => s.submit({ kind: 'verdict', choice: VERDICT === 'reject' ? 'abstain' : VERDICT })));
  await teacher.cmd({ op: 'reveal' });
  await teacher.waitFor((s) => s.state.round.revealed);
  if (VERDICT === 'reject') {
    check('전원 보류 → 응답 없음 상태(tie=[])', Array.isArray(teacher.snap.state.round.tie) && teacher.snap.state.round.tie.length === 0, JSON.stringify(teacher.snap.state.round.tie));
    await teacher.cmd({ op: 'decide', choice: 'reject', reason: '시뮬레이션: 거부 분기 검증' });
  }
  await teacher.waitFor((s) => s.state.decisions.verdict === VERDICT);
  const expectedTokens = VERDICT === 'approve' ? 1 : 2;
  check(`결정 2 = ${VERDICT} → 조사 토큰 ${expectedTokens}개`, teacher.snap.state.decisions.tokens === expectedTokens, `${teacher.snap.state.decisions.tokens}`);

  // 분기 장면
  await teacher.cmd({ op: 'next' });
  await Promise.all([...students, board].map((s) => s.waitFor((x) => x.state.phase === 'verdict_result')));
  const scene = board.snap.state.verdictScene;
  check('분기 장면 전달 (제목·이야기·편지)', scene && scene.verdict === VERDICT && scene.story.length > 0 && scene.letters.length > 0, scene?.title);
  if (VERDICT === 'approve') {
    const r1 = board.snap.state.allocations.r1;
    check('승인 분기: 편지 쓴 신청자는 모두 대기 명단', scene.letters.every((l) => r1.waiting.includes(l.applicantId)), scene.letters.map((l) => l.applicantId).join(','));
  }

  // 결정 3: 토큰 수만큼 카드
  await teacher.cmd({ op: 'next' });
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'investigate')));
  check('관점 카드 4종 배분', new Set(students.map((s) => s.snap.me.perspective)).size === 4, '');
  const wrongCount = await students[0].submit({ kind: 'investigate', picks: expectedTokens === 1 ? ['access', 'rules'] : ['access'], tag: 'why' });
  check('토큰 수와 다른 카드 수 거부', !wrongCount.ok && wrongCount.code === 'invalid', wrongCount.code);
  students.slice(N - 3).forEach((s) => s.close());
  const active = students.slice(0, N - 3);
  const tags = { applicant: 'why', newcomer: 'no_chance', organizer: 'time', guide: 'criteria' };
  await Promise.all(
    active.map((s, i) => {
      const first = i % 3 === 0 ? 'rules' : 'access';
      const second = i % 3 === 0 ? 'access' : i % 3 === 1 ? 'rules' : 'explanation';
      return s.submit({ kind: 'investigate', picks: expectedTokens === 1 ? [first] : [first, second], tag: tags[s.snap.me.perspective], reason: i % 7 === 0 ? `관점 이유 ${i}` : undefined });
    }),
  );
  await teacher.cmd({ op: 'reveal' });
  await teacher.waitFor((s) => s.state.round.revealed);
  check('중도 이탈자는 미응답으로 집계 (분모 유지)', teacher.snap.state.tallies.investigate.eligible === N && teacher.snap.state.tallies.investigate.responded === N - 3, `${teacher.snap.state.tallies.investigate.responded}/${N}`);
  check(`조사 카드 ${expectedTokens}장 결정`, teacher.snap.state.decisions.clues?.length === expectedTokens, JSON.stringify(teacher.snap.state.decisions.clues));
  const pending = teacher.snap.teacher.pendingTexts.filter((t) => t.status === 'pending');
  check('자유 응답은 승인 전 학생·공개 화면에 없음', pending.length > 0 && active[0].snap.state.approvedTexts.length === 0, `${pending.length}`);
  await teacher.cmd({ op: 'moderate', textId: pending[0].id, status: 'approved' });
  await teacher.cmd({ op: 'next' });
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'investigate_reveal')));
  const st = active[0].snap.state;
  check(`공개 단서 ${expectedTokens}장 + 기본 자료 ${4 - expectedTokens}장`, st.revealedClues.length === expectedTokens && st.baseClues.length === 4 - expectedTokens, '');
  check('승인된 자유 응답 1건만 공개 (식별자·시각 없음)', st.approvedTexts.length === 1 && Object.keys(st.approvedTexts[0]).sort().join() === 'kind,text', '');
  check('관점 보드: 3명 미만 관점은 수치 숨김', st.perspectiveBoard.every((r) => (r.responded < 3 ? r.merged : !r.merged)), '');

  // 재접속·중복 세션·교사 끊김
  const rejoin = new Client(code, 'student', joins[N - 1].body.studentToken, 'rejoin');
  await rejoin.connect();
  check('이탈 학생 재접속: 가명·제출 상태 복구', rejoin.snap.me.pseudonym === joins[N - 1].body.pseudonym && rejoin.snap.me.submissions.ai_verdict, '');
  const dupSock = new Client(code, 'student', joins[0].body.studentToken, 'dup');
  await dupSock.connect();
  await sleep(300);
  check('같은 학생 중복 세션 → 이전 소켓 종료', students[0].kicked !== null || students[0].closedCode === 4409, `${students[0].closedCode}`);
  active[0] = dupSock;
  teacher.close();
  await active[1].waitFor((s) => s.state.teacherConnected === false, 5000);
  check('교사 연결 끊김 → teacherConnected=false 전파', active[1].snap.state.teacherConnected === false, '');
  const teacher2 = new Client(code, 'teacher', teacherToken, 'teacher2');
  await teacher2.connect();
  await active[1].waitFor((s) => s.state.teacherConnected === true, 5000);
  check('교사 복귀 → 같은 단계 복원', teacher2.snap.state.phase === 'investigate_reveal', teacher2.snap.state.phase);

  // 결정 4: 일시정지·연장·마감 → 결과
  await teacher2.cmd({ op: 'next' });
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'redesign')));
  const endsAt = teacher2.snap.state.round.endsAt;
  await teacher2.cmd({ op: 'pause' });
  await teacher2.waitFor((s) => s.state.paused);
  const pausedSubmit = await active[0].submit({ kind: 'package', choice: 'mix' });
  check('일시정지 중 제출 거부', !pausedSubmit.ok && pausedSubmit.code === 'paused', pausedSubmit.code);
  await teacher2.cmd({ op: 'resume' });
  await teacher2.waitFor((s) => !s.state.paused);
  await teacher2.cmd({ op: 'extend', seconds: 60 });
  await sleep(200);
  check('시간 연장 반영', teacher2.snap.state.round.endsAt > endsAt, '');
  await Promise.all(active.map((s, i) => s.submit({ kind: 'package', choice: i % 5 === 0 ? 'abstain' : 'access' })));
  await teacher2.cmd({ op: 'close_submissions' });
  await teacher2.waitFor((s) => s.state.round.locked);
  await teacher2.cmd({ op: 'reveal' });
  await teacher2.waitFor((s) => s.state.decisions.pkg === 'access');
  await teacher2.cmd({ op: 'next' });
  await teacher2.waitFor((s) => s.state.phase === 'redesign_result');
  const cmp = teacher2.snap.state.allocations.r3;
  check('결정 4 결과: 정원 6 유지, 유리/불리 함께', cmp.after.selected.length === 6 && cmp.gained.length === cmp.lost.length && cmp.gained.length > 0, `gained=${cmp.gained} lost=${cmp.lost}`);
  await teacher2.cmd({ op: 'back' });
  await teacher2.waitFor((s) => s.state.phase === 'redesign');
  const reopened = await active[0].submit({ kind: 'package', choice: 'keep' });
  check('이전 장면 보기에서 과거 투표 재개방 안 됨', !reopened.ok && reopened.code === 'locked', reopened.code);
  await teacher2.cmd({ op: 'next' });
  await teacher2.waitFor((s) => s.state.phase === 'redesign_result');

  // 결정 5·6·엔딩
  await teacher2.cmd({ op: 'next' });
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'transfer')));
  await Promise.all(active.map((s, i) => s.submit({ kind: 'transfer', choice: i % 9 === 0 ? 'abstain' : ['q_start', 'q_appeal', 'q_start', 'q_limits'][i % 4] })));
  await teacher2.cmd({ op: 'reveal' });
  await teacher2.waitFor((s) => s.state.round.revealed);
  if (teacher2.snap.state.round.tie) {
    await teacher2.cmd({ op: 'decide', choice: 'q_start,q_appeal', reason: '동률' });
    await teacher2.waitFor((s) => s.state.decisions.questions);
  }
  check('공동 질문 2개 결정', teacher2.snap.state.decisions.questions?.length === 2, JSON.stringify(teacher2.snap.state.decisions.questions));
  await teacher2.cmd({ op: 'next' });
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'post_check')));
  await Promise.all(active.map((s, i) => s.submit({ kind: 'postcheck', choice: i % 3 === 0 ? 'no' : ['yes', 'no', 'unsure'][i % 3], reason: '이유' })));
  await teacher2.cmd({ op: 'reveal' });
  await teacher2.waitFor((s) => s.state.round.revealed);
  await teacher2.cmd({ op: 'next' });
  await Promise.all([...active, board, teacher2].map((s) => s.waitFor((x) => x.state.phase === 'ending')));
  const ending = board.snap.state.ending;
  check('엔딩: 첫 결정·새 설정·질문 2개·남은 질문·원칙 2개', ending && ending.verdictLabel && ending.pkgName && ending.questions.length === 2 && ending.openQuestion && ending.principles.length === 2, JSON.stringify({ v: ending?.verdictLabel, p: ending?.pkgName }));
  const summary = teacher2.snap.teacher.summary;
  check('교사 요약: 유지/변화 묶음만, 개인 식별자 없음', summary?.changeMatrix && !JSON.stringify(summary).includes('"p_'), JSON.stringify(summary?.changeMatrix));
  const exportRes = await api(`/api/rooms/${code}/export?token=${teacherToken}`);
  check('내보내기 200 + 개인 식별자 없음', exportRes.status === 200 && !JSON.stringify(exportRes.body).includes('"p_'), '');

  const del = await teacher2.cmd({ op: 'delete_room' });
  await sleep(500);
  check('방 삭제 → 모든 소켓 종료 안내', del.ok && active.every((s) => s.kicked || s.closedCode === 4000) && board.kicked, '');
  const after = await api(`/api/rooms/${code}`);
  check('삭제 후 조회 → 404', after.status === 404, String(after.status));
  [...students, rejoin, dupSock, board, teacher2].forEach((s) => s.close());
}

main()
  .catch((e) => check('예외 없이 완료', false, e.message))
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n결과: ${passed}/${results.length} 통과`);
    process.exit(passed === results.length ? 0 : 1);
  });
