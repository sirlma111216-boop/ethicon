// 공개 후 결과 화면과 이야기 장면: 학생·공개 화면·교사 화면이 공유한다. 집계는 서버가 계산한 값만 표시한다.
import { AI_AGENT, APPLICANTS, CHECK_OPTIONS, CLUES, PACKAGES, QUESTION_CANDIDATES, VERDICT_OPTIONS, applicantById, applyTime, packageById, type Applicant } from '../../shared/content';
import type { AllocationResult, EndingSummary, Phase, PublicState, VerdictScene } from '../../shared/types';
import { ALT, imgSrc, imgSrcSet, portraitSrc, type ImageId } from '../lib/images';
import { AllocationView, BadgeRow, ClueCardView, ComparisonView, PerspectiveBoardView, TallyBars } from './ui';

const packageLabels = Object.fromEntries(PACKAGES.map((p) => [p.id, p.name]));
const clueLabels = Object.fromEntries(CLUES.map((c) => [c.id, c.title]));
const questionLabels = Object.fromEntries(QUESTION_CANDIDATES.map((q) => [q.id, q.text]));
const verdictLabels = Object.fromEntries(VERDICT_OPTIONS.map((o) => [o.id, o.label]));
export const checkLabels = Object.fromEntries(CHECK_OPTIONS.map((o) => [o.id, o.label]));

// ---------- 신청자 ----------

export function Portrait({ a, size = 44 }: { a: Applicant; size?: number }) {
  const src = portraitSrc(a.id);
  if (src) return <img src={src} alt="" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover' }} />;
  const hue = (a.id.charCodeAt(2) * 37 + a.id.charCodeAt(1) * 11) % 360;
  return (
    <span aria-hidden className="portrait" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 78%)` }}>
      {a.name.slice(0, 1)}
    </span>
  );
}

/** 인트로: 신청자 12명 만나기 */
export function ApplicantIntro() {
  return (
    <div className="paper">
      <div className="row between">
        <h3 className="h3">신청자 12명 · 우선 체험권 6장</h3>
        <span className="pill paper">모두 가상 인물</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>AI 배정기는 이 12명에 대해 {AI_AGENT.dataUsed.join(', ')} 세 가지만 알고 있어요.</p>
      <div className="applicants" style={{ marginTop: 8 }}>
        {APPLICANTS.map((a) => (
          <div key={a.id} className="applicant">
            <div className="row" style={{ gap: 8 }}>
              <Portrait a={a} />
              <span className="name">{a.name}</span>
            </div>
            <div className="meta" style={{ marginTop: 4 }}>
              신청 {applyTime(a)} · 이전 참여 {a.prior}회 · 관심도 {a.interest}
              {a.prior === 0 && ' · 처음'}
            </div>
            <div className="small" style={{ marginTop: 4 }}>"{a.intro}"</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** AI 배정기 소개(인트로) */
export function AiIntroCard() {
  return (
    <div className="ai-card">
      <div className="row" style={{ gap: 12 }}>
        <span className="ai-mark" aria-hidden>
          AI
        </span>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>올해 처음 등장</p>
          <p className="h2" style={{ margin: 0 }}>{AI_AGENT.name}</p>
        </div>
      </div>
      <p style={{ margin: '10px 0 0' }}>{AI_AGENT.tagline}. 신청서에서 세 가지 자료를 읽고, 정해진 기준으로 6명을 추천해요.</p>
      <ul className="ai-list">
        {AI_AGENT.dataUsed.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="small" style={{ margin: 0, opacity: 0.85 }}>{AI_AGENT.disclaimer}</p>
    </div>
  );
}

/** AI 배정기의 추천 출력(결정 2 화면·공개 화면) */
export function AiVerdictCard({ result }: { result: AllocationResult }) {
  return (
    <section className="ai-card" aria-label="AI 배정기의 추천">
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <span className="ai-mark" aria-hidden>
            AI
          </span>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>{AI_AGENT.name} 출력</p>
            <p className="h3" style={{ margin: 0 }}>AI 배정기가 추천한 우선 체험권 6명</p>
          </div>
        </div>
        <span className="pill ghost">기준: {AI_AGENT.defaultRule}</span>
      </div>
      <div className="printout">
        <p className="printout-line">▶ 본 자료: {AI_AGENT.dataUsed.join(' · ')}</p>
        <p className="printout-line">▶ 적용 기준: {AI_AGENT.defaultRule}</p>
        <p className="printout-line">▶ 추천: {result.selected.map((id) => applicantById(id).name).join(', ')}</p>
        <p className="printout-line">▶ 대기: {result.waiting.map((id) => applicantById(id).name).join(', ')}</p>
        <p className="printout-line">▶ 설명: "{AI_AGENT.verdictLine}"</p>
        <p className="printout-line muted">▶ 확인하지 않은 것: ???</p>
      </div>
      <div className="applicants" style={{ marginTop: 10 }}>
        {result.selected.map((id) => {
          const a = applicantById(id);
          return (
            <div key={id} className="applicant in">
              <div className="row" style={{ gap: 8 }}>
                <Portrait a={a} size={36} />
                <span className="name">{a.name}</span>
                <span className="pill mint">추천</span>
              </div>
              <div className="meta">신청 {applyTime(a)} · 이전 참여 {a.prior}회{a.prior === 0 && ' · 처음'}</div>
            </div>
          );
        })}
      </div>
      <p className="small" style={{ margin: '10px 0 0', opacity: 0.85 }}>{AI_AGENT.unknownHint}</p>
    </section>
  );
}

/** 결정 2의 결과 장면(분기) */
export function VerdictSceneView({ scene, state }: { scene: VerdictScene; state: PublicState }) {
  const r1 = state.allocations.r1;
  return (
    <div className="stack">
      <div className="paper">
        <p className="eyebrow" style={{ color: '#8a2a6b' }}>우리 반의 결정: {verdictLabels[scene.verdict]}</p>
        <h3 className="h2">{scene.title}</h3>
        {scene.verdict === 'approve' && (
          <img className="story-image" src={imgSrc('announcement-board', 1280)} srcSet={imgSrcSet('announcement-board')} sizes="(max-width: 767px) 100vw, 720px" alt={ALT['announcement-board']} loading="lazy" />
        )}
        {scene.story.map((s, i) => (
          <p key={i} style={{ fontSize: 18, margin: '8px 0' }}>
            {s}
          </p>
        ))}
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {scene.letters.map((l) => {
            const a = applicantById(l.applicantId);
            return (
              <div key={l.applicantId} className="letter">
                <Portrait a={a} size={40} />
                <div>
                  <strong>{a.name}</strong>
                  <span className="muted small"> · {r1?.selected.includes(a.id) ? '추천됨' : '대기'}</span>
                  <p style={{ margin: '2px 0 0' }}>{l.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="banner" style={{ marginTop: 12, background: '#efe9ff', color: 'var(--paper-ink)', borderLeftColor: 'var(--primary)' }}>
          <strong>조사 토큰 {scene.tokens}개.</strong> {scene.tokenNote}
        </div>
      </div>
      {r1 && (
        <details className="card compact" open>
          <summary>AI 배정기 추천 명단 다시 보기</summary>
          <div style={{ marginTop: 10 }}>
            <AllocationView result={r1} compact />
          </div>
        </details>
      )}
    </div>
  );
}

export function TieNotice({ state }: { state: PublicState }) {
  const tie = state.round.tie;
  if (!tie) return null;
  const tally = state.tallies[state.phase];
  const responded = tally?.responded ?? 0;
  const abstained = tally?.counts['abstain'] ?? 0;
  const need = state.phase === 'investigate' ? (state.decisions.tokens ?? 2) : state.phase === 'transfer' ? 2 : 1;
  if (tie.length === 0) {
    if (responded > 0 && abstained >= responded) {
      return <div className="banner warn">모두가 "아직 모르겠다"를 골랐어요. 결정을 미루는 것도 선택이지만, 축제는 기다려 주지 않아요. 선생님이 시간을 연장하거나 결정을 내려요.</div>;
    }
    return <div className="banner warn">{responded === 0 ? '응답이 없어' : '유효한 선택이 없어'} 결정하지 못했어요. 선생님이 시간을 연장하거나 결정을 내려요.</div>;
  }
  if (tie.length < need) {
    return <div className="banner warn">{need}개가 필요한데 {tie.length}개만 뽑혔어요. 선생님이 나머지를 이유와 함께 정해요.</div>;
  }
  return (
    <div className="banner warn" role="status">
      동률이에요. 선생님이 30초 재투표를 열거나, 이유를 남기고 결정해요. 교사 결정은 학급 다수결과 구분해 표시돼요.
    </div>
  );
}

export function TeacherDecisionNote({ state, phase }: { state: PublicState; phase: Phase }) {
  const d = state.teacherDecisions.filter((x) => x.phase === phase);
  if (!d.length) return null;
  const last = d[d.length - 1]!;
  return (
    <div className="banner" role="note">
      <strong>교사 결정</strong> — 학급 투표로 정해지지 않아 선생님이 정했어요. 이유: {last.reason}
    </div>
  );
}

/** 열린 단서에 맞춰 "AI가 묻지 않은 것"을 말한다. 열리지 않은 카드의 내용은 미리 말하지 않는다. */
function unknownLine(ids: string[]): string {
  const parts: string[] = [];
  if (ids.includes('access')) parts.push('"그 시각에 신청할 수 있었는지"');
  if (ids.includes('experience')) parts.push('"처음 참여하는 사람은 참여 횟수가 0일 수밖에 없다는 것"');
  if (ids.includes('rules')) parts.push('"자기 설정이 무엇인지 운영팀이 열어 본 적도 없다는 것"');
  if (ids.includes('explanation')) parts.push('"떨어진 사람이 이유를 물을 곳이 없다는 것"');
  if (parts.length === 0) return `${AI_AGENT.name}는 세 가지 자료만 보고 계산했어요.`;
  return `${AI_AGENT.name}는 세 가지 자료만 알았어요. 다음은 묻지 않았어요: ${parts.join(' / ')}`;
}

/** 결정 2(AI 추천 처리)가 결정 4의 결과에 어떻게 이어졌는지 — 극단적인 선택에서도 앞 장면과 모순되지 않게 말한다. */
function DecisionEcho({ state }: { state: PublicState }) {
  const v = state.decisions.verdict;
  const c = state.allocations.r3;
  const pkg = state.decisions.pkg;
  if (!v || !c || !pkg) return null;
  const letterIds = state.verdictScene?.letters.map((l) => l.applicantId) ?? [];
  const names = (ids: string[]) => ids.map((id) => applicantById(id).name).join('·');
  const unchanged = c.gained.length === 0;
  let text: string;
  if (v === 'approve') {
    const inNow = letterIds.filter((id) => c.after.selected.includes(id));
    text = unchanged
      ? `우리 반은 AI 추천을 확인 없이 승인했고, 편지를 받은 뒤에도 명단을 바꾸지 않았어요. 편지를 보낸 세 사람(${names(letterIds)})은 여전히 대기예요. 이번에는 우리가 이유를 설명할 수 있을까요?`
      : inNow.length > 0
        ? `우리 반이 확인 없이 승인했던 명단이 바뀌었어요. 편지를 보낸 세 사람 가운데 ${inNow.length}명(${names(inNow)})이 이번에는 들어왔어요. 운영자는 게시판을 고쳐야 하고, 자리를 잃은 사람(${names(c.lost)})에게는 우리가 설명해야 해요.`
        : `명단은 바뀌었지만, 편지를 보낸 세 사람(${names(letterIds)})은 이번에도 대기예요. 우리 반이 고친 것은 무엇이었을까요?`;
  } else if (v === 'reject') {
    text = unchanged
      ? '우리 반은 AI 추천을 거부했지만, 새 설정으로 다시 돌린 결과는 처음과 같은 명단이에요. 그때 우리가 거부한 근거는 무엇이었고, 지금은 무엇이 달라졌나요?'
      : `우리 반이 거부했던 추천이 새 설정으로 바뀌었어요. 운영자가 물었던 "근거"를 이제는 이렇게 설명할 수 있어요: ${packageById(pkg).publishes.join('·')}.`;
  } else {
    text = unchanged
      ? '우리 반은 발표를 미루고 조사까지 했지만, 명단은 바꾸지 않기로 했어요. 조사로 얻은 것은 자리가 아니라 설명이에요. 그것으로 충분한가요?'
      : `우리 반이 발표를 미룬 하루 동안 조사한 결과로 명단이 바뀌었어요. 기다려 준 운영자와, 자리를 잃은 사람(${names(c.lost)})에게 무엇을 말해야 할까요?`;
  }
  return (
    <div className="card compact" style={{ borderLeft: '6px solid var(--mint)' }}>
      <p className="h3" style={{ marginBottom: 4 }}>우리 결정의 흔적</p>
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

export function PhaseResult({ state, phase }: { state: PublicState; phase: Phase }) {
  const tally = state.tallies[phase];
  switch (phase) {
    case 'pre_check':
    case 'post_check':
      return (
        <div className="paper">
          <h3 className="h3">{phase === 'pre_check' ? '결정 1 · 지금 내 생각' : '결정 6 · 다시, 내 생각'} 제출 현황</h3>
          <p>
            {tally?.eligible ?? state.joined}명 중 {tally?.responded ?? 0}명이 답했어요. 누가 무엇을 골랐는지는 공개하지 않아요.{' '}
            {phase === 'pre_check' ? '다음 장면에서 AI 배정기의 추천을 봐요.' : '엔딩에서 우리 반 전체의 생각이 어떻게 움직였는지만 묶어서 봐요.'}
          </p>
        </div>
      );
    case 'ai_verdict':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">AI 추천을 어떻게 할지 투표한 결과</h3>
            <TallyBars tally={tally} labels={verdictLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="ai_verdict" />
          {state.decisions.verdict && (
            <div className="band">
              <p className="eyebrow" style={{ color: '#fff' }}>우리 반의 결정</p>
              <p className="h2">{verdictLabels[state.decisions.verdict]}</p>
              <p style={{ margin: '6px 0 0' }}>{VERDICT_OPTIONS.find((o) => o.id === state.decisions.verdict)?.consequence} 다음 장면에서 결과를 봐요.</p>
            </div>
          )}
        </div>
      );
    case 'verdict_result':
      return state.verdictScene ? <VerdictSceneView scene={state.verdictScene} state={state} /> : null;
    case 'investigate':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">어떤 카드를 열지 투표한 결과 (조사 토큰 {state.decisions.tokens ?? 2}개)</h3>
            <TallyBars tally={tally} labels={clueLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="investigate" />
        </div>
      );
    case 'investigate_reveal':
      return (
        <div className="stack">
          {state.revealedClues.map((c) => (
            <ClueCardView key={c.id} clue={c} />
          ))}
          <div className="band magenta">
            <p className="eyebrow" style={{ color: '#fff' }}>AI 배정기가 몰랐던 것</p>
            <p className="h3" style={{ margin: 0 }}>{unknownLine(state.revealedClues.map((c) => c.id))}</p>
            {state.baseClues.length > 0 && <p className="small" style={{ margin: '6px 0 0', opacity: 0.9 }}>아직 열지 않은 카드 {state.baseClues.length}장에도 AI가 묻지 않은 것이 더 있어요. 아래 "기본 자료 보기"에서 확인할 수 있어요.</p>}
          </div>
          <div>
            <h3 className="h2" style={{ marginBottom: 8 }}>관점 보드</h3>
            <p className="muted" style={{ marginTop: 0 }}>네 관점의 한마디를 익명으로 묶었어요. 많이 고른 쪽이 더 옳다는 뜻은 아니에요.</p>
            <PerspectiveBoardView rows={state.perspectiveBoard} />
          </div>
          {state.approvedTexts.filter((t) => t.kind === 'investigate_reason').length > 0 && (
            <div className="paper">
              <h3 className="h3">학급의 이유 (익명 · 선생님 승인)</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {state.approvedTexts
                  .filter((t) => t.kind === 'investigate_reason')
                  .map((t, i) => (
                    <li key={i}>{t.text}</li>
                  ))}
              </ul>
            </div>
          )}
          {state.baseClues.length > 0 && (
            <details className="card compact">
              <summary>기본 자료 보기 — 열지 않은 단서 {state.baseClues.length}장</summary>
              <p className="small muted">조사 토큰은 발견 순서를 정할 뿐, 핵심 근거를 영구히 막지 않아요.</p>
              <div className="stack">
                {state.baseClues.map((c) => (
                  <ClueCardView key={c.id} clue={c} base />
                ))}
              </div>
            </details>
          )}
        </div>
      );
    case 'redesign':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">AI 배정기의 새 설정을 투표한 결과</h3>
            <TallyBars tally={tally} labels={packageLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="redesign" />
          {state.decisions.pkg && (
            <div className="band magenta">
              <p className="eyebrow" style={{ color: '#fff' }}>우리 반이 고른 묶음</p>
              <p className="h2">{packageById(state.decisions.pkg).name}</p>
              <p style={{ margin: '6px 0 0' }}>다음 장면에서 AI 배정기를 다시 돌려요.</p>
            </div>
          )}
        </div>
      );
    case 'redesign_result':
      return state.allocations.r3 && state.decisions.pkg ? (
        <div className="stack">
          <section className="ai-card" aria-label="AI 배정기 다시 돌린 결과">
            <div className="row" style={{ gap: 12 }}>
              <span className="ai-mark" aria-hidden>
                AI
              </span>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>{AI_AGENT.name} 출력 · 새 설정: {packageById(state.decisions.pkg).name}</p>
                <p className="h3" style={{ margin: 0 }}>같은 12명을 다시 계산했어요</p>
              </div>
            </div>
            <div className="printout">
              <p className="printout-line">▶ {packageById(state.decisions.pkg).aiPrintout}</p>
            </div>
          </section>
          <ComparisonView c={state.allocations.r3} />
          <DecisionEcho state={state} />
          <div className="card compact" style={{ borderLeft: '6px solid var(--warn)' }}>
            <p className="h3" style={{ marginBottom: 4 }}>남은 문제</p>
            <p style={{ margin: 0 }}>{packageById(state.decisions.pkg).remainingProblem}</p>
          </div>
        </div>
      ) : null;
    case 'transfer':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">먼저 물어볼 질문을 투표한 결과</h3>
            <TallyBars tally={tally} labels={questionLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="transfer" />
          {state.decisions.questions && (
            <div className="band">
              <p className="eyebrow" style={{ color: '#fff' }}>우리 반의 약속 — AI 결정을 받으면 먼저 묻기</p>
              <ol style={{ margin: 0, paddingLeft: 22, fontSize: '1.15em', fontWeight: 700 }}>
                {state.decisions.questions.map((q) => (
                  <li key={q}>{questionLabels[q]}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
}

export function EndingContent({ e, big }: { e: EndingSummary; big?: boolean }) {
  const shift = e.surveyShift;
  const topAfter = shift
    ? Object.entries(shift.after)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(([k]) => checkLabels[k])
        .join('')
    : null;
  return (
    <div className="stack" style={{ gap: big ? 14 : 10 }}>
      <h2 className="h2">우리의 기준은 이렇게 달라졌다</h2>
      <p>
        우리 반은 AI 추천을 <strong>{e.verdictLabel}</strong>했고, AI 배정기의 새 설정으로 <strong>{e.pkgName}</strong>을 골랐어요.
        {e.gained.length > 0 && (
          <>
            {' '}
            그 결과 {e.gained.join('·')}이 새로 자리를 얻고, {e.lost.join('·')}이 자리를 잃었어요.
          </>
        )}
        {e.gained.length === 0 && ' 그 결과 자리는 처음 추천과 같아요.'}
      </p>
      {e.verdictNote && <p className="small" style={{ margin: 0, opacity: 0.9 }}>{e.verdictNote}</p>}
      <div>
        <p style={{ fontWeight: 700 }}>AI 결정을 받으면 먼저 물어볼 질문</p>
        <ul>{e.questions.length ? e.questions.map((q) => <li key={q}>{q}</li>) : <li>(아직 정하지 못했어요)</li>}</ul>
      </div>
      <p>
        <strong>아직 풀지 못한 질문</strong> — {e.openQuestion}
      </p>
      {shift && (
        <p className="small">
          "AI 배정기가 자료대로 계산하면 공정할까?"에 수업 처음에는 {shift.respondedBefore}명, 마지막에는 {shift.respondedAfter}명이 답했어요. 마지막에 가장 많이 고른 답은 "{topAfter}"예요.
        </p>
      )}
    </div>
  );
}

/** 엔딩에서 체험을 원칙 이름에 연결 */
export function PrinciplesBlock({ e }: { e: EndingSummary }) {
  return (
    <div className="grid-2">
      {e.principles.map((p) => (
        <div key={p.id} className="paper compact" style={{ display: 'flex', gap: 12 }}>
          <img src={imgSrc(p.id === 'fairness' ? 'principle-fairness' : ('principle-transparency' as ImageId), 320)} alt="" width={84} height={84} style={{ flex: '0 0 auto' }} />
          <div>
            <p className="eyebrow" style={{ color: '#8a2a6b', margin: 0 }}>대한민국 인공지능 윤리원칙</p>
            <p className="h3" style={{ margin: '2px 0' }}>{p.name}</p>
            <p className="small muted" style={{ margin: 0 }}>{p.official}</p>
            <p style={{ margin: '6px 0 0' }}>
              <strong>오늘 우리는</strong> {p.whatWeDid}
            </p>
          </div>
        </div>
      ))}
      <div className="paper compact" style={{ gridColumn: '1 / -1' }}>
        <BadgeRow badges={e.badges} />
      </div>
    </div>
  );
}
