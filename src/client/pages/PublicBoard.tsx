// 교실 공개 화면(프로젝터): 읽기 전용. 교사 메모·승인 대기열·학생별 응답을 포함하지 않는다.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AI_AGENT, APP_SUBTITLE, APP_TITLE, SCENE_COUNT, SIMULATION_NOTICE, phaseMeta } from '../../shared/content';
import { AiIntroCard, AiVerdictCard, ApplicantIntro, PhaseResult, PrinciplesBlock } from '../components/ResultViews';
import { EndingScene, SCENE_IMAGE, TaskStrip } from '../components/StudentBody';
import { ConnBanner, Picture, Scene, Timer } from '../components/ui';
import { useAudioDirector } from '../hooks/useAudioDirector';
import { useRemaining } from '../hooks/useTimer';
import { useRoom } from '../hooks/useRoom';
import { audio } from '../lib/audio';


export function PublicBoard({ code, token }: { code: string; token: string }) {
  const room = useRoom(token ? code : null, 'public', token || null);
  const state = room.snap?.state;
  const [qr, setQr] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const joinUrl = `${location.origin}/join/${code}`;
  const remaining = useRemaining(state?.round, state?.paused ?? false, room.serverNow);
  const isSoundScreen = state?.soundScreen === 'public';
  useAudioDirector(state, isSoundScreen && soundOn, remaining);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 360, margin: 1, color: { dark: '#0a0d3a', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [joinUrl]);

  if (!token) return <Full title="공개 화면 링크가 올바르지 않아요" text="교사 화면의 '공개 화면 링크 복사'로 받은 주소를 사용해 주세요." />;
  if (room.fatal) return <Full title="공개 화면을 열 수 없어요" text={room.fatal.message} />;
  if (room.kicked) return <Full title="방이 정리됐어요" text={room.kicked} />;
  if (!state) return <Full title="연결하는 중…" text="교사 방에 연결하고 있어요." />;

  const meta = phaseMeta(state.phase);
  const img = SCENE_IMAGE[meta.scene] ?? 'scene-allocation';

  return (
    <div className="shell board">
      <header className="topbar" style={{ fontSize: 18 }}>
        <div className="row" style={{ gap: 16 }}>
          <span className="brand">{APP_TITLE}</span>
          <span className="pill indigo">코드 {state.code}</span>
          <span className="muted">
            참여 {state.joined}명 · {meta.minuteMark}
          </span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Timer round={state.round} paused={state.paused} serverNow={room.serverNow} big />
          {isSoundScreen && !soundOn && (
            <button
              className="btn green"
              onClick={async () => {
                if (await audio.enable()) setSoundOn(true);
              }}
            >
              🔊 소리 켜기 (이 화면이 음향 출력)
            </button>
          )}
          {isSoundScreen && soundOn && <span className="pill mint">🔊 음향 출력 화면</span>}
        </div>
      </header>

      <main className="container stack" style={{ padding: '20px 16px 48px', flex: 1, maxWidth: 1500 }}>
        <ConnBanner status={room.status} role="public" teacherConnected={state.teacherConnected} paused={state.paused} />

        {state.phase === 'lobby' && (
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div className="stack">
              <p className="eyebrow">입장 코드</p>
              <div className="code-big">{state.code}</div>
              <p className="h2" style={{ fontWeight: 500 }}>{joinUrl.replace(/^https?:\/\//, '')}</p>
              <p className="h2">지금 {state.joined}명 입장</p>
              <p className="muted">{SIMULATION_NOTICE}</p>
            </div>
            <div className="stack" style={{ alignItems: 'center' }}>
              {qr && <img className="qr" src={qr} alt={`입장 QR 코드: ${joinUrl}`} width={360} height={360} />}
              <p className="muted" style={{ fontSize: '0.8em' }}>본명 없이 가명으로 참여 · 개인 답변은 공개되지 않음 · 24시간 뒤 자동 삭제</p>
            </div>
          </div>
        )}

        {state.phase === 'intro' && (
          <div className="keyart" style={{ minHeight: '70vh', borderRadius: 28, overflow: 'hidden' }}>
            <Picture id="intro-desktop" />
            <div className="keyart-content" style={{ padding: '6vw 4vw', maxWidth: '46%', textShadow: '0 2px 24px rgba(6,8,41,.9)' }}>
              <p className="eyebrow">AI 배정위원회</p>
              <h1 className="display">{APP_TITLE}</h1>
              <p className="lead" style={{ color: '#fff', marginTop: 16 }}>{APP_SUBTITLE}</p>
              <p style={{ marginTop: 24, fontSize: '0.9em' }}>미래탐험 체험 부스 · 신청자 12명 · 우선 체험권 6장. {AI_AGENT.name}가 추천하고, 위원회가 정한다.</p>
            </div>
          </div>
        )}
        {state.phase === 'intro' && (
          <div className="stack">
            <AiIntroCard />
            <ApplicantIntro />
          </div>
        )}

        {meta.activity && (
          <div className="stack">
            <Scene image={img}>
              <p className="eyebrow">{meta.minuteMark}</p>
              <h1 className="h1">{meta.title}</h1>
              <p style={{ color: 'var(--ink-dim)' }}>{meta.task}</p>
            </Scene>
            <TaskStrip state={state} />
            {state.phase === 'ai_verdict' && state.allocations.r1 && !state.round.revealed && <AiVerdictCard result={state.allocations.r1} />}
            {!state.round.revealed ? (
              <div className="card">
                <div className="row between">
                  <p className="h2" style={{ margin: 0 }}>
                    응답 {state.responded} / {state.joined}명
                  </p>
                  <p className="muted" style={{ margin: 0 }}>{state.round.locked ? '제출 마감 · 공개를 기다리는 중' : '제출 중 · 제출이 잠길 때까지 분포는 보이지 않아요'}</p>
                </div>
                <div className="bar" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="track" style={{ height: 36 }} aria-hidden>
                    <div className="fill" style={{ width: `${state.joined ? (state.responded / state.joined) * 100 : 0}%` }} />
                  </div>
                </div>
                {state.round.rerunCount > 0 && <p className="muted">재투표 {state.round.rerunCount}회차</p>}
              </div>
            ) : (
              <PhaseResult state={state} phase={state.phase} />
            )}
          </div>
        )}

        {!meta.activity && !['lobby', 'intro', 'ending', 'closed'].includes(state.phase) && (
          <div className="stack">
            <Scene image={img}>
              <p className="eyebrow">{meta.minuteMark}</p>
              <h1 className="h1">{meta.title}</h1>
              <p style={{ color: 'var(--ink-dim)' }}>{meta.task}</p>
            </Scene>
            <PhaseResult state={state} phase={state.phase} />
          </div>
        )}

        {(state.phase === 'ending' || state.phase === 'closed') && state.ending && (
          <div className="stack">
            <EndingScene ending={state.ending} portrait={false} big />
            <PrinciplesBlock e={state.ending} />
            {state.phase === 'closed' && <p className="h2">수업이 끝났어요. 수고했어요!</p>}
          </div>
        )}

        <p className="small muted" style={{ textAlign: 'center' }}>
          장면 {Math.max(0, state.phaseIndex)}/{SCENE_COUNT} · 읽기 전용 공개 화면
        </p>
      </main>
    </div>
  );
}

function Full({ title, text }: { title: string; text: string }) {
  return (
    <main className="container narrow stack board" style={{ padding: '64px 16px' }}>
      <h1 className="h1">{title}</h1>
      <p>{text}</p>
    </main>
  );
}
