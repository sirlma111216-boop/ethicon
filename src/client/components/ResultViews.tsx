// 공개 후 결과 화면: 학생·공개 화면·교사 화면이 공유한다. 집계는 서버가 계산한 값만 표시한다.
import { CLUES, PACKAGES, POLICIES, PRACTICE_OPTIONS, QUESTION_CANDIDATES, SURVEY_OPTIONS, TRANSFER_SCENARIO, applicantById, packageById, policyById } from '../../shared/content';
import type { EndingSummary, Phase, PublicState } from '../../shared/types';
import { AllocationView, BadgeRow, ClueCardView, ComparisonView, PerspectiveBoardView, TallyBars } from './ui';

const policyLabels = Object.fromEntries(POLICIES.map((p) => [p.id, p.name]));
const packageLabels = Object.fromEntries(PACKAGES.map((p) => [p.id, p.name]));
const clueLabels = Object.fromEntries(CLUES.map((c) => [c.id, c.title]));
const questionLabels = Object.fromEntries(QUESTION_CANDIDATES.map((q) => [q.id, q.text]));
const practiceLabels = Object.fromEntries(PRACTICE_OPTIONS.map((o) => [o.id, o.label]));
const transferLabels = Object.fromEntries(TRANSFER_SCENARIO.options.map((o) => [o.id, o.label]));
export const surveyLabels = Object.fromEntries(SURVEY_OPTIONS.map((o) => [o.id, o.label]));

export function TieNotice({ state }: { state: PublicState }) {
  const tie = state.round.tie;
  if (!tie) return null;
  if (tie.length === 0) return <div className="banner warn">응답이 없어 결정하지 못했어요. 선생님이 시간을 연장하거나 결정을 내려요.</div>;
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

export function PhaseResult({ state, phase }: { state: PublicState; phase: Phase }) {
  const tally = state.tallies[phase];
  switch (phase) {
    case 'practice':
      return (
        <div className="paper">
          <h3 className="h3">연습 결과</h3>
          <TallyBars tally={tally} labels={practiceLabels} caption="제출이 잠긴 뒤에야 분포가 보여요. 3명 미만 항목은 묶어서 보여 줘요." />
        </div>
      );
    case 'pre_survey':
    case 'r5_post':
      return (
        <div className="paper">
          <h3 className="h3">{phase === 'pre_survey' ? '사전 판단' : '개인 성찰'} 제출 현황</h3>
          <p>응답 {tally?.responded ?? 0}명 / 전체 {tally?.eligible ?? state.joined}명. 이 문항의 분포와 이유는 공개하지 않아요.</p>
        </div>
      );
    case 'r1_vote':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">첫 배정 규칙 투표</h3>
            <TallyBars tally={tally} labels={policyLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="r1_vote" />
          {state.decisions.policy && (
            <div className="band">
              <p className="eyebrow" style={{ color: '#fff' }}>학급이 고른 규칙</p>
              <p className="h2">{policyById(state.decisions.policy).name}</p>
              <p style={{ margin: '6px 0 0' }}>{policyById(state.decisions.policy).formula}</p>
            </div>
          )}
        </div>
      );
    case 'r1_result':
      return state.allocations.r1 ? (
        <div className="paper">
          <h3 className="h3">AI 추천: {policyById(state.allocations.r1.policyOrPackage as never).name} 규칙으로 배정한 6명</h3>
          <AllocationView result={state.allocations.r1} />
          {state.lottery.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary>이 방의 동점 추첨 순서 보기</summary>
              <p className="small">{state.lottery.map((id, i) => `${i + 1}. ${applicantById(id).name}`).join('  ')}</p>
              <p className="small muted">방을 만들 때 정해진 순서예요. 같은 조건이면 다시 계산해도 같은 결과가 나와요.</p>
            </details>
          )}
        </div>
      ) : null;
    case 'r1_info':
      return (
        <div className="paper">
          <h3 className="h3">학급이 더 알고 싶은 정보</h3>
          <TallyBars tally={tally} labels={clueLabels} />
        </div>
      );
    case 'r2_choose':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">조사 토큰 투표 (각자 2장)</h3>
            <TallyBars tally={tally} labels={clueLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="r2_choose" />
        </div>
      );
    case 'r2_reveal':
      return (
        <div className="stack">
          {state.revealedClues.map((c) => (
            <ClueCardView key={c.id} clue={c} />
          ))}
          <div>
            <h3 className="h2" style={{ marginBottom: 8 }}>관점 보드</h3>
            <p className="muted" style={{ marginTop: 0 }}>네 관점의 의견을 익명으로 묶었어요. 많이 고른 쪽이 더 옳다는 뜻은 아니에요.</p>
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
              <p className="small muted">조사 비용은 발견 순서를 정할 뿐, 핵심 근거를 영구히 막지 않아요.</p>
              <div className="stack">
                {state.baseClues.map((c) => (
                  <ClueCardView key={c.id} clue={c} base />
                ))}
              </div>
            </details>
          )}
        </div>
      );
    case 'r3_vote':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">새 규칙 패키지 투표</h3>
            <TallyBars tally={tally} labels={packageLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="r3_vote" />
          {state.decisions.pkg && (
            <div className="band magenta">
              <p className="eyebrow" style={{ color: '#fff' }}>학급이 고른 패키지</p>
              <p className="h2">{packageById(state.decisions.pkg).name}</p>
            </div>
          )}
        </div>
      );
    case 'r3_result':
      return state.allocations.r3 && state.decisions.pkg ? (
        <div className="stack">
          <ComparisonView c={state.allocations.r3} />
          <div className="card compact" style={{ borderLeft: '6px solid var(--warn)' }}>
            <p className="h3" style={{ marginBottom: 4 }}>남은 문제</p>
            <p style={{ margin: 0 }}>{packageById(state.decisions.pkg).remainingProblem}</p>
          </div>
        </div>
      ) : null;
    case 'r4_questions':
      return (
        <div className="stack">
          <div className="paper">
            <h3 className="h3">먼저 물어볼 질문 투표</h3>
            <TallyBars tally={tally} labels={questionLabels} />
          </div>
          <TieNotice state={state} />
          <TeacherDecisionNote state={state} phase="r4_questions" />
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
    case 'r4_transfer':
      return (
        <div className="paper">
          <h3 className="h3">{TRANSFER_SCENARIO.title} — 가장 먼저 확인할 것</h3>
          <TallyBars tally={tally} labels={transferLabels} />
        </div>
      );
    default:
      return null;
  }
}

export function EndingContent({ e, big }: { e: EndingSummary; big?: boolean }) {
  const shift = e.surveyShift;
  return (
    <div className="stack" style={{ gap: big ? 14 : 10 }}>
      <h2 className="h2">우리의 기준은 이렇게 달라졌다</h2>
      <p>
        처음 규칙 <strong>{e.policyName}</strong> → 새 규칙 <strong>{e.pkgName}</strong>
      </p>
      <div>
        <p style={{ fontWeight: 700 }}>AI 결정을 받으면 먼저 물어볼 질문</p>
        <ul>
          {e.questions.length ? e.questions.map((q) => <li key={q}>{q}</li>) : <li>(아직 정하지 못했어요)</li>}
        </ul>
      </div>
      <p>
        <strong>아직 풀지 못한 질문</strong> — {e.openQuestion}
      </p>
      {shift && (
        <p className="small">
          "같은 규칙이면 늘 공정할까?" 사전 {shift.respondedBefore}명 · 사후 {shift.respondedAfter}명 응답. 사후에 가장 많이 고른 답:{' '}
          {Object.entries(shift.after)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 1)
            .map(([k]) => surveyLabels[k])
            .join('')}
        </p>
      )}
      <BadgeRow badges={e.badges} />
    </div>
  );
}
