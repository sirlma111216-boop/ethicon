import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APPLICANTS, CLUES, PERSPECTIVES, applicantById, type Applicant } from '../../shared/content';
import type { AllocationResult, Comparison, PerspectiveBoardRow, PhaseRound, RevealedClue, Tally } from '../../shared/types';
import { fmtSec, useRemaining } from '../hooks/useTimer';
import { ALT, imgSrc, imgSrcSet, type ImageId } from '../lib/images';
import type { ConnStatus } from '../lib/ws';

// ---------- 토스트 ----------
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: 'info' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- 연결 상태 ----------
export function ConnBanner({ status, teacherConnected, paused, role }: { status: ConnStatus; teacherConnected?: boolean; paused?: boolean; role: 'student' | 'teacher' | 'public' }) {
  if (status === 'reconnecting' || status === 'connecting') {
    return (
      <div className="banner warn" role="status">
        {status === 'connecting' ? '서버에 연결하는 중…' : '연결이 끊겨 다시 연결하는 중이에요. 제출은 연결된 뒤에 확인돼요.'}
      </div>
    );
  }
  if (status === 'closed') return <div className="banner danger">연결이 종료됐어요.</div>;
  if (role !== 'teacher' && teacherConnected === false) {
    return (
      <div className="banner warn" role="status">
        선생님 화면의 연결이 잠시 끊겼어요. 현재 장면에서 기다려 주세요. 선생님이 돌아오면 이어서 진행돼요.
      </div>
    );
  }
  if (paused) return <div className="banner">선생님이 일시정지했어요. 잠시 기다려 주세요.</div>;
  return null;
}

// ---------- 타이머 ----------
export function Timer({ round, paused, serverNow, big }: { round: PhaseRound | undefined; paused: boolean; serverNow: () => number; big?: boolean }) {
  const left = useRemaining(round, paused, serverNow);
  if (left === null) return null;
  const cls = `timer ${left === 0 ? 'done' : left <= 10 ? 'low' : ''}`;
  return (
    <span className={cls} style={big ? { fontSize: 'clamp(24px, 3vw, 44px)', padding: '8px 20px' } : undefined} aria-live={left <= 10 ? 'polite' : 'off'}>
      <span aria-hidden>⏱</span>
      <span className="sr-only">남은 시간 </span>
      {round?.locked ? '마감' : paused ? `일시정지 ${fmtSec(left)}` : fmtSec(left)}
    </span>
  );
}

// ---------- 장면 ----------
export function Scene({ image, children, full, className }: { image: ImageId; children?: ReactNode; full?: boolean; className?: string }) {
  return (
    <div className={`scene landscape stack-mobile ${full ? 'full' : ''} ${className ?? ''}`}>
      <img className="bg" src={imgSrc(image)} srcSet={imgSrcSet(image)} sizes="(max-width: 767px) 100vw, 1200px" alt={ALT[image]} loading="eager" decoding="async" />
      {children && <div className="overlay">{children}</div>}
    </div>
  );
}

export function Picture({ id, mobileId, className, alt, sizes }: { id: ImageId; mobileId?: ImageId; className?: string; alt?: string; sizes?: string }) {
  return (
    <picture className={className}>
      {mobileId && <source media="(max-width: 767px) and (orientation: portrait)" srcSet={imgSrcSet(mobileId)} sizes="100vw" />}
      <img src={imgSrc(id)} srcSet={imgSrcSet(id)} sizes={sizes ?? '100vw'} alt={alt ?? ALT[id]} decoding="async" />
    </picture>
  );
}

// ---------- 집계 막대 ----------
export function TallyBars({ tally, labels, hideCounts, caption }: { tally: Tally | undefined; labels: Record<string, string>; hideCounts?: boolean; caption?: string }) {
  if (!tally) return null;
  const entries = Object.entries(tally.counts).filter(([k]) => k !== 'abstain');
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const abstain = tally.counts['abstain'] ?? 0;
  const missing = Math.max(0, tally.eligible - tally.responded);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {caption && <p className="muted small" style={{ margin: 0 }}>{caption}</p>}
      <div className="bars" role="list">
        {entries.map(([k, n]) => {
          const isTop = tally.top.includes(k);
          const label = k === 'few' ? '소수 의견(3명 미만, 묶음)' : (labels[k] ?? k);
          return (
            <div key={k} className={`bar ${isTop ? 'top' : ''} ${k === 'few' ? 'few' : ''}`} role="listitem">
              <span>
                {label}
                {isTop && tally.top.length === 1 && <span className="pill mint" style={{ marginLeft: 8 }}>최다</span>}
                {isTop && tally.top.length > 1 && <span className="pill apricot" style={{ marginLeft: 8 }}>동률</span>}
              </span>
              <div className="track" aria-hidden>
                <div className="fill" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="mono">{hideCounts ? '' : `${n}명`}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        응답 {tally.responded}명 / 전체 {tally.eligible}명 · 보류·기권 {abstain}명 · 미응답 {missing}명 (미응답은 동의로 세지 않아요)
      </p>
    </div>
  );
}

// ---------- 신청자 ----------
export function ApplicantChip({ a, status, lottery }: { a: Applicant; status?: 'in' | 'out' | 'gained' | 'lost' | 'same'; lottery?: boolean }) {
  const cls = status === 'in' || status === 'same' ? 'in' : status === 'out' ? 'out' : status === 'gained' ? 'in gained' : status === 'lost' ? 'out lost' : '';
  return (
    <div className={`applicant ${cls}`}>
      <div className="row between" style={{ gap: 6 }}>
        <span className="name">{a.name}</span>
        {status === 'gained' && <span className="pill mint">새로 선발</span>}
        {status === 'lost' && <span className="pill">새로 제외</span>}
        {status === 'in' && <span className="pill mint">선발</span>}
        {status === 'out' && <span className="pill paper">대기</span>}
      </div>
      <div className="meta">
        신청 12:{String(30 + a.applyMinute).padStart(2, '0')} · 이전 참여 {a.prior}회 · 관심도 {a.interest}
        {a.prior === 0 && ' · 처음 참여'}
        {lottery && ' · 추첨으로 결정'}
      </div>
    </div>
  );
}

export function AllocationView({ result, compact }: { result: AllocationResult; compact?: boolean }) {
  const lot = new Set(result.decidedByLottery);
  return (
    <div className="stack">
      <div>
        <p className="eyebrow" style={{ margin: '0 0 6px' }}>
          선발 {result.selected.length}명 · 처음 참여 {result.firstTimerCount}명
        </p>
        <div className="applicants">
          {result.selected.map((id) => (
            <ApplicantChip key={id} a={applicantById(id)} status="in" lottery={lot.has(id)} />
          ))}
        </div>
      </div>
      <div>
        <p className="eyebrow" style={{ margin: '0 0 6px' }}>대기 {result.waiting.length}명 (대기 순서)</p>
        <div className="applicants">
          {result.waiting.map((id) => (
            <ApplicantChip key={id} a={applicantById(id)} status="out" lottery={lot.has(id)} />
          ))}
        </div>
      </div>
      {!compact && (
        <p className="small muted" style={{ margin: 0 }}>
          설명 방식: {result.explainsWhat} · {result.appeal} · 설명에 드는 시간(모형): 약 {result.explanationMinutes}분. 수치는 설정한 모형에서 계산한 가상 결과예요.
        </p>
      )}
    </div>
  );
}

export function ComparisonView({ c }: { c: Comparison }) {
  const gained = new Set(c.gained);
  const lost = new Set(c.lost);
  const statusOf = (id: string, inAfter: boolean): 'gained' | 'lost' | 'in' | 'out' => (gained.has(id) ? 'gained' : lost.has(id) ? 'lost' : inAfter ? 'in' : 'out');
  const rows: { label: string; before: string; after: string }[] = [
    { label: '선발된 신청자', before: c.before.selected.map((id) => applicantById(id).name).join(', '), after: c.after.selected.map((id) => applicantById(id).name).join(', ') },
    { label: '처음 참여한 사람 수', before: `${c.before.firstTimerCount}명`, after: `${c.after.firstTimerCount}명` },
    { label: '대기 인원', before: `${c.before.waiting.length}명`, after: `${c.after.waiting.length}명` },
    { label: '설명에 드는 시간(모형)', before: `약 ${c.before.explanationMinutes}분`, after: `약 ${c.after.explanationMinutes}분` },
    { label: '설명받을 수 있는 내용', before: c.before.publishes.join(', '), after: c.after.publishes.join(', ') },
    { label: '이의 제기', before: c.before.appeal, after: c.after.appeal },
  ];
  return (
    <div className="stack">
      <div className="grid-2">
        <div className="paper compact">
          <p className="eyebrow" style={{ margin: '0 0 6px', color: '#8a2a6b' }}>이후 · 선발 6명</p>
          <div className="applicants">
            {c.after.selected.map((id) => (
              <ApplicantChip key={id} a={applicantById(id)} status={statusOf(id, true)} lottery={c.after.decidedByLottery.includes(id)} />
            ))}
          </div>
        </div>
        <div className="paper compact">
          <p className="eyebrow" style={{ margin: '0 0 6px', color: '#8a2a6b' }}>이후 · 대기 6명</p>
          <div className="applicants">
            {c.after.waiting.map((id) => (
              <ApplicantChip key={id} a={applicantById(id)} status={statusOf(id, false)} lottery={c.after.decidedByLottery.includes(id)} />
            ))}
          </div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card compact" style={{ borderLeft: '6px solid var(--green)' }}>
          <p className="h3" style={{ marginBottom: 6 }}>유리해진 사람</p>
          <p style={{ margin: 0 }}>{c.gained.length ? c.gained.map((id) => applicantById(id).name).join(', ') : '없음 — 자리는 그대로예요.'}</p>
        </div>
        <div className="card compact" style={{ borderLeft: '6px solid var(--magenta)' }}>
          <p className="h3" style={{ marginBottom: 6 }}>새롭게 불리해진 사람</p>
          <p style={{ margin: 0 }}>{c.lost.length ? c.lost.map((id) => applicantById(id).name).join(', ') : '없음 — 자리는 그대로예요.'}</p>
        </div>
      </div>
      <div className="paper compact">
        <table className="plain">
          <thead>
            <tr>
              <th scope="col">비교 항목</th>
              <th scope="col">이전 (라운드 1)</th>
              <th scope="col">이후 (라운드 3)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.before}</td>
                <td>{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ margin: '8px 0 0' }}>수치는 설정한 모형에서 계산한 가상 결과예요. 실제 AI는 더 복잡할 수 있어요.</p>
      </div>
    </div>
  );
}

export function ClueCardView({ clue, base }: { clue: RevealedClue; base?: boolean }) {
  const meta = CLUES.find((c) => c.id === clue.id)!;
  return (
    <article className="paper compact fade-in" aria-labelledby={`clue-${clue.id}`}>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 220px) 1fr' }}>
        <img src={imgSrc(meta.image as ImageId, 640)} srcSet={imgSrcSet(meta.image as ImageId)} sizes="220px" alt={meta.alt} style={{ borderRadius: 12, width: '100%' }} loading="lazy" />
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={`pill ${base ? 'paper' : ''}`}>{base ? '기본 자료' : '조사 카드'}</span>
            <h3 id={`clue-${clue.id}`} className="h3" style={{ margin: 0 }}>
              {meta.title}
            </h3>
          </div>
          <p className="muted" style={{ margin: 0 }}>{meta.question}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {clue.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {clue.reactions.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {clue.reactions.map((r) => (
                <p key={r.applicantId} style={{ margin: 0, background: '#fff', borderRadius: 12, padding: '8px 12px' }}>
                  <strong>{applicantById(r.applicantId).name}</strong> {r.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PerspectiveBoardView({ rows }: { rows: PerspectiveBoardRow[] }) {
  return (
    <div className="grid-2">
      {rows.map((row) => {
        const p = PERSPECTIVES.find((x) => x.id === row.perspective)!;
        const total = Object.values(row.tags).reduce((a, b) => a + b, 0) || 1;
        return (
          <div key={row.perspective} className="paper compact">
            <div className="row" style={{ gap: 10 }}>
              <img src={imgSrc(p.image as ImageId, 320)} alt="" width={56} height={56} style={{ borderRadius: 12 }} />
              <div>
                <p className="h3" style={{ margin: 0 }}>{p.name} 관점</p>
                <p className="small muted" style={{ margin: 0 }}>응답 {row.responded}명</p>
              </div>
            </div>
            <p className="small" style={{ margin: '8px 0' }}>{p.prompt}</p>
            {row.merged ? (
              <div className="stack" style={{ gap: 6 }}>
                <p className="small muted" style={{ margin: 0 }}>응답이 3명 미만이라 수치 대신 관점 카드로 소개해요.</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {p.tags.map((t) => (
                    <li key={t.id}>{t.label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bars">
                {p.tags.map((t) => {
                  const n = row.tags[t.id] ?? 0;
                  return (
                    <div key={t.id} className="bar">
                      <span style={{ fontSize: 15 }}>{t.label}</span>
                      <div className="track" aria-hidden>
                        <div className="fill" style={{ width: `${(n / total) * 100}%` }} />
                      </div>
                      <span className="mono">{n}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BadgeRow({ badges }: { badges: { perspective: boolean; evidence: boolean; revision: boolean } }) {
  const items: { id: ImageId; label: string; on: boolean }[] = [
    { id: 'badge-perspective', label: '관점 발견', on: badges.perspective },
    { id: 'badge-evidence', label: '근거 확인', on: badges.evidence },
    { id: 'badge-revision', label: '규칙 수정', on: badges.revision },
  ];
  return (
    <div className="badge-row" aria-label="학급 활동 진행 배지">
      {items.map((b) => (
        <div key={b.id} className={`badge ${b.on ? '' : 'off'}`}>
          <img src={imgSrc(b.id, 160)} alt="" />
          <span>
            {b.label}
            {!b.on && ' (아직)'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ApplicantTable() {
  return (
    <div className="paper compact">
      <table className="plain">
        <thead>
          <tr>
            <th scope="col">신청자</th>
            <th scope="col">신청 시각</th>
            <th scope="col">이전 참여</th>
            <th scope="col">관심도</th>
            <th scope="col">한 줄 소개</th>
          </tr>
        </thead>
        <tbody>
          {APPLICANTS.map((a) => (
            <tr key={a.id}>
              <th scope="row">{a.name}</th>
              <td className="mono">12:{String(30 + a.applyMinute).padStart(2, '0')}</td>
              <td>{a.prior}회{a.prior === 0 && ' (처음)'}</td>
              <td>{a.interest}</td>
              <td>{a.intro}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: '8px 0 0' }}>신청 창구는 12:30에 열렸어요. 모든 신청자와 자료는 가상이에요.</p>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div className="paper" style={{ maxWidth: 720, width: '100%', maxHeight: '90dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="h2">{title}</h2>
          <button className="btn ghost sm" onClick={onClose} style={{ background: 'var(--paper-2)', color: 'var(--paper-ink)' }}>
            닫기
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function useMediaQuery(q: string): boolean {
  const mq = useMemo(() => (typeof window !== 'undefined' ? window.matchMedia(q) : null), [q]);
  const [m, setM] = useState(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  return m;
}
