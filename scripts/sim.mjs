// 멀티플레이 시뮬레이션: 교사 1 + 학생 N + 공개 화면 1 을 독립 WebSocket 으로 연결해
// 입장 → 투표 → 집계 → 단계 전환 → 엔딩 전 과정을 자동 실행하고 결과를 검증한다.
// 사용: node scripts/sim.mjs [baseUrl=http://localhost:5173] [students=40]
// 이 스크립트는 로컬/스테이징 서버 대상의 기술 검증이며, 실제 학급 수업 실증이 아니다.
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const N = Number(process.argv[3] ?? 40);
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
    this.code = code;
    this.role = role;
    this.token = token;
    this.name = name;
    this.snap = null;
    this.waiters = new Map();
    this.closedCode = null;
    this.errors = [];
    this.kicked = null;
    this.snapCount = 0;
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
          this.snapCount++;
          if (!this.ready) {
            this.ready = true;
            clearTimeout(to);
            resolve();
          }
          this.onSnap?.(m);
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
        } else if (m.type === 'kicked') {
          this.kicked = m.reason;
        }
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
  async cmd(command, expectedRevision) {
    const r = await this.request({ type: 'teacher', command, expectedRevision });
    if (!r.ok) log(`  (cmd ${command.op} → ${r.code}: ${r.message ?? ''})`);
    return r;
  }
  /** 조건을 만족하는 스냅샷을 기다린다 */
  waitFor(pred, ms = 10000) {
    if (this.snap && pred(this.snap)) return Promise.resolve(this.snap);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`${this.name}: waitFor timeout`)), ms);
      const prev = this.onSnap;
      this.onSnap = (m) => {
        prev?.(m);
        if (pred(m)) {
          clearTimeout(to);
          this.onSnap = prev;
          resolve(m);
        }
      };
    });
  }
  close() {
    this.ws?.close(1000);
  }
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  log(`대상 ${BASE}, 학생 ${N}명`);
  // 1. 방 생성
  const created = await api('/api/rooms', { method: 'POST', body: '{}' });
  check('방 생성 201', created.status === 201, JSON.stringify(created.body).slice(0, 80));
  const { code, teacherToken, publicToken } = created.body;
  check('코드 6자리·혼동 문자 제외', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code), code);

  // 2. 잘못된 코드/토큰
  const bad = await api('/api/rooms/ZZZZZZ/join', { method: 'POST', body: '{}' });
  check('없는 방 입장 → 404 한국어 안내', bad.status === 404 && /방을 찾을 수 없어요/.test(bad.body?.error ?? ''), bad.body?.error);

  // 3. 학생 N명 입장 (동시에)
  const joins = await Promise.all(Array.from({ length: N }, () => api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' })));
  check(`학생 ${N}명 입장 성공`, joins.every((j) => j.status === 200), `${joins.filter((j) => j.status === 200).length}/${N}`);
  const pseudonyms = new Set(joins.map((j) => j.body.pseudonym));
  check('가명 중복 없음', pseudonyms.size === N, `${pseudonyms.size}`);
  if (N >= 40) {
    const over = await api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' });
    check('41번째 입장 → 정원 초과 안내', over.status === 400 && /정원/.test(over.body?.error ?? ''), over.body?.error ?? '');
  }

  // 4. 소켓 연결
  const teacher = new Client(code, 'teacher', teacherToken, 'teacher');
  const board = new Client(code, 'public', publicToken, 'board');
  const students = joins.map((j, i) => new Client(code, 'student', j.body.studentToken, `s${i}`));
  await teacher.connect();
  await board.connect();
  const tConn = Date.now();
  await Promise.all(students.map((s) => s.connect()));
  check(`학생 ${N}명 소켓 연결·스냅샷 수신`, students.every((s) => s.snap?.me), `${Date.now() - tConn}ms`);
  check('학생 스냅샷에 교사 전용 상태 없음', students.every((s) => !s.snap.teacher), '');
  check('공개 화면 스냅샷에 교사 전용·개인 상태 없음', !board.snap.teacher && !board.snap.me, '');

  // 5. 권한 검증: 학생·공개 화면의 교사 명령 거부
  const sAdv = await students[0].cmd({ op: 'start' });
  check('학생 소켓의 교사 명령 → forbidden', sAdv.ok === false && sAdv.code === 'forbidden', sAdv.code);
  const bAdv = await board.cmd({ op: 'start' });
  check('공개 토큰의 교사 명령 → forbidden', bAdv.ok === false && bAdv.code === 'forbidden', bAdv.code);
  const wrongTeacher = new Client(code, 'teacher', 'not-a-real-token-123', 'fake');
  const fakeOk = await wrongTeacher.connect().then(() => true, () => false);
  check('가짜 교사 토큰 → 연결 거부', !fakeOk, '');
  // 다른 방의 학생 토큰으로 이 방 접근 불가
  const other = await api('/api/rooms', { method: 'POST', body: '{}' });
  const otherJoin = await api(`/api/rooms/${other.body.code}/join`, { method: 'POST', body: '{}' });
  const cross = new Client(code, 'student', otherJoin.body.studentToken, 'cross');
  const crossOk = await cross.connect().then(() => true, () => false);
  check('다른 방 학생 토큰으로 접근 불가', !crossOk, '');
  // 공개 화면 토큰으로 내보내기 불가
  const exp = await api(`/api/rooms/${code}/export?token=${publicToken}`);
  check('공개 토큰으로 내보내기 불가 (403)', exp.status === 403, String(exp.status));

  // 6. 시작 → 인트로 → 연습
  let r = await teacher.cmd({ op: 'start' }, teacher.snap.state.flowRevision);
  check('교사 start ack', r.ok, '');
  await teacher.waitFor((s) => s.state.phase === 'intro');
  // 버튼 연타: 같은 expectedRevision 으로 두 번 next
  const rev = teacher.snap.state.flowRevision;
  const [n1, n2] = await Promise.all([teacher.cmd({ op: 'next' }, rev), teacher.cmd({ op: 'next' }, rev)]);
  check('교사 버튼 연타 → 한 번만 적용 (stale 거부)', (n1.ok && !n2.ok && n2.code === 'stale') || (!n1.ok && n2.ok && n1.code === 'stale'), `${n1.code ?? 'ok'}/${n2.code ?? 'ok'}`);
  await teacher.waitFor((s) => s.state.phase === 'practice');
  const tSync = Date.now();
  await Promise.all([...students, board].map((c) => c.waitFor((s) => s.state.phase === 'practice', 10000)));
  check(`단계 전환 동기화 (${N + 1}개 화면) 2초 이내`, Date.now() - tSync < 2000, `${Date.now() - tSync}ms`);

  // 7. 연습 제출: 동시 제출 + 중복 제출 + 재제출
  const tSub = Date.now();
  const acks = await Promise.all(students.map((s, i) => s.submit({ kind: 'practice', choice: ['booth', 'food', 'stage', 'unsure'][i % 4] })));
  check(`${N}명 동시 제출 ack`, acks.every((a) => a.ok), `${Date.now() - tSub}ms`);
  const dup = await students[0].submit({ kind: 'practice', choice: 'booth' });
  const re = await students[1].submit({ kind: 'practice', choice: 'booth' }); // food → booth 로 교체
  check('중복·재제출 ack', dup.ok && re.ok, '');
  await teacher.waitFor((s) => s.teacher.responseCount === N);
  check('제출 전 학생·공개 화면에 분포 없음', !students[0].snap.state.tallies.practice && !board.snap.state.tallies.practice, '');
  r = await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  const pt = teacher.snap.state.tallies.practice;
  const sum = Object.entries(pt.counts).filter(([k]) => k !== 'abstain').reduce((a, [, v]) => a + v, 0) + pt.counts.abstain;
  check('1인 1표: 집계 합 = 응답 수 = N', pt.responded === N && sum === N, `responded=${pt.responded} sum=${sum} counts=${JSON.stringify(pt.counts)}`);
  check('재제출은 마지막 응답으로 교체 (booth 수)', pt.counts.booth === Math.ceil(N / 4) + 1, `booth=${pt.counts.booth}`);

  // 마감 직후 제출 → 거부
  const late = await students[2].submit({ kind: 'practice', choice: 'food' });
  check('마감 후 제출 거부 (locked)', !late.ok && late.code === 'locked', late.code);

  // 8. 사전 판단
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'pre_survey')));
  await Promise.all(students.map((s, i) => s.submit({ kind: 'survey', choice: ['always', 'mostly', 'depends', 'unsure'][i % 4], confidence: 2, reason: i % 5 === 0 ? `이유 ${i}` : undefined })));
  await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  check('사전 판단 분포는 비공개 (응답 수만)', Object.keys(students[0].snap.state.tallies.pre_survey.counts).length === 0 && students[0].snap.state.tallies.pre_survey.responded === N, '');
  check('자유 응답은 승인 전 학생·공개 화면에 없음', students[0].snap.state.approvedTexts.length === 0 && board.snap.state.approvedTexts.length === 0, '');
  check('교사 승인 대기열에 원문만 (식별자 없음)', teacher.snap.teacher.pendingTexts.length === Math.ceil(N / 5) && teacher.snap.teacher.pendingTexts.every((t) => !('participantId' in t)), `${teacher.snap.teacher.pendingTexts.length}`);

  // 9. 라운드 1: 동률 → 재투표 → 결정
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'r1_vote')));
  // 의도적 동률: 절반 first, 절반 experience (N 짝수 가정), 1명은 기권
  const half = Math.floor((N - 1) / 2);
  await Promise.all(students.map((s, i) => s.submit({ kind: 'policy', choice: i === N - 1 ? 'abstain' : i < half ? 'first' : i < half * 2 ? 'experience' : 'abstain' })));
  await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  const tieState = teacher.snap.state;
  check('동률 표시 + 기권은 분모 포함·동의 아님', tieState.round.tie?.length === 2 && tieState.tallies.r1_vote.counts.abstain >= 1 && !tieState.decisions.policy, JSON.stringify(tieState.tallies.r1_vote.counts));
  const blocked = await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  check('동률 상태에서 다음 장면 차단', !blocked.ok && blocked.code === 'blocked', blocked.message);
  const oldRound = tieState.round.roundId;
  await teacher.cmd({ op: 'rerun', seconds: 30 }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.roundId !== oldRound);
  check('재투표는 새 roundId, 선택지는 동률 항목만', teacher.snap.state.round.limitTo?.length === 2 && !teacher.snap.state.tallies.r1_vote, '');
  const notAllowed = await students[0].submit({ kind: 'policy', choice: 'newcomer' });
  check('재투표에서 동률 외 선택 거부', !notAllowed.ok && notAllowed.code === 'not_allowed', notAllowed.code);
  // 이전 라운드 ID 로 늦게 도착한 제출
  const stale = await students[0].request({ type: 'submit', roundId: oldRound, phase: 'r1_vote', payload: { kind: 'policy', choice: 'first' } });
  check('이전 라운드 ID 제출 거부 (stale_round)', !stale.ok && stale.code === 'stale_round', stale.code);
  // 다시 동률 → 교사 결정
  await Promise.all(students.map((s, i) => s.submit({ kind: 'policy', choice: i < half ? 'first' : i < half * 2 ? 'experience' : 'abstain' })));
  await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  check('두 번째 동률', teacher.snap.state.round.tie?.length === 2, '');
  await teacher.cmd({ op: 'decide', choice: 'first', reason: '두 번 동률이라 교사가 선택' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.decisions.policy === 'first');
  check('교사 결정은 학급 다수결과 구분 표시', teacher.snap.state.decisions.policyByTeacher === true && teacher.snap.state.teacherDecisions.length === 1, '');

  // 10. 결과 → 정보 선택 → 라운드 2
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.phase === 'r1_result');
  const alloc = students[0].snap.state.allocations.r1;
  check('라운드 1 배정: 정원 6, 대기 6', alloc && alloc.selected.length === 6 && alloc.waiting.length === 6, JSON.stringify(alloc?.selected));
  check('미공개 단서는 학생 스냅샷에 없음', students[0].snap.state.revealedClues.length === 0 && students[0].snap.state.baseClues.length === 0, '');
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'r1_info')));
  await Promise.all(students.map((s, i) => s.submit({ kind: 'info', choice: ['access', 'experience', 'rules', 'explanation'][i % 4] })));
  await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await Promise.all(students.map((s) => s.waitFor((x) => x.state.phase === 'r2_choose')));
  const perspectives = new Set(students.map((s) => s.snap.me.perspective));
  check('관점 카드 4종 배분', perspectives.size === 4, [...perspectives].join(','));
  // 중도 이탈: 학생 3명 소켓 종료
  students.slice(N - 3).forEach((s) => s.close());
  const active = students.slice(0, N - 3);
  await Promise.all(
    active.map((s, i) => {
      const p = s.snap.me.perspective;
      const tags = { applicant: 'why', newcomer: 'no_chance', organizer: 'time', guide: 'criteria' };
      const first = i % 3 === 0 ? 'rules' : 'access';
      const second = i % 3 === 0 ? 'access' : i % 3 === 1 ? 'rules' : 'explanation';
      return s.submit({ kind: 'investigate', first, second, tag: tags[p], reason: i % 7 === 0 ? `관점 이유 ${i}` : undefined });
    }),
  );
  await teacher.cmd({ op: 'reveal' }, teacher.snap.state.flowRevision);
  await teacher.waitFor((s) => s.state.round.revealed);
  check('중도 이탈자는 미응답으로 집계 (분모 유지)', teacher.snap.state.tallies.r2_choose.eligible === N && teacher.snap.state.tallies.r2_choose.responded === N - 3, `${teacher.snap.state.tallies.r2_choose.responded}/${teacher.snap.state.tallies.r2_choose.eligible}`);
  check('조사 카드 2장 결정', teacher.snap.state.decisions.clues?.length === 2, JSON.stringify(teacher.snap.state.decisions.clues));
  // 자유 응답 승인
  const pending = teacher.snap.teacher.pendingTexts.filter((t) => t.status === 'pending');
  await teacher.cmd({ op: 'moderate', textId: pending[0].id, status: 'approved' });
  await teacher.cmd({ op: 'next' }, teacher.snap.state.flowRevision);
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'r2_reveal')));
  const st = active[0].snap.state;
  check('공개 단서 2장 + 기본 자료 2장 전달', st.revealedClues.length === 2 && st.baseClues.length === 2, '');
  check('승인된 자유 응답 1건만 공개 (식별자·시각 없음)', st.approvedTexts.length === 1 && Object.keys(st.approvedTexts[0]).sort().join() === 'kind,text', JSON.stringify(st.approvedTexts));
  check('관점 보드: 3명 미만 관점은 수치 숨김', st.perspectiveBoard.every((r) => (r.responded < 3 ? r.merged && Object.keys(r.tags).length === 0 : !r.merged)), JSON.stringify(st.perspectiveBoard.map((r) => [r.perspective, r.responded, r.merged])));

  // 11. 재접속·새로고침·늦은 입장 복구
  const rejoin = new Client(code, 'student', joins[N - 1].body.studentToken, 'rejoin');
  await rejoin.connect();
  check('이탈 학생 재접속: 가명·제출 상태 복구', rejoin.snap.me.pseudonym === joins[N - 1].body.pseudonym && rejoin.snap.me.submissions.r1_vote, '');
  const dupSock = new Client(code, 'student', joins[0].body.studentToken, 'dup');
  await dupSock.connect();
  await sleep(300);
  check('같은 학생 중복 세션 → 이전 소켓 종료', students[0].kicked !== null || students[0].closedCode === 4409, `${students[0].closedCode}`);
  active[0] = dupSock; // 이후 활동은 새 소켓으로 계속
  const lateJoin = await api(`/api/rooms/${code}/join`, { method: 'POST', body: '{}' });
  check('늦은 입장은 정원 내에서 가능 (이탈자 자리 아님, 새 참가자)', lateJoin.status === 400 || lateJoin.status === 200, String(lateJoin.status));
  // 교사 연결 끊김 → 학생 화면 대기, 복귀 시 복원
  teacher.close();
  await active[1].waitFor((s) => s.state.teacherConnected === false, 5000);
  check('교사 연결 끊김 → teacherConnected=false 전파', active[1].snap.state.teacherConnected === false, '');
  const teacher2 = new Client(code, 'teacher', teacherToken, 'teacher2');
  await teacher2.connect();
  await active[1].waitFor((s) => s.state.teacherConnected === true, 5000);
  check('교사 복귀 → 같은 단계 복원', teacher2.snap.state.phase === 'r2_reveal' && active[1].snap.state.teacherConnected, teacher2.snap.state.phase);

  // 12. 라운드 3: 타이머 일시정지·연장·마감
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'r3_vote')));
  const endsAt = teacher2.snap.state.round.endsAt;
  await teacher2.cmd({ op: 'pause' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.paused);
  check('일시정지: endsAt 해제, 남은 시간 저장', teacher2.snap.state.round.endsAt === null && teacher2.snap.state.round.pausedRemainingMs > 0, `${teacher2.snap.state.round.pausedRemainingMs}`);
  const pausedSubmit = await active[0].submit({ kind: 'package', choice: 'mix' });
  check('일시정지 중 제출 거부', !pausedSubmit.ok && pausedSubmit.code === 'paused', pausedSubmit.code);
  await teacher2.cmd({ op: 'resume' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => !s.state.paused);
  await teacher2.cmd({ op: 'extend', seconds: 60 }, teacher2.snap.state.flowRevision);
  await sleep(200);
  check('시간 연장 반영', teacher2.snap.state.round.endsAt > endsAt, '');
  await Promise.all(active.map((s, i) => s.submit({ kind: 'package', choice: i % 5 === 0 ? 'abstain' : 'mix' })));
  await teacher2.cmd({ op: 'close_submissions' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.round.locked);
  await teacher2.cmd({ op: 'reveal' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.decisions.pkg === 'mix');
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.phase === 'r3_result');
  const cmp = teacher2.snap.state.allocations.r3;
  check('라운드 3 비교: 정원 6 유지, 유리/불리 함께 표시', cmp.after.selected.length === 6 && cmp.gained.length === cmp.lost.length && cmp.after.firstTimerCount === 3, `gained=${cmp.gained} lost=${cmp.lost}`);
  // 뒤로 가기: 과거 투표가 다시 열리지 않는다
  await teacher2.cmd({ op: 'back' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.phase === 'r3_vote');
  const reopened = await active[0].submit({ kind: 'package', choice: 'keep' });
  check('이전 장면 보기에서 과거 투표 재개방 안 됨', !reopened.ok && reopened.code === 'locked' && teacher2.snap.state.round.revealed, reopened.code);
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.phase === 'r3_result');

  // 13. 질문·전이·성찰·엔딩
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'r4_questions')));
  await Promise.all(active.map((s, i) => s.submit(i % 9 === 0 ? { kind: 'questions', picks: [], abstain: true } : { kind: 'questions', picks: ['q_start', i % 2 ? 'q_appeal' : 'q_limits'] })));
  await teacher2.cmd({ op: 'reveal' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.round.revealed);
  if (teacher2.snap.state.round.tie) {
    await teacher2.cmd({ op: 'decide', choice: 'q_start,q_appeal', reason: '동률' }, teacher2.snap.state.flowRevision);
    await teacher2.waitFor((s) => s.state.decisions.questions);
  }
  check('공동 질문 2개 결정', teacher2.snap.state.decisions.questions?.length === 2, JSON.stringify(teacher2.snap.state.decisions.questions));
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'r4_transfer')));
  await Promise.all(active.map((s, i) => s.submit({ kind: 'transfer', choice: ['t_attendance', 't_rule', 't_explain', 't_appeal', 'abstain'][i % 5] })));
  await teacher2.cmd({ op: 'reveal' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.round.revealed);
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await Promise.all(active.map((s) => s.waitFor((x) => x.state.phase === 'r5_post')));
  await Promise.all(active.map((s, i) => s.submit({ kind: 'post', choice: i % 3 === 0 ? 'depends' : ['always', 'mostly', 'depends', 'unsure'][i % 4], confidence: 3, reason: '이유' })));
  await teacher2.cmd({ op: 'reveal' }, teacher2.snap.state.flowRevision);
  await teacher2.waitFor((s) => s.state.round.revealed);
  await teacher2.cmd({ op: 'next' }, teacher2.snap.state.flowRevision);
  await Promise.all([...active, board, teacher2].map((s) => s.waitFor((x) => x.state.phase === 'ending')));
  const ending = board.snap.state.ending;
  check('엔딩: 실제 학급 데이터 (규칙·질문 2개·남은 질문 1개)', ending && ending.pkgName.length > 0 && ending.questions.length === 2 && ending.openQuestion.length > 0, JSON.stringify(ending).slice(0, 160));
  const summary = teacher2.snap.teacher.summary;
  check('교사 요약: 유지/변화 묶음만, 개인 식별자 없음', summary && summary.changeMatrix && !JSON.stringify(summary).includes('participantId') && !JSON.stringify(summary).includes('p_'), JSON.stringify(summary.changeMatrix));
  const exportRes = await api(`/api/rooms/${code}/export?token=${teacherToken}`);
  check('내보내기 200 + 개인 식별자 없음', exportRes.status === 200 && !JSON.stringify(exportRes.body).includes('"p_'), '');

  // 14. 삭제
  const del = await teacher2.cmd({ op: 'delete_room' }, teacher2.snap.state.flowRevision);
  await sleep(500);
  check('방 삭제 → 모든 소켓 종료 안내', del.ok && active.every((s) => s.kicked || s.closedCode === 4000) && board.kicked, '');
  const after = await api(`/api/rooms/${code}`);
  check('삭제 후 조회 → 404', after.status === 404, String(after.status));

  students.forEach((s) => s.close());
  rejoin.close();
  dupSock.close();
  board.close();
  teacher2.close();
}

main()
  .catch((e) => check('예외 없이 완료', false, e.message))
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n결과: ${passed}/${results.length} 통과`);
    console.log(JSON.stringify({ base: BASE, students: N, at: new Date().toISOString(), results }, null, 2));
    process.exit(passed === results.length ? 0 : 1);
  });
