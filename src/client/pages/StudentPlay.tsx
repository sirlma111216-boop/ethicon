import { useEffect, useMemo, useState } from 'react';
import { ANONYMITY_NOTICE, APPLICANTS, AVATAR_EMOJI, CAPACITY, PHASE_META, SCENE_COUNT, SIMULATION_NOTICE, phaseIndex, phaseMeta } from '../../shared/content';
import type { Phase, SubmissionPayload } from '../../shared/types';
import { PhaseResult } from '../components/ResultViews';
import { SCENE_IMAGE, StudentBody, TaskStrip } from '../components/StudentBody';
import { ApplicantTable, ConnBanner, Modal, Timer, useMediaQuery } from '../components/ui';
import { useRoom } from '../hooks/useRoom';
import { preload } from '../lib/images';
import { navigate } from '../lib/router';
import { studentStore } from '../lib/storage';

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
    if (state.phase === 'investigate') preload(['clue-access', 'clue-experience', 'clue-rules', 'clue-explanation']);
    if (state.phase === 'post_check') preload([portrait ? 'ending-mobile' : 'ending-desktop']);
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
              {meta.minuteMark} · 장면 {Math.max(0, state.phaseIndex)}/{SCENE_COUNT}
            </p>
            <h1 className="h2">{meta.title}</h1>
          </div>
          {state.phaseIndex >= phaseIndex('intro') && (
            <button className="btn ghost sm" onClick={() => setData(true)}>
              신청자 자료 보기
            </button>
          )}
        </div>
        <TaskStrip state={state} />

        <StudentBody state={state} me={me} submit={submit} portrait={portrait} />

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

function PastResults({ currentPhase, state }: { currentPhase: Phase; state: NonNullable<ReturnType<typeof useRoom>['snap']>['state'] }) {
  const past = (Object.keys(state.tallies) as Phase[]).filter((p) => p !== currentPhase && phaseIndex(p) < phaseIndex(currentPhase) && !['pre_check', 'post_check'].includes(p));
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
