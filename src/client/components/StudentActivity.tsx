// 학생 활동 화면: 한 장면에 질문 1개, 선택지 3~4개. 제출 전에는 분포를 보여 주지 않는다.
import { useEffect, useState, type ReactNode } from 'react';
import {
  CLUES,
  FREE_TEXT_MAX,
  INFO_QUESTION,
  PACKAGES,
  POLICIES,
  PRACTICE_OPTIONS,
  PRACTICE_QUESTION,
  QUESTION_CANDIDATES,
  SURVEY_OPTIONS,
  SURVEY_QUESTION,
  TRANSFER_SCENARIO,
  perspectiveById,
} from '../../shared/content';
import type { ClueId, MeState, PackageId, PolicyId, PublicState, SubmissionPayload, SurveyChoice } from '../../shared/types';
import { imgSrc, imgSrcSet, type ImageId } from '../lib/images';
import { useToast } from './ui';

interface Props {
  state: PublicState;
  me: MeState;
  submit: (payload: SubmissionPayload) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
}

function Choice({ pressed, onClick, title, desc, index, disabled, checkbox }: { pressed: boolean; onClick: () => void; title: string; desc?: string; index: number; disabled?: boolean; checkbox?: boolean }) {
  return (
    <button type="button" className="choice" aria-pressed={checkbox ? undefined : pressed} aria-checked={checkbox ? pressed : undefined} role={checkbox ? 'checkbox' : undefined} onClick={onClick} disabled={disabled}>
      <span className="mark" aria-hidden>
        {pressed ? '✓' : index + 1}
      </span>
      <span className="body">
        <span className="title">{title}</span>
        {desc && <span className="desc">{desc}</span>}
      </span>
    </button>
  );
}

function ReasonBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span style={{ fontWeight: 700 }}>
        {label} <span className="muted small">(선택 · {FREE_TEXT_MAX}자 이내)</span>
      </span>
      <textarea className="input" value={value} maxLength={FREE_TEXT_MAX} onChange={(e) => onChange(e.target.value)} placeholder="실명이나 개인 사정은 적지 않아요. 선생님이 확인한 뒤에만 익명으로 공개돼요." />
      <span className="small muted mono" style={{ alignSelf: 'flex-end' }}>
        {value.length}/{FREE_TEXT_MAX}
      </span>
    </label>
  );
}

function SubmitBar({ canSubmit, submitted, busy, onSubmit, locked }: { canSubmit: boolean; submitted: boolean; busy: boolean; onSubmit: () => void; locked: boolean }) {
  if (locked) return <div className="banner">제출이 마감됐어요. {submitted ? '내 응답은 저장돼 있어요.' : '이번 활동에는 응답하지 않은 것으로 집계돼요.'}</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className={`btn lg block ${submitted ? 'ghost' : 'green'}`} disabled={!canSubmit || busy} onClick={onSubmit}>
        {busy ? '보내는 중…' : submitted ? '다시 제출하기 (마지막 응답으로 바뀌어요)' : '제출하기'}
      </button>
      {submitted && (
        <p className="small muted" style={{ margin: 0 }}>
          제출됐어요. 마감 전에는 바꿀 수 있어요. 다른 친구의 선택은 마감 뒤 선생님이 공개할 때 함께 봐요.
        </p>
      )}
    </div>
  );
}

function useSubmitter(submit: Props['submit']) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async (payload: SubmissionPayload) => {
    setBusy(true);
    const r = await submit(payload);
    setBusy(false);
    if (r.ok) toast('제출됐어요.');
    else toast(r.message, 'error');
    return r.ok;
  };
  return { busy, go };
}

function Frame({ question, children, hint }: { question: string; children: ReactNode; hint?: string }) {
  return (
    <section className="paper fade-in" aria-label={question}>
      <h2 className="h2" style={{ marginBottom: 6 }}>{question}</h2>
      {hint && <p className="muted" style={{ marginTop: 0 }}>{hint}</p>}
      <div className="stack" style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

// ---------- 각 활동 ----------

export function PracticeActivity({ state, me, submit }: Props) {
  const prev = me.submissions.practice?.payload;
  const [choice, setChoice] = useState<string | null>(prev?.kind === 'practice' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit);
  return (
    <Frame question={PRACTICE_QUESTION} hint="연습이에요. 고르고 제출하면 '제출됨'이 뜨고, 선생님이 공개하면 반 전체의 분포를 함께 봐요.">
      <div className="choice-list">
        {PRACTICE_OPTIONS.map((o, i) => (
          <Choice key={o.id} index={i} title={o.label} pressed={choice === o.id} onClick={() => setChoice(o.id)} disabled={state.round.locked} />
        ))}
      </div>
      <SubmitBar canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'practice', choice: choice as never })} />
    </Frame>
  );
}

export function SurveyActivity({ state, me, submit, post }: Props & { post?: boolean }) {
  const phase = post ? 'r5_post' : 'pre_survey';
  const prev = me.submissions[phase]?.payload;
  const before = me.submissions.pre_survey?.payload;
  const [choice, setChoice] = useState<SurveyChoice | null>(prev && 'choice' in prev ? (prev.choice as SurveyChoice) : null);
  const [conf, setConf] = useState<1 | 2 | 3 | null>(prev && 'confidence' in prev ? prev.confidence : null);
  const [reason, setReason] = useState('');
  const { busy, go } = useSubmitter(submit);
  const beforeLabel = before && before.kind === 'survey' ? SURVEY_OPTIONS.find((o) => o.id === before.choice)?.label : null;
  return (
    <Frame question={SURVEY_QUESTION} hint={post ? '처음 질문에 다시 답해요. 생각이 유지됐든 바뀌었든 이유가 중요해요. 바꿨다고 점수가 더 있지는 않아요.' : '지금 생각을 솔직하게. 정답은 없고, 내 답은 공개되지 않아요.'}>
      {post && beforeLabel && (
        <div className="banner" style={{ background: 'var(--paper-2)', color: 'var(--paper-ink)' }}>
          수업 시작 때 내 답: <strong>{beforeLabel}</strong>
        </div>
      )}
      <div className="choice-list">
        {SURVEY_OPTIONS.map((o, i) => (
          <Choice key={o.id} index={i} title={o.label} pressed={choice === o.id} onClick={() => setChoice(o.id)} disabled={state.round.locked} />
        ))}
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>얼마나 확신하나요?</legend>
        <div className="row">
          {([1, 2, 3] as const).map((c) => (
            <button key={c} type="button" className="btn sm" style={{ background: conf === c ? 'var(--primary)' : 'var(--paper-2)', color: conf === c ? '#fff' : 'var(--paper-ink)' }} aria-pressed={conf === c} onClick={() => setConf(c)} disabled={state.round.locked}>
              {c === 1 ? '잘 모르겠다' : c === 2 ? '어느 정도' : '확신한다'}
            </button>
          ))}
        </div>
      </fieldset>
      <ReasonBox value={reason} onChange={setReason} label={post ? '생각이 유지됐거나 바뀐 이유를 한 문장으로' : '짧은 이유'} />
      <SubmitBar
        canSubmit={!!choice && !!conf}
        submitted={me.submittedThisRound}
        busy={busy}
        locked={state.round.locked}
        onSubmit={() => choice && conf && go(post ? { kind: 'post', choice, confidence: conf, reason: reason || undefined } : { kind: 'survey', choice, confidence: conf, reason: reason || undefined })}
      />
    </Frame>
  );
}

export function PolicyActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r1_vote?.payload;
  const [choice, setChoice] = useState<PolicyId | 'abstain' | null>(prev?.kind === 'policy' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit);
  const limit = state.round.limitTo;
  const options = POLICIES.filter((p) => !limit || limit.includes(p.id));
  return (
    <Frame question="첫 배정 규칙을 무엇으로 할까?" hint={limit ? '동률 재투표예요. 동률이었던 규칙 중에서만 고를 수 있어요.' : '세 규칙 모두 이점과 비용이 있어요. 비밀 투표, 1인 1표.'}>
      <div className="choice-list">
        {options.map((p, i) => (
          <Choice key={p.id} index={i} title={`${p.name} — ${p.short}`} desc={`${p.formula}  ·  좋은 점: ${p.benefit}  ·  비용: ${p.cost}`} pressed={choice === p.id} onClick={() => setChoice(p.id)} disabled={state.round.locked} />
        ))}
        <Choice index={options.length} title="아직 모르겠다 / 판단 보류" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
      </div>
      <SubmitBar canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'policy', choice })} />
    </Frame>
  );
}

export function InfoActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r1_info?.payload;
  const [choice, setChoice] = useState<ClueId | 'abstain' | null>(prev?.kind === 'info' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit);
  return (
    <Frame question={INFO_QUESTION} hint="하나만 골라요. 라운드 2에서 조사 카드를 고를 때 참고해요.">
      <div className="choice-list">
        {CLUES.map((c, i) => (
          <Choice key={c.id} index={i} title={c.title} desc={c.question} pressed={choice === c.id} onClick={() => setChoice(c.id)} disabled={state.round.locked} />
        ))}
        <Choice index={CLUES.length} title="아직 모르겠다" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
      </div>
      <SubmitBar canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'info', choice })} />
    </Frame>
  );
}

export function InvestigateActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r2_choose?.payload;
  const p = perspectiveById(me.perspective);
  const [picks, setPicks] = useState<ClueId[]>(prev?.kind === 'investigate' ? [prev.first, prev.second] : []);
  const [tag, setTag] = useState<string | null>(prev?.kind === 'investigate' ? prev.tag : null);
  const [reason, setReason] = useState('');
  const { busy, go } = useSubmitter(submit);
  const toggle = (id: ClueId) => setPicks((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= 2 ? [xs[1]!, id] : [...xs, id]));
  return (
    <div className="stack">
      <section className="card compact row" style={{ gap: 14, alignItems: 'center' }} aria-label="내 관점 카드">
        <img src={imgSrc(p.image as ImageId, 320)} srcSet={imgSrcSet(p.image as ImageId)} sizes="96px" alt={p.alt} width={96} height={96} style={{ borderRadius: 16 }} />
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>내 관점 카드 (무작위 · 실제 나와 무관)</p>
          <p className="h3" style={{ margin: '2px 0' }}>{p.name}</p>
          <p className="small" style={{ margin: 0, color: 'var(--ink-dim)' }}>{p.prompt}</p>
        </div>
      </section>
      <Frame question="조사 토큰 2개로 어떤 카드를 열까?" hint="카드 2장을 골라요(순서는 첫 번째가 더 열고 싶은 카드). 학급 투표로 상위 2장이 열려요.">
        <div className="choice-list">
          {CLUES.map((c, i) => {
            const idx = picks.indexOf(c.id);
            return (
              <Choice key={c.id} index={i} checkbox title={`${c.title}${idx >= 0 ? `  (${idx + 1}번째 토큰)` : ''}`} desc={c.question} pressed={idx >= 0} onClick={() => toggle(c.id)} disabled={state.round.locked} />
            );
          })}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>{p.name} 입장에서 가장 가까운 생각은?</legend>
          <div className="choice-list">
            {p.tags.map((t, i) => (
              <Choice key={t.id} index={i} title={t.label} pressed={tag === t.id} onClick={() => setTag(t.id)} disabled={state.round.locked} />
            ))}
          </div>
        </fieldset>
        <ReasonBox value={reason} onChange={setReason} label="이유 한 줄" />
        <SubmitBar canSubmit={picks.length === 2 && !!tag} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => picks.length === 2 && tag && go({ kind: 'investigate', first: picks[0]!, second: picks[1]!, tag, reason: reason || undefined })} />
      </Frame>
    </div>
  );
}

export function PackageActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r3_vote?.payload;
  const [choice, setChoice] = useState<PackageId | 'abstain' | null>(prev?.kind === 'package' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit);
  const limit = state.round.limitTo;
  const options = PACKAGES.filter((p) => !limit || limit.includes(p.id));
  return (
    <Frame question="규칙을 어떻게 다시 설계할까?" hint={limit ? '동률 재투표예요. 동률이었던 패키지 중에서만 고를 수 있어요.' : '배정 기준·설명 방식·이의 제기를 묶은 완결된 패키지 중 하나를 골라요. 조각을 섞을 수는 없어요.'}>
      <div className="choice-list">
        {options.map((p, i) => (
          <Choice key={p.id} index={i} title={`${p.name}  ·  ${p.kind}`} desc={`배정: ${p.criteria}  ·  설명: ${p.explanation}  ·  이의 제기: ${p.appeal}`} pressed={choice === p.id} onClick={() => setChoice(p.id)} disabled={state.round.locked} />
        ))}
        <Choice index={options.length} title="아직 모르겠다 / 판단 보류" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
      </div>
      <SubmitBar canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'package', choice })} />
    </Frame>
  );
}

export function QuestionsActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r4_questions?.payload;
  const [picks, setPicks] = useState<string[]>(prev?.kind === 'questions' ? [...prev.picks] : []);
  const [abstain, setAbstain] = useState(prev?.kind === 'questions' ? !!prev.abstain : false);
  const { busy, go } = useSubmitter(submit);
  const limit = state.round.limitTo;
  const options = QUESTION_CANDIDATES.filter((q) => !limit || limit.includes(q.id));
  const toggle = (id: string) => {
    setAbstain(false);
    setPicks((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= 2 ? [xs[1]!, id] : [...xs, id]));
  };
  return (
    <Frame question="AI 결정을 받으면 먼저 물어볼 질문 2개는?" hint="오늘 조사에서 가장 쓸모 있었던 질문을 떠올려요. 상위 2개가 우리 반의 약속이 돼요.">
      <div className="choice-list">
        {options.map((q, i) => (
          <Choice key={q.id} index={i} checkbox title={q.text} pressed={picks.includes(q.id)} onClick={() => toggle(q.id)} disabled={state.round.locked} />
        ))}
        <Choice
          index={options.length}
          title="아직 모르겠다 / 판단 보류"
          pressed={abstain}
          onClick={() => {
            setAbstain(true);
            setPicks([]);
          }}
          disabled={state.round.locked}
        />
      </div>
      <SubmitBar canSubmit={picks.length === 2 || abstain} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => go(abstain ? { kind: 'questions', picks: [], abstain: true } : { kind: 'questions', picks: [picks[0]!, picks[1]!] })} />
    </Frame>
  );
}

export function TransferActivity({ state, me, submit }: Props) {
  const prev = me.submissions.r4_transfer?.payload;
  const [choice, setChoice] = useState<string | null>(prev?.kind === 'transfer' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit);
  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">{TRANSFER_SCENARIO.title}</p>
        <p style={{ margin: 0, fontSize: 18 }}>{TRANSFER_SCENARIO.story}</p>
      </section>
      <Frame question={TRANSFER_SCENARIO.question} hint="우리 반이 정한 질문을 떠올려 봐요.">
        <div className="choice-list">
          {TRANSFER_SCENARIO.options.map((o, i) => (
            <Choice key={o.id} index={i} title={o.label} pressed={choice === o.id} onClick={() => setChoice(o.id)} disabled={state.round.locked} />
          ))}
        </div>
        <SubmitBar canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'transfer', choice })} />
      </Frame>
    </div>
  );
}

/** 제출 후 대기 중 짧은 되돌아보기 */
export function WaitingReflection({ phase }: { phase: string }) {
  const prompts: Record<string, string> = {
    practice: '제출 전에 다른 친구의 선택이 보이지 않았죠? 왜 그렇게 만들었을지 생각해 봐요.',
    pre_survey: '내가 고른 답의 반대 입장이라면 어떤 이유를 댈까요?',
    r1_vote: '내가 고른 규칙에서 가장 불리해질 사람은 누구일까요? 한 명만 떠올려 봐요.',
    r1_info: 'AI가 쓰지 않은 정보 중에 중요한 게 있을까요?',
    r2_choose: '내 관점 카드의 사람이 결과를 들으면 가장 먼저 무엇을 물을까요?',
    r3_vote: '내가 고른 패키지로 새롭게 불리해지는 사람에게 뭐라고 설명할까요?',
    r4_questions: '그 질문에 답을 못 받으면 그 결정을 받아들여도 될까요?',
    r4_transfer: '"출석률"은 오늘 본 어떤 기준과 닮았나요?',
    r5_post: '오늘 내 생각에 가장 영향을 준 장면은 무엇이었나요?',
  };
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDots((d) => (d + 1) % 4), 600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="card compact" role="status">
      <p className="h3" style={{ marginBottom: 4 }}>다른 친구들을 기다리는 중{'.'.repeat(dots)}</p>
      <p style={{ margin: 0, color: 'var(--ink-dim)' }}>{prompts[phase] ?? '잠시 기다려요.'}</p>
    </div>
  );
}
