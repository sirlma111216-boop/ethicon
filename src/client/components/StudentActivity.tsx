// 학생 활동 화면: 한 장면에 결정 1개. 무엇을 몇 개 골라야 하는지 맨 위에 적는다. 제출 전에는 분포를 보여 주지 않는다.
import { useEffect, useState, type ReactNode } from 'react';
import { CHECK_OPTIONS, CHECK_QUESTION, CLUES, FREE_TEXT_MAX, PACKAGES, QUESTION_CANDIDATES, TRANSFER_SCENARIO, VERDICT_OPTIONS, VERDICT_QUESTION, perspectiveById } from '../../shared/content';
import type { CheckChoice, ClueId, MeState, PackageId, PublicState, SubmissionPayload, VerdictChoice } from '../../shared/types';
import { imgSrc, imgSrcSet, type ImageId } from '../lib/images';
import { AiVerdictCard } from './ResultViews';
import { Picture } from './ui';
import { useToast } from './ui';

export interface ActivityProps {
  state: PublicState;
  me: MeState;
  submit: (payload: SubmissionPayload) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  preview?: boolean;
}

function Choice({ pressed, onClick, title, desc, index, disabled, checkbox, badge }: { pressed: boolean; onClick: () => void; title: string; desc?: string; index: number; disabled?: boolean; checkbox?: boolean; badge?: string }) {
  return (
    <button type="button" className="choice" aria-pressed={checkbox ? undefined : pressed} aria-checked={checkbox ? pressed : undefined} role={checkbox ? 'checkbox' : undefined} onClick={onClick} disabled={disabled}>
      <span className="mark" aria-hidden>
        {pressed ? '✓' : index + 1}
      </span>
      <span className="body">
        <span className="title">
          {title}
          {badge && <span className="pill paper" style={{ marginLeft: 8, fontSize: 12 }}>{badge}</span>}
        </span>
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

function SubmitBar({ canSubmit, submitted, busy, onSubmit, locked, hint }: { canSubmit: boolean; submitted: boolean; busy: boolean; onSubmit: () => void; locked: boolean; hint: string }) {
  if (locked) return <div className="banner">제출이 마감됐어요. {submitted ? '내 응답은 저장돼 있어요.' : '이번 결정에는 응답하지 않은 것으로 집계돼요.'}</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className={`btn lg block ${submitted ? 'ghost' : 'green'}`} disabled={!canSubmit || busy} onClick={onSubmit}>
        {busy ? '보내는 중…' : submitted ? '다시 제출하기 (마지막 응답으로 바뀌어요)' : canSubmit ? '제출하기' : hint}
      </button>
      {submitted && <p className="small muted" style={{ margin: 0 }}>제출됐어요. 마감 전에는 바꿀 수 있어요. 다른 친구의 선택은 선생님이 공개할 때 함께 봐요.</p>}
    </div>
  );
}

function useSubmitter(submit: ActivityProps['submit'], preview?: boolean) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async (payload: SubmissionPayload) => {
    if (preview) {
      toast('교사 미리보기에서는 제출되지 않아요.');
      return false;
    }
    setBusy(true);
    const r = await submit(payload);
    setBusy(false);
    if (r.ok) toast('제출됐어요.');
    else toast(r.message, 'error');
    return r.ok;
  };
  return { busy, go };
}

/** 결정 1·2 상단의 AI 배정기 키아트. 모바일 세로에서는 세로 구도 원본을 아래쪽(기계·인물)이 보이게 자른다. */
export function KioskHeader({ eyebrow, title, line }: { eyebrow: string; title: string; line: string }) {
  return (
    <div className="scene kiosk-header">
      <Picture id="ai-kiosk" mobileId="ai-kiosk-mobile" sizes="(max-width: 767px) 100vw, 1200px" />
      <div className="overlay">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="h1">{title}</h2>
        <p style={{ color: 'var(--ink-dim)' }}>{line}</p>
      </div>
    </div>
  );
}

function Frame({ question, children, hint, eyebrow }: { question: string; children: ReactNode; hint?: string; eyebrow?: string }) {
  return (
    <section className="paper fade-in" aria-label={question}>
      {eyebrow && <p className="eyebrow" style={{ color: '#8a2a6b', margin: '0 0 4px' }}>{eyebrow}</p>}
      <h2 className="h2" style={{ marginBottom: 6 }}>{question}</h2>
      {hint && <p className="muted" style={{ marginTop: 0 }}>{hint}</p>}
      <div className="stack" style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

// ---------- 결정 1·6: 지금 내 생각 ----------

export function CheckActivity({ state, me, submit, preview, post }: ActivityProps & { post?: boolean }) {
  const phase = post ? 'post_check' : 'pre_check';
  const prev = me.submissions[phase]?.payload;
  const before = me.submissions.pre_check?.payload;
  const [choice, setChoice] = useState<CheckChoice | null>(prev && 'choice' in prev ? (prev.choice as CheckChoice) : null);
  const [reason, setReason] = useState('');
  const { busy, go } = useSubmitter(submit, preview);
  const beforeLabel = before && before.kind === 'precheck' ? CHECK_OPTIONS.find((o) => o.id === before.choice)?.label : null;
  return (
    <div className="stack">
    {!post && <KioskHeader eyebrow="결정 1" title="AI 배정기가 추천한다면" line="운영팀이 올해 처음 들인 AI 배정기. 자료대로 계산한 결과는 공정할까요?" />}
    <Frame eyebrow={post ? '결정 6 · 다시, 내 생각' : '결정 1 · 지금 내 생각'} question={CHECK_QUESTION} hint={post ? '오늘 본 것을 떠올리며 다시 답해요. 생각을 바꿔도, 지켜도 점수는 없어요. 이유를 한 줄 적어도 좋아요.' : '지금 내 생각과 가장 가까운 것을 하나만 골라요. 정답은 없고, 내 답은 공개되지 않아요. 수업 끝에 같은 질문에 다시 답해요.'}>
      {post && beforeLabel && (
        <div className="banner" style={{ background: 'var(--paper-2)', color: 'var(--paper-ink)' }}>
          수업 시작 때 내 답: <strong>{beforeLabel}</strong>
        </div>
      )}
      <div className="choice-list">
        {CHECK_OPTIONS.map((o, i) => (
          <Choice key={o.id} index={i} title={o.label} desc={o.desc} pressed={choice === o.id} onClick={() => setChoice(o.id)} disabled={state.round.locked} />
        ))}
      </div>
      {post && <ReasonBox value={reason} onChange={setReason} label="그렇게 생각한 이유 한 줄" />}
      <SubmitBar hint="하나를 고르면 제출할 수 있어요" canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go(post ? { kind: 'postcheck', choice, reason: reason || undefined } : { kind: 'precheck', choice })} />
    </Frame>
    </div>
  );
}

// ---------- 결정 2: AI 추천을 어떻게 할까 ----------

export function VerdictActivity({ state, me, submit, preview }: ActivityProps) {
  const prev = me.submissions.ai_verdict?.payload;
  const [choice, setChoice] = useState<VerdictChoice | 'abstain' | null>(prev?.kind === 'verdict' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit, preview);
  const limit = state.round.limitTo;
  const options = VERDICT_OPTIONS.filter((o) => !limit || limit.includes(o.id));
  return (
    <div className="stack">
      <KioskHeader eyebrow="결정 2" title="AI 배정기의 추천이 나왔다" line="빈 칸 여섯 개에 여섯 명의 이름. 우리 위원회는 이 추천을 어떻게 할까요?" />
      {state.allocations.r1 && <AiVerdictCard result={state.allocations.r1} />}
      <Frame eyebrow="결정 2" question={VERDICT_QUESTION} hint={limit ? '동률 재투표예요. 동률이었던 선택지 중에서만 고를 수 있어요.' : '세 가지 중 하나를 골라요. 우리 반이 많이 고른 쪽으로 결정되고, 그 결정에 따라 다음 장면이 달라져요.'}>
        <div className="choice-list">
          {options.map((o, i) => (
            <Choice key={o.id} index={i} title={o.label} desc={`${o.desc}  ·  ${o.consequence}`} pressed={choice === o.id} onClick={() => setChoice(o.id)} disabled={state.round.locked} />
          ))}
          <Choice index={options.length} title="아직 모르겠다 / 판단 보류" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
        </div>
        <SubmitBar hint="하나를 고르면 제출할 수 있어요" canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'verdict', choice })} />
      </Frame>
    </div>
  );
}

// ---------- 결정 3: 무엇부터 조사할까 ----------

export function InvestigateActivity({ state, me, submit, preview }: ActivityProps) {
  const prev = me.submissions.investigate?.payload;
  const tokens = state.decisions.tokens ?? 2;
  const p = perspectiveById(me.perspective);
  const [picks, setPicks] = useState<ClueId[]>(prev?.kind === 'investigate' ? [...prev.picks] : []);
  const [tag, setTag] = useState<string | null>(prev?.kind === 'investigate' ? prev.tag : null);
  const [reason, setReason] = useState('');
  const { busy, go } = useSubmitter(submit, preview);
  const toggle = (id: ClueId) => setPicks((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= tokens ? [...xs.slice(1), id] : [...xs, id]));
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
      <Frame eyebrow={`결정 3 · 조사 토큰 ${tokens}개`} question={tokens === 1 ? '카드 한 장만 열 수 있어요. 무엇부터 조사할까?' : '카드 두 장을 열 수 있어요. 무엇부터 조사할까?'} hint={`① 카드 ${tokens}장 고르기 → ② ${p.name} 입장의 한마디 하나 고르기 → ③ 제출. 많이 고른 카드 ${tokens}장이 열려요.`}>
        <div className="choice-list">
          {CLUES.map((c, i) => {
            const idx = picks.indexOf(c.id);
            return <Choice key={c.id} index={i} checkbox title={c.title} desc={c.question} badge={idx >= 0 ? (tokens === 1 ? '선택' : `${idx + 1}번째 토큰`) : undefined} pressed={idx >= 0} onClick={() => toggle(c.id)} disabled={state.round.locked} />;
          })}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>② {p.name} 입장에서 가장 가까운 한마디는?</legend>
          <div className="choice-list">
            {p.tags.map((t, i) => (
              <Choice key={t.id} index={i} title={t.label} pressed={tag === t.id} onClick={() => setTag(t.id)} disabled={state.round.locked} />
            ))}
          </div>
        </fieldset>
        <ReasonBox value={reason} onChange={setReason} label="이유 한 줄" />
        <SubmitBar hint={picks.length < tokens ? `카드 ${tokens - picks.length}장을 더 골라요` : '한마디를 골라요'} canSubmit={picks.length === tokens && !!tag} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => picks.length === tokens && tag && go({ kind: 'investigate', picks, tag, reason: reason || undefined })} />
      </Frame>
    </div>
  );
}

// ---------- 결정 4: 규칙을 어떻게 바꿀까 ----------

export function PackageActivity({ state, me, submit, preview }: ActivityProps) {
  const prev = me.submissions.redesign?.payload;
  const [choice, setChoice] = useState<PackageId | 'abstain' | null>(prev?.kind === 'package' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit, preview);
  const limit = state.round.limitTo;
  const options = PACKAGES.filter((p) => !limit || limit.includes(p.id));
  return (
    <Frame eyebrow="결정 4" question="AI 배정기의 설정을 어떻게 바꿀까?" hint={limit ? '동률 재투표예요. 동률이었던 묶음 중에서만 고를 수 있어요.' : '배정 기준·설명 방식·이의 제기를 묶은 네 묶음 중 하나를 골라요. 조각을 섞을 수는 없어요. 우리 반이 고른 묶음으로 AI 배정기가 같은 12명을 다시 계산해요.'}>
      <div className="choice-list">
        {options.map((p, i) => (
          <Choice key={p.id} index={i} title={p.name} badge={p.kind} desc={`배정: ${p.criteria}  ·  설명: ${p.explanation}  ·  이의 제기: ${p.appeal}`} pressed={choice === p.id} onClick={() => setChoice(p.id)} disabled={state.round.locked} />
        ))}
        <Choice index={options.length} title="아직 모르겠다 / 판단 보류" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
      </div>
      <SubmitBar hint="하나를 고르면 제출할 수 있어요" canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'package', choice })} />
    </Frame>
  );
}

// ---------- 결정 5: 다른 AI에게 먼저 물어볼 것 ----------

export function TransferActivity({ state, me, submit, preview }: ActivityProps) {
  const prev = me.submissions.transfer?.payload;
  const [choice, setChoice] = useState<string | null>(prev?.kind === 'transfer' ? prev.choice : null);
  const { busy, go } = useSubmitter(submit, preview);
  const limit = state.round.limitTo;
  const options = QUESTION_CANDIDATES.filter((q) => !limit || limit.includes(q.id));
  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">{TRANSFER_SCENARIO.title}</p>
        <p style={{ margin: 0, fontSize: 18 }}>{TRANSFER_SCENARIO.story}</p>
      </section>
      <Frame eyebrow="결정 5" question={TRANSFER_SCENARIO.question} hint={limit ? '동률 재투표예요. 동률이었던 질문 중에서만 고를 수 있어요.' : '질문 하나만 골라요. 우리 반에서 가장 많이 고른 질문 2개가 "AI 결정을 받으면 먼저 묻는" 우리 반의 약속이 돼요.'}>
        <div className="choice-list">
          {options.map((q, i) => (
            <Choice key={q.id} index={i} title={q.text} pressed={choice === q.id} onClick={() => setChoice(q.id)} disabled={state.round.locked} />
          ))}
          <Choice index={options.length} title="아직 모르겠다 / 판단 보류" pressed={choice === 'abstain'} onClick={() => setChoice('abstain')} disabled={state.round.locked} />
        </div>
        <SubmitBar hint="하나를 고르면 제출할 수 있어요" canSubmit={!!choice} submitted={me.submittedThisRound} busy={busy} locked={state.round.locked} onSubmit={() => choice && go({ kind: 'transfer', choice })} />
      </Frame>
    </div>
  );
}

/** 제출 후 대기 중 짧은 되돌아보기 */
export function WaitingReflection({ phase }: { phase: string }) {
  const prompts: Record<string, string> = {
    pre_check: '내가 고른 답의 반대 입장이라면 어떤 이유를 댈까요?',
    ai_verdict: '내가 고른 선택으로 가장 먼저 영향을 받는 사람은 누구일까요?',
    investigate: '내 관점 카드의 사람이 결과를 들으면 가장 먼저 무엇을 물을까요?',
    redesign: '내가 고른 묶음으로 새롭게 불리해지는 사람에게 뭐라고 설명할까요?',
    transfer: '그 질문에 답을 못 받으면 그 결정을 받아들여도 될까요?',
    post_check: '오늘 내 생각에 가장 영향을 준 장면은 무엇이었나요?',
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
