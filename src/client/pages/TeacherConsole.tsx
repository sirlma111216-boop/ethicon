// 교사 진행 화면: 진행 권한은 서버가 검증한다. 이 화면은 명령을 보내고 집계만 본다.
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { CLUES, PACKAGES, PHASE_META, QUESTION_CANDIDATES, SCENE_COUNT, VERDICT_OPTIONS, phaseIndex, phaseMeta } from '../../shared/content';
import type { Phase, TeacherCommandBody } from '../../shared/types';
import { checkLabels } from '../components/ResultViews';
import { PREVIEW_ME, SCENE_IMAGE, StudentBody, TaskStrip } from '../components/StudentBody';
import { ConnBanner, Modal, Scene, Timer, useMediaQuery, useToast } from '../components/ui';
import { useAudioDirector } from '../hooks/useAudioDirector';
import { useRemaining } from '../hooks/useTimer';
import { useRoom } from '../hooks/useRoom';
import { api } from '../lib/api';
import { audio, type AudioPrefs } from '../lib/audio';
import { navigate } from '../lib/router';
import { teacherStore } from '../lib/storage';


export function TeacherConsole({ code }: { code: string }) {
  const creds = useMemo(() => teacherStore.get(), []);
  const valid = creds && creds.code === code;
  useEffect(() => {
    if (!valid) navigate('/teacher', true);
  }, [valid]);
  const room = useRoom(valid ? code : null, 'teacher', valid ? creds.teacherToken : null);
  const toast = useToast();
  const state = room.snap?.state;
  const teacher = room.snap?.teacher;
  const [qr, setQr] = useState<string | null>(null);
  const [decideOpen, setDecideOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'end' | 'delete'>(null);
  const [showKey, setShowKey] = useState(false);
  const [audioState, setAudioState] = useState<AudioPrefs & { enabled: boolean; ducked: boolean }>({ ...audio.prefs, enabled: false, ducked: false });
  const remaining = useRemaining(state?.round, state?.paused ?? false, room.serverNow);
  const isSoundScreen = state?.soundScreen === 'teacher';
  const portrait = useMediaQuery('(max-width: 767px) and (orientation: portrait)');
  useAudioDirector(state, !!isSoundScreen && audioState.enabled, remaining);

  const joinUrl = `${location.origin}/join/${code}`;
  const boardUrl = teacher?.publicToken ? `${location.origin}/board/${code}?t=${teacher.publicToken}` : null;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 240, margin: 1, color: { dark: '#0a0d3a', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [joinUrl]);
  useEffect(() => {
    const off = audio.subscribe((p) => setAudioState(p));
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    if (teacher?.publicToken && creds && creds.publicToken !== teacher.publicToken) teacherStore.set({ ...creds, publicToken: teacher.publicToken });
  }, [teacher?.publicToken, creds]);

  const run = async (body: TeacherCommandBody, opts?: { expectRevision?: boolean }) => {
    const r = await room.command(body, opts);
    if (!r.ok) toast(r.message, 'error');
    return r.ok;
  };

  if (!valid) return null;
  if (room.fatal) {
    return (
      <main className="container narrow stack" style={{ padding: 48 }}>
        <h1 className="h1">교사 화면을 열 수 없어요</h1>
        <p className="lead">{room.fatal.message}</p>
        <div className="row">
          <button className="btn" onClick={room.reconnect}>
            다시 시도
          </button>
          <button
            className="btn outline"
            onClick={() => {
              teacherStore.clear();
              navigate('/teacher');
            }}
          >
            새 방 만들기
          </button>
        </div>
      </main>
    );
  }
  if (room.kicked) {
    return (
      <main className="container narrow stack" style={{ padding: 48 }}>
        <h1 className="h1">방이 정리됐어요</h1>
        <p className="lead">{room.kicked}</p>
        <button
          className="btn"
          onClick={() => {
            teacherStore.clear();
            navigate('/teacher');
          }}
        >
          교사 시작 화면으로
        </button>
      </main>
    );
  }
  if (!state || !teacher) {
    return (
      <main className="container narrow stack" style={{ padding: 48 }}>
        <h1 className="h1">연결하는 중…</h1>
        <ConnBanner status={room.status} role="teacher" />
      </main>
    );
  }

  const meta = phaseMeta(state.phase);
  const round = state.round;
  const hasRound = meta.activity;
  const idx = phaseIndex(state.phase);
  const nextMeta = PHASE_META[idx + 1];
  const needsDecision = hasRound && round.revealed && round.tie !== null;
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label}을(를) 복사했어요.`);
    } catch {
      toast('복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.', 'error');
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand">교사 진행 · 축제의 빈자리</span>
          <span className="pill indigo mono">코드 {state.code}</span>
          <span className="small muted">
            참여 {teacher.participants.total}명 (접속 {teacher.participants.connected}{teacher.participants.bots > 0 ? ` · 봇 ${teacher.participants.bots}` : ''}) · {state.appEnv}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Timer round={round} paused={state.paused} serverNow={room.serverNow} />
          <span className={`pill ${room.status === 'open' ? 'mint' : 'apricot'}`}>{room.status === 'open' ? '연결됨' : '재연결 중'}</span>
        </div>
      </header>

      <main className="container console" style={{ padding: '16px 16px 48px', maxWidth: 1400 }}>
        {/* ---------- 왼쪽: 현재 장면 ---------- */}
        <section className="stack" aria-label="현재 장면">
          <ConnBanner status={room.status} role="teacher" />
          {room.notice && <div className="banner warn">{room.notice.message}</div>}
          {state.locked && state.phase === 'lobby' && <div className="banner">입장이 잠겨 있어요. 늦게 오는 학생이 있으면 잠금을 풀어 주세요.</div>}

          <Scene image={SCENE_IMAGE[meta.scene] ?? 'scene-allocation'}>
            <p className="eyebrow">
              {meta.minuteMark} · 장면 {idx}/{SCENE_COUNT}
            </p>
            <h1 className="h1">{meta.title}</h1>
            <p style={{ color: 'var(--ink-dim)' }}>{meta.task}</p>
          </Scene>

          {/* 진행 제어 */}
          <div className="card stack">
            <div className="row between">
              <div>
                <p className="h3" style={{ margin: 0 }}>
                  {hasRound ? `응답 ${teacher.responseCount} / ${teacher.participants.total}명` : '응답 활동 없음'}
                  {hasRound && round.rerunCount > 0 && ` · 재투표 ${round.rerunCount}회차`}
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  {hasRound ? (round.revealed ? '공개됨' : round.locked ? '제출 마감 · 공개 전' : state.paused ? '일시정지' : '제출 받는 중') : '다음 장면으로 넘어가면 학생·공개 화면이 함께 이동해요.'}
                </p>
              </div>
              <div className="row">
                {state.phase === 'lobby' ? (
                  <button className="btn green lg" onClick={() => run({ op: 'start' })} disabled={teacher.participants.total === 0}>
                    수업 시작 ({teacher.participants.total}명)
                  </button>
                ) : (
                  <>
                    <button className="btn outline" onClick={() => run({ op: 'back' })} disabled={idx <= 1}>
                      ← 이전 장면 보기
                    </button>
                    <button className="btn green lg" onClick={() => run({ op: 'next' })} disabled={!teacher.canAdvance || !nextMeta || nextMeta.id === 'closed'} title={teacher.advanceBlockedReason ?? ''}>
                      다음 장면 → {nextMeta && nextMeta.id !== 'closed' ? nextMeta.title : ''}
                    </button>
                  </>
                )}
              </div>
            </div>
            {teacher.advanceBlockedReason && state.phase !== 'lobby' && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>{teacher.advanceBlockedReason}</p>}

            {hasRound && (
              <div className="row">
                {!round.revealed && !round.locked && (
                  <button className="btn" onClick={() => run({ op: 'close_submissions' })}>
                    제출 마감
                  </button>
                )}
                {!round.revealed && (
                  <button className="btn" onClick={() => run({ op: 'reveal' })}>
                    결과 공개
                  </button>
                )}
                {!round.revealed && (
                  <button className="btn ghost" onClick={() => run({ op: 'extend', seconds: 30 })}>
                    +30초
                  </button>
                )}
                {!round.revealed && (state.paused ? <button className="btn ghost" onClick={() => run({ op: 'resume' })}>재개</button> : <button className="btn ghost" onClick={() => run({ op: 'pause' })}>일시정지</button>)}
                {round.revealed && (
                  <button className="btn ghost" onClick={() => confirmRerun(run, round.tie && round.tie.length > 1 ? 30 : 60)}>
                    {round.tie && round.tie.length > 1 ? '30초 재투표 (동률 항목만)' : '다시 투표 (새 라운드)'}
                  </button>
                )}
                {(needsDecision || (round.revealed && ['ai_verdict', 'investigate', 'redesign', 'transfer'].includes(state.phase) && !decisionDone(state))) && (
                  <button className="btn white" onClick={() => setDecideOpen(true)}>
                    교사 결정 (이유 기록)
                  </button>
                )}
                {!round.revealed && !['ai_verdict', 'investigate', 'redesign', 'transfer'].includes(state.phase) && (
                  <button className="btn outline" onClick={() => run({ op: 'skip', reason: '응답 없음 또는 시간 부족' })}>
                    활동 건너뛰기
                  </button>
                )}
              </div>
            )}
            {state.phase === 'lobby' && (
              <p className="small muted" style={{ margin: 0 }}>
                시작하면 인트로 장면으로 이동해요. 입장 코드 <strong className="mono">{state.code}</strong>, 주소 <span className="kbd">{joinUrl}</span>
              </p>
            )}
          </div>

          {/* 학생이 지금 보는 화면 그대로 */}
          <div className="preview-frame" aria-label="학생 화면 미리보기">
            <div className="preview-head">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>학생 화면 · 지금 이렇게 보여요</p>
                <p className="small muted" style={{ margin: 0 }}>실제 학생 화면과 같은 컴포넌트예요. 여기서 누른 선택은 제출되지 않아요.</p>
              </div>
              <span className="pill mint">결정 {meta.decisionNo ?? '-'} / 6</span>
            </div>
            <TaskStrip state={state} />
            <div style={{ marginTop: 12 }}>
              <StudentBody state={state} me={PREVIEW_ME} submit={async () => ({ ok: false, code: 'preview', message: '미리보기' })} portrait={portrait} preview />
            </div>
          </div>
          {(state.phase === 'ending' || state.phase === 'closed') && teacher.summary && <SummaryView summary={teacher.summary} exportUrl={api.exportUrl(code, creds.teacherToken)} />}

          {/* 발문·오개념 */}
          {teacher.notes && (
            <div className="paper stack" aria-label="교사용 메모">
              <p className="eyebrow" style={{ color: '#8a2a6b' }}>교사용 · 학생에게 보이지 않음</p>
              <p style={{ margin: 0, fontSize: 18 }}>
                <strong>말하기</strong> — {teacher.notes.script}
              </p>
              {teacher.notes.prompts.length > 0 && (
                <div>
                  <strong>발문</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {teacher.notes.prompts.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {teacher.notes.misconceptions.length > 0 && (
                <div>
                  <strong>예상 오개념</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {teacher.notes.misconceptions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {teacher.notes.followUps.length > 0 && (
                <div>
                  <strong>중립적 추가 질문 · 운영 메모</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {teacher.notes.followUps.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ---------- 오른쪽: 보조 패널 ---------- */}
        <aside className="stack" aria-label="보조 패널">
          <div className="card compact stack">
            <p className="h3" style={{ margin: 0 }}>초대</p>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {qr && <img className="qr" src={qr} alt={`입장 QR: ${joinUrl}`} width={120} height={120} />}
              <div className="stack" style={{ gap: 6, flex: 1 }}>
                <p className="mono" style={{ fontSize: 30, fontWeight: 900, letterSpacing: '0.18em', margin: 0 }}>{state.code}</p>
                <button className="btn sm ghost" onClick={() => copy(joinUrl, '학생 입장 주소')}>
                  입장 주소 복사
                </button>
                <button className="btn sm ghost" onClick={() => run({ op: 'lock_room', locked: !state.locked })}>
                  {state.locked ? '입장 잠금 풀기' : '입장 잠그기'}
                </button>
              </div>
            </div>
            <hr className="divider" />
            <p className="h3" style={{ margin: 0 }}>공개 화면 (프로젝터)</p>
            <p className="small muted" style={{ margin: 0 }}>읽기 전용 별도 토큰. 교사 메모·승인 대기열은 포함되지 않아요.</p>
            <div className="row">
              <button className="btn sm" disabled={!boardUrl} onClick={() => boardUrl && window.open(boardUrl, 'festival-board')}>
                새 창으로 열기
              </button>
              <button className="btn sm ghost" disabled={!boardUrl} onClick={() => boardUrl && copy(boardUrl, '공개 화면 링크')}>
                링크 복사
              </button>
            </div>
          </div>

          <div className="card compact stack">
            <p className="h3" style={{ margin: 0 }}>음향</p>
            <p className="small muted" style={{ margin: 0 }}>교실에서는 한 화면에서만 소리가 나요. 학생 기기는 항상 무음이에요.</p>
            <div className="row">
              <button className={`btn sm ${state.soundScreen === 'public' ? '' : 'ghost'}`} onClick={() => run({ op: 'sound_screen', screen: 'public' })}>
                공개 화면에서 출력
              </button>
              <button className={`btn sm ${state.soundScreen === 'teacher' ? '' : 'ghost'}`} onClick={() => run({ op: 'sound_screen', screen: 'teacher' })}>
                이 화면에서 출력
              </button>
            </div>
            {isSoundScreen && !audioState.enabled && (
              <button className="btn sm green" onClick={() => void audio.enable()}>
                🔊 이 화면 소리 켜기
              </button>
            )}
            <div className="row">
              <button className={`btn sm ${state.bgmDucked ? 'white' : 'ghost'}`} onClick={() => run({ op: 'duck', ducked: !state.bgmDucked })}>
                {state.bgmDucked ? '토론 모드 (BGM 낮춤) 해제' : '토론 모드: BGM 낮추기'}
              </button>
              <button className="btn sm ghost" onClick={() => audio.setPrefs({ muted: !audioState.muted })}>
                {audioState.muted ? '음소거 해제' : '전체 음소거'}
              </button>
            </div>
            <label className="small">
              배경음악 {Math.round(audioState.bgmVolume * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={audioState.bgmVolume} onChange={(e) => audio.setPrefs({ bgmVolume: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
            <label className="small">
              효과음 {Math.round(audioState.sfxVolume * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={audioState.sfxVolume} onChange={(e) => audio.setPrefs({ sfxVolume: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
          </div>

          <div className="card compact stack">
            <p className="h3" style={{ margin: 0 }}>
              자유 응답 검토 <span className="pill">{teacher.pendingTexts.filter((t) => t.status === 'pending').length} 대기</span>
            </p>
            <p className="small muted" style={{ margin: 0 }}>누가 썼는지는 보이지 않아요. 실명·개인 사정이 없으면 승인하세요. 승인 전에는 아무에게도 보이지 않아요.</p>
            <div className="stack" style={{ gap: 8, maxHeight: 360, overflow: 'auto' }}>
              {teacher.pendingTexts.length === 0 && <p className="small muted">아직 자유 응답이 없어요.</p>}
              {teacher.pendingTexts.map((t) => (
                <div key={t.id} className="paper compact" style={{ padding: 10 }}>
                  <p className="small muted" style={{ margin: 0 }}>
                    {kindLabel(t.kind)} · {t.status === 'pending' ? '대기' : t.status === 'approved' ? '승인됨' : '숨김'}
                  </p>
                  <p style={{ margin: '4px 0 8px' }}>{t.text}</p>
                  <div className="row">
                    {t.status !== 'approved' && (
                      <button className="btn sm green" onClick={() => run({ op: 'moderate', textId: t.id, status: 'approved' }, { expectRevision: false })}>
                        승인
                      </button>
                    )}
                    {t.status !== 'hidden' && (
                      <button className="btn sm outline" style={{ color: 'var(--paper-ink)', borderColor: '#888' }} onClick={() => run({ op: 'moderate', textId: t.id, status: 'hidden' }, { expectRevision: false })}>
                        숨김
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card compact">
            <p className="h3" style={{ margin: '0 0 8px' }}>45분 흐름</p>
            <div className="phase-list">
              {PHASE_META.filter((p) => p.id !== 'closed').map((p, i) => {
                const pi = phaseIndex(p.id);
                return (
                  <button key={p.id} className={`phase-item ${pi === idx ? 'current' : pi < idx ? 'done' : ''}`} style={{ border: 0, background: pi === idx ? undefined : 'transparent', cursor: pi < idx && pi >= 1 ? 'pointer' : 'default', textAlign: 'left' }} disabled={!(pi < idx && pi >= 1)} onClick={() => run({ op: 'goto', phase: p.id })} title={pi < idx ? '지난 장면 다시 보기 (투표는 다시 열리지 않아요)' : ''}>
                    <span className="n">{i}</span>
                    <span style={{ flex: 1 }}>{p.title}</span>
                    <span className="small">{p.minuteMark}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card compact stack" aria-label="연습용 봇 학생">
            <p className="h3" style={{ margin: 0 }}>
              연습용 봇 학생 <span className="pill ghost">{teacher.participants.bots}명</span>
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              혼자서 전체 흐름을 미리 돌려볼 때 씁니다. 봇은 활동이 열리면 몇 초에 걸쳐 그럴듯한 답(자유 응답 포함)을 제출하고, 동률·재투표·교사 결정도 겪을 수 있어요. 봇도 참여 인원과 집계에 포함되므로 <strong>실제 수업 전에는 반드시 제거</strong>하세요.
            </p>
            <div className="row">
              <button className="btn sm ghost" onClick={() => run({ op: 'add_bots', count: 10 }, { expectRevision: false })} disabled={state.phase === 'closed'}>
                봇 10명 추가
              </button>
              <button className="btn sm ghost" onClick={() => run({ op: 'add_bots', count: 25 }, { expectRevision: false })} disabled={state.phase === 'closed'}>
                봇 25명 추가
              </button>
              <button className="btn sm outline" onClick={() => run({ op: 'remove_bots' }, { expectRevision: false })} disabled={teacher.participants.bots === 0}>
                봇 모두 제거
              </button>
            </div>
          </div>

          <div className="card compact stack">
            <p className="h3" style={{ margin: 0 }}>방 관리</p>
            <button className="btn sm ghost" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '교사 복구 키 숨기기' : '교사 복구 키 보기'}
            </button>
            {showKey && (
              <div className="paper compact" style={{ padding: 10 }}>
                <p className="small" style={{ margin: 0, wordBreak: 'break-all' }}>{creds.teacherToken}</p>
                <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(creds.teacherToken, '교사 복구 키')}>
                  복사
                </button>
                <p className="small muted" style={{ margin: '6px 0 0' }}>학생·공개 화면에 절대 보여 주지 마세요.</p>
              </div>
            )}
            <a className="btn sm ghost" href={api.exportUrl(code, creds.teacherToken)} download>
              수업 요약 내보내기 (JSON · 개인 식별자 없음)
            </a>
            <p className="small muted" style={{ margin: 0 }}>자동 삭제: {new Date(state.expiresAt).toLocaleString('ko-KR')}</p>
            <div className="row">
              <button className="btn sm outline" onClick={() => setConfirm('end')} disabled={state.phase === 'closed'}>
                수업 종료
              </button>
              <button className="btn sm danger" onClick={() => setConfirm('delete')}>
                방 데이터 삭제
              </button>
            </div>
          </div>
        </aside>
      </main>

      {decideOpen && <DecideModal phase={state.phase} tie={round.tie} tokens={state.decisions.tokens ?? 2} onClose={() => setDecideOpen(false)} onDecide={async (choice, reason) => (await run({ op: 'decide', choice, reason })) && setDecideOpen(false)} />}
      {confirm && (
        <Modal title={confirm === 'end' ? '수업을 종료할까요?' : '방 데이터를 삭제할까요?'} onClose={() => setConfirm(null)}>
          <p>{confirm === 'end' ? '학생 화면은 종료 안내로 바뀌고 새 입장은 막혀요. 데이터는 삭제 전까지 남아 있어요.' : '개인 투표·자유 응답·집계가 모두 즉시 삭제되고 모든 연결이 끊겨요. 되돌릴 수 없어요. 요약이 필요하면 먼저 내보내기를 하세요.'}</p>
          <div className="row">
            <button
              className={`btn ${confirm === 'delete' ? 'danger' : ''}`}
              onClick={async () => {
                const ok = await run({ op: confirm === 'end' ? 'end' : 'delete_room' });
                if (ok && confirm === 'delete') {
                  teacherStore.clear();
                  navigate('/teacher');
                }
                setConfirm(null);
              }}
            >
              {confirm === 'end' ? '종료하기' : '삭제하기'}
            </button>
            <button className="btn ghost" style={{ background: 'var(--paper-2)', color: 'var(--paper-ink)' }} onClick={() => setConfirm(null)}>
              취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function decisionDone(state: NonNullable<ReturnType<typeof useRoom>['snap']>['state']): boolean {
  switch (state.phase) {
    case 'ai_verdict':
      return !!state.decisions.verdict;
    case 'investigate':
      return !!state.decisions.clues;
    case 'redesign':
      return !!state.decisions.pkg;
    case 'transfer':
      return !!state.decisions.questions;
    default:
      return true;
  }
}

async function confirmRerun(run: (b: TeacherCommandBody) => Promise<boolean>, seconds: number) {
  if (window.confirm(`새 라운드 ID로 ${seconds}초 재투표를 엽니다. 이전 집계는 기록에 남고 화면에서는 새 결과로 바뀌어요. 진행할까요?`)) await run({ op: 'rerun', seconds });
}

function kindLabel(kind: string): string {
  return ({ investigate_reason: '조사 이유', postcheck_reason: '성찰 이유' } as Record<string, string>)[kind] ?? kind;
}

function DecideModal({ phase, tie, tokens, onClose, onDecide }: { phase: Phase; tie: string[] | null; tokens: number; onClose: () => void; onDecide: (choice: string, reason: string) => void }) {
  const options: { id: string; label: string }[] =
    phase === 'ai_verdict' ? VERDICT_OPTIONS.map((o) => ({ id: o.id, label: o.label })) : phase === 'investigate' ? CLUES.map((c) => ({ id: c.id, label: c.title })) : phase === 'redesign' ? PACKAGES.map((p) => ({ id: p.id, label: p.name })) : QUESTION_CANDIDATES.map((q) => ({ id: q.id, label: q.text }));
  const need = phase === 'investigate' ? tokens : phase === 'transfer' ? 2 : 1;
  const multi = need > 1;
  const limited = tie && tie.length > 1 ? options.filter((o) => tie.includes(o.id)) : options;
  const [picks, setPicks] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const toggle = (id: string) => setPicks((xs) => (multi ? (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs.slice(-(need - 1)), id]) : [id]));
  const ready = picks.length === need && reason.trim().length > 0;
  return (
    <Modal title="교사 결정" onClose={onClose}>
      <p className="small muted">학급 투표로 정해지지 않았을 때만 사용해요. 선택과 이유는 "교사 결정"으로 구분되어 공동 기록에 남고, 학생 다수결처럼 표시되지 않아요.</p>
      <div className="choice-list">
        {limited.map((o, i) => (
          <button key={o.id} type="button" className="choice" aria-pressed={picks.includes(o.id)} onClick={() => toggle(o.id)}>
            <span className="mark">{picks.includes(o.id) ? '✓' : i + 1}</span>
            <span className="body">
              <span className="title">{o.label}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="stack" style={{ gap: 6, marginTop: 12 }}>
        <span style={{ fontWeight: 700 }}>짧은 이유 (공동 기록에 남아요)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="예: 두 번 동률이라 시간 관계상 교사가 선택" />
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!ready} onClick={() => onDecide(picks.join(','), reason.trim())}>
          이 선택으로 결정
        </button>
        <button className="btn ghost" style={{ background: 'var(--paper-2)', color: 'var(--paper-ink)' }} onClick={onClose}>
          취소
        </button>
      </div>
    </Modal>
  );
}

function SummaryView({ summary, exportUrl }: { summary: NonNullable<NonNullable<ReturnType<typeof useRoom>['snap']>['teacher']>['summary'] & object; exportUrl: string }) {
  const s = summary;
  return (
    <div className="paper stack" aria-label="수업 요약">
      <div className="row between">
        <h2 className="h2">수업 요약 (익명 집계)</h2>
        <a className="btn sm" href={exportUrl} download>
          JSON 내보내기
        </a>
      </div>
      <p style={{ margin: 0 }}>
        참여 {s.joined}명 · AI 추천 처리 {s.decisions.verdict ? VERDICT_OPTIONS.find((o) => o.id === s.decisions.verdict)?.label : '—'}
        {s.decisions.verdictByTeacher && ' (교사 결정)'} · 조사 토큰 {s.decisions.tokens ?? '—'}개 · 새 설정 {s.decisions.pkg ? PACKAGES.find((p) => p.id === s.decisions.pkg)?.name : '—'}
        {s.decisions.pkgByTeacher && ' (교사 결정)'}
      </p>
      {s.surveyShift ? (
        <table className="plain">
          <thead>
            <tr>
              <th>"자료대로 계산하면 공정할까?"</th>
              <th>사전 ({s.surveyShift.respondedBefore}명)</th>
              <th>사후 ({s.surveyShift.respondedAfter}명)</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(checkLabels).map((k) => (
              <tr key={k}>
                <th scope="row">{checkLabels[k]}</th>
                <td>{s.surveyShift!.before[k] ?? 0}</td>
                <td>{s.surveyShift!.after[k] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="small muted">사전·사후 응답이 3명 미만이라 분포를 표시하지 않아요.</p>
      )}
      {s.changeMatrix && (
        <p style={{ margin: 0 }}>
          사전·사후 모두 응답한 학생 중 판단 유지 {s.changeMatrix.kept}명 · 변화 {s.changeMatrix.changed}명. (변화 자체는 성취 점수가 아니에요. 이유를 설명할 수 있는지가 관찰 기준이에요.)
        </p>
      )}
      <p className="small muted" style={{ margin: 0 }}>개별 학생의 응답·변경 이력은 교사에게도 제공되지 않아요. 내보내기 파일에도 개인 식별자는 없어요.</p>
    </div>
  );
}
