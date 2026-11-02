import { useEffect, useMemo, useState } from 'react';
import { ANONYMITY_NOTICE, APPLICANTS, AVATAR_EMOJI, CAPACITY, PHASE_META, SIMULATION_NOTICE, phaseIndex, phaseMeta } from '../../shared/content';
import type { Phase, SubmissionPayload } from '../../shared/types';
import { EndingContent, PhaseResult } from '../components/ResultViews';
import { InfoActivity, InvestigateActivity, PackageActivity, PolicyActivity, PracticeActivity, QuestionsActivity, SurveyActivity, TransferActivity, WaitingReflection } from '../components/StudentActivity';
import { ApplicantTable, ConnBanner, Modal, Picture, Scene, Timer, useMediaQuery } from '../components/ui';
import { useRoom } from '../hooks/useRoom';
import { preload, type ImageId } from '../lib/images';
import { navigate } from '../lib/router';
import { studentStore } from '../lib/storage';

const SCENE_IMAGE: Record<string, ImageId> = { intro: 'intro-desktop', allocation: 'scene-allocation', investigation: 'scene-investigation', redesign: 'scene-redesign', ending: 'ending-desktop' };

export function StudentPlay({ code }: { code: string }) {
  const creds = useMemo(() => studentStore.get(code), [code]);
  useEffect(() => {
    if (!creds) navigate(`/join/${code}`, true);
  }, [creds, code]);
  const room = useRoom(creds ? code : null, 'student', creds?.studentToken ?? null);
  const [help, setHelp] = useState(false);
  const [data, setData] = useState(false);
  const state = room.snap?.state;
  const me = room.snap?.me;
  const portrait = useMediaQuery('(max-width: 767px) and (orientation: portrait)');

  // 다음 장면 자산 미리 읽기
  useEffect(() => {
    if (!state) return;
    const idx = phaseIndex(state.phase);
    const next = PHASE_META[idx + 1];
    if (next) preload([SCENE_IMAGE[next.scene] ?? 'scene-allocation']);
    if (state.phase === 'r2_choose') preload(['clue-access', 'clue-experience', 'clue-rules', 'clue-explanation']);
    if (state.phase === 'r5_post') preload([portrait ? 'ending-mobile' : 'ending-desktop']);
  }, [state?.phase, portrait, state]);

  if (!creds) return null;

  if (room.kicked) {
    return (
      <Centered title="연결이 종료됐어요" text={room.kicked}>
        <button
          className="btn"
          onClick={() => {
            studentStore.clear();
            navigate('/join');
          }}
        >
          처음으로
        </button>
      </Centered>
    );
  }
  if (room.fatal) {
    return (
      <Centered title="들어갈 수 없어요" text={room.fatal.message}>
        <div className="row">
          <button className="btn" onClick={room.reconnect}>
            다시 시도
          </button>
          <button
            className="btn outline"
            onClick={() => {
              studentStore.clear();
              navigate('/join');
            }}
          >
            코드 다시 입력
          </button>
        </div>
      </Centered>
    );
  }
  if (!state || !me) {
    return (
      <Centered title="연결하는 중…" text="선생님 방에 들어가고 있어요. 인터넷 연결이 필요해요.">
        <ConnBanner status={room.status} role="student" />
      </Centered>
    );
  }

  const meta = phaseMeta(state.phase);
  const submit = (payload: SubmissionPayload) => room.submit(state.phase, state.round.roundId, payload);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="row" style={{ gap: 10 }}>
          <span aria-hidden style={{ fontSize: 24 }}>
            {AVATAR_EMOJI[me.avatar] ?? '🙂'}
          </span>
          <div>
            <div className="brand">{me.pseudonym}</div>
            <div className="small muted">가명 · 내 접속 구분용</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Timer round={state.round} paused={state.paused} serverNow={room.serverNow} />
          <button className="btn ghost sm" onClick={() => setHelp(true)}>
            도움말
          </button>
        </div>
      </header>

      <main className="container stack" style={{ padding: '16px 16px 48px', flex: 1 }}>
        <ConnBanner status={room.status} role="student" teacherConnected={state.teacherConnected} paused={state.paused} />
        {room.notice && <div className="banner warn">{room.notice.message}</div>}
        <div className="row between">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              {meta.minuteMark} · {state.phaseIndex}/{PHASE_META.length - 2}
            </p>
            <h1 className="h2">{meta.title}</h1>
          </div>
          {state.phaseIndex >= phaseIndex('r1_vote') && (
            <button className="btn ghost sm" onClick={() => setData(true)}>
              신청자 자료 보기
            </button>
          )}
        </div>

        <StudentBody state={state} me={me} submit={submit} portrait={portrait} />

        {/* 이미 공개된 과거 결과는 자기 화면에서 다시 볼 수 있다 */}
        <PastResults currentPhase={state.phase} state={state} />
      </main>

      {help && (
        <Modal title="도움말" onClose={() => setHelp(false)}>
          <p>{SIMULATION_NOTICE}</p>
          <ul>
            {ANONYMITY_NOTICE.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>선생님이 장면을 바꾸면 모두 같은 장면으로 이동해요. 먼저 다음 장면으로 갈 수는 없어요.</li>
            <li>작성 중에 장면이 바뀌면 입력하던 내용은 저장되지 않아요. 제출된 응답만 집계돼요.</li>
          </ul>
        </Modal>
      )}
      {data && (
        <Modal title={`가상 신청자 ${APPLICANTS.length}명 · 정원 ${CAPACITY}명`} onClose={() => setData(false)}>
          <ApplicantTable />
        </Modal>
      )}
    </div>
  );
}

function Centered({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="container narrow stack" style={{ padding: '48px 16px' }}>
      <h1 className="h1">{title}</h1>
      <p className="lead">{text}</p>
      {children}
    </main>
  );
}

function StudentBody({ state, me, submit, portrait }: { state: NonNullable<ReturnType<typeof useRoom>['snap']>['state']; me: NonNullable<NonNullable<ReturnType<typeof useRoom>['snap']>['me']>; submit: (p: SubmissionPayload) => Promise<{ ok: true } | { ok: false; code: string; message: string }>; portrait: boolean }) {
  const meta = phaseMeta(state.phase);
  const props = { state, me, submit };
  const activity = (() => {
    switch (state.phase) {
      case 'practice':
        return <PracticeActivity {...props} />;
      case 'pre_survey':
        return <SurveyActivity {...props} />;
      case 'r1_vote':
        return <PolicyActivity {...props} />;
      case 'r1_info':
        return <InfoActivity {...props} />;
      case 'r2_choose':
        return <InvestigateActivity {...props} />;
      case 'r3_vote':
        return <PackageActivity {...props} />;
      case 'r4_questions':
        return <QuestionsActivity {...props} />;
      case 'r4_transfer':
        return <TransferActivity {...props} />;
      case 'r5_post':
        return <SurveyActivity {...props} post />;
      default:
        return null;
    }
  })();

  if (meta.activity) {
    if (state.round.revealed) {
      return (
        <div className="stack fade-in">
          <PhaseResult state={state} phase={state.phase} />
          {me.submissions[state.phase] && <p className="small muted">내 응답은 저장돼 있어요. 개별 응답은 공개되지 않아요.</p>}
        </div>
      );
    }
    return (
      <div className="stack">
        {(me.submittedThisRound || state.round.locked) && <WaitingReflection phase={state.phase} />}
        {activity}
      </div>
    );
  }

  switch (state.phase) {
    case 'lobby':
      return (
        <div className="stack">
          <Scene image="intro-desktop">
            <p className="eyebrow">입장 완료</p>
            <h2 className="h1">잠시 기다려요</h2>
            <p style={{ color: 'var(--ink-dim)' }}>지금 {state.joined}명이 들어왔어요. 선생님이 시작하면 화면이 바뀌어요.</p>
          </Scene>
          <div className="paper">
            <h3 className="h3">참여 안내</h3>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {ANONYMITY_NOTICE.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    case 'intro':
      return (
        <div className="stack">
          <Scene image={portrait ? 'intro-mobile' : 'intro-desktop'} full={portrait}>
            <p className="eyebrow">이야기</p>
            <h2 className="h1">축제의 빈자리</h2>
            <p style={{ color: '#fff', fontSize: 18 }}>
              가상의 중학교 축제. 인기 있는 <strong>미래탐험 체험 부스</strong>에 12명이 신청했지만 우선 체험권은 <strong>6장</strong>뿐이에요. AI가 신청 시각·이전 참여 경험·관심도로 추천을 내놓지만, 규칙을 정하는 건 우리 위원회예요.
            </p>
          </Scene>
          <div className="paper">
            <p style={{ margin: 0 }}>
              <strong>우리 반 전체가 하나의 배정위원회예요.</strong> 개인 순위도, 모둠 경쟁도 없어요. 단서를 찾고, 예상과 다른 결과를 보고, 규칙을 바꾸고, 함께 결정해요. 모든 신청자와 자료는 가상이에요.
            </p>
          </div>
        </div>
      );
    case 'r1_result':
      return (
        <div className="stack">
          <Scene image="scene-allocation">
            <p className="eyebrow">라운드 1</p>
            <h2 className="h1">누가 들어오고 누가 남았나?</h2>
            <p style={{ color: 'var(--ink-dim)' }}>학급이 고른 규칙으로 AI가 6명을 배정했어요.</p>
          </Scene>
          <PhaseResult state={state} phase="r1_result" />
        </div>
      );
    case 'r2_reveal':
      return (
        <div className="stack">
          <Scene image="scene-investigation">
            <p className="eyebrow">라운드 2</p>
            <h2 className="h1">설명되지 않은 빈자리</h2>
            <p style={{ color: 'var(--ink-dim)' }}>학급이 고른 단서 2장이 열렸어요.</p>
          </Scene>
          <PhaseResult state={state} phase="r2_reveal" />
        </div>
      );
    case 'r3_result':
      return (
        <div className="stack">
          <Scene image="scene-redesign">
            <p className="eyebrow">라운드 3</p>
            <h2 className="h1">이전과 이후</h2>
            <p style={{ color: 'var(--ink-dim)' }}>같은 12명에게 새 규칙을 적용했어요.</p>
          </Scene>
          <PhaseResult state={state} phase="r3_result" />
        </div>
      );
    case 'ending':
    case 'closed':
      return (
        <div className="stack">
          {state.ending && <EndingScene ending={state.ending} portrait={portrait} />}
          {state.ending && (
            <details className="paper" open={portrait}>
              <summary>엔딩 내용 자세히 보기 (글자 크게)</summary>
              <div style={{ marginTop: 12 }}>
                <EndingContent e={state.ending} />
              </div>
            </details>
          )}
          <MyReflection me={me} />
          {state.phase === 'closed' && <div className="banner ok">수업이 끝났어요. 수고했어요! 이 방의 데이터는 곧 정리돼요.</div>}
        </div>
      );
    default:
      return null;
  }
}

export function EndingScene({ ending, portrait, big }: { ending: NonNullable<Parameters<typeof EndingContent>[0]['e']>; portrait: boolean; big?: boolean }) {
  // 게시판 안전 영역: 데스크톱 이미지 왼쪽 게시판 / 모바일 이미지 상단 게시판
  const area = portrait ? { left: '14%', top: '12%', width: '71%', height: '40%' } : { left: '6%', top: '6%', width: '36%', height: '58%' };
  return (
    <div className="scene" style={{ aspectRatio: portrait ? '9 / 16' : '16 / 9' }}>
      <Picture id="ending-desktop" mobileId="ending-mobile" />
      <div className="ending-board" style={{ ...area, padding: big ? '1.2vw' : '0.8vw' }}>
        <EndingContent e={ending} big={big} />
      </div>
    </div>
  );
}

function MyReflection({ me }: { me: NonNullable<NonNullable<ReturnType<typeof useRoom>['snap']>['me']> }) {
  const before = me.submissions.pre_survey?.payload;
  const after = me.submissions.r5_post?.payload;
  if (!before && !after) return null;
  const label = (p: SubmissionPayload | undefined) => (p && 'choice' in p ? ({ always: '늘 공정하다', mostly: '대체로 공정, 예외 있음', depends: '출발 조건이 다르면 불공정할 수 있다', unsure: '아직 모르겠다' } as Record<string, string>)[p.choice as string] : '—');
  return (
    <div className="paper">
      <h3 className="h3">나의 전후 비교 (나만 볼 수 있어요)</h3>
      <p style={{ margin: '8px 0 0' }}>
        처음: <strong>{label(before)}</strong> → 지금: <strong>{label(after)}</strong>
      </p>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {before && after && 'choice' in before && 'choice' in after && before.choice === after.choice ? '생각을 유지했어요. 이유를 설명할 수 있다면 그것도 성과예요.' : '생각이 달라졌어요. 무엇을 보고 달라졌는지가 중요해요.'}
      </p>
    </div>
  );
}

function PastResults({ currentPhase, state }: { currentPhase: Phase; state: NonNullable<ReturnType<typeof useRoom>['snap']>['state'] }) {
  const past = (Object.keys(state.tallies) as Phase[]).filter((p) => p !== currentPhase && phaseIndex(p) < phaseIndex(currentPhase) && !['pre_survey', 'r5_post'].includes(p));
  if (!past.length) return null;
  return (
    <details className="card compact">
      <summary>이미 공개된 결과 다시 보기 ({past.length})</summary>
      <div className="stack" style={{ marginTop: 12 }}>
        {past.map((p) => (
          <div key={p}>
            <p className="eyebrow">{phaseMeta(p).title}</p>
            <PhaseResult state={state} phase={p} />
          </div>
        ))}
      </div>
    </details>
  );
}
