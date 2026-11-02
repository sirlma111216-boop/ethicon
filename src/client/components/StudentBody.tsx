// 학생이 보는 본문. StudentPlay(실제)와 TeacherConsole(미리보기)이 같은 컴포넌트를 쓴다.
import { ANONYMITY_NOTICE, AI_AGENT, CAPACITY, phaseMeta } from '../../shared/content';
import type { MeState, PublicState, SubmissionPayload } from '../../shared/types';
import { AiIntroCard, ApplicantIntro, EndingContent, PhaseResult, PrinciplesBlock, checkLabels } from './ResultViews';
import { CheckActivity, InvestigateActivity, PackageActivity, TransferActivity, VerdictActivity, WaitingReflection } from './StudentActivity';
import { Picture, Scene } from './ui';
import type { ImageId } from '../lib/images';

export const SCENE_IMAGE: Record<string, ImageId> = {
  intro: 'intro-desktop',
  ai: 'ai-kiosk',
  verdict: 'appeal-morning',
  investigation: 'scene-investigation',
  redesign: 'scene-redesign',
  ending: 'ending-desktop',
  none: 'scene-allocation',
};

export const PREVIEW_ME: MeState = {
  participantId: 'preview',
  pseudonym: '학생 화면 미리보기',
  avatar: 0,
  perspective: 'applicant',
  submissions: {},
  submittedThisRound: false,
  joinedAt: 0,
};

export function TaskStrip({ state }: { state: PublicState }) {
  const meta = phaseMeta(state.phase);
  return (
    <div className={`task-strip ${meta.activity ? 'do' : 'watch'}`} role="status">
      <span className="task-label">{meta.activity ? (state.round.revealed ? '결과 보기' : state.round.locked ? '마감됨' : '할 일') : '보기'}</span>
      <span>{meta.activity && state.round.revealed ? '학급 결과가 공개됐어요. 함께 봐요.' : meta.task}</span>
    </div>
  );
}

interface Props {
  state: PublicState;
  me: MeState;
  submit: (p: SubmissionPayload) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  portrait: boolean;
  preview?: boolean;
}

export function StudentBody({ state, me, submit, portrait, preview }: Props) {
  const meta = phaseMeta(state.phase);
  const props = { state, me, submit, preview };
  const activity = (() => {
    switch (state.phase) {
      case 'pre_check':
        return <CheckActivity {...props} />;
      case 'ai_verdict':
        return <VerdictActivity {...props} />;
      case 'investigate':
        return <InvestigateActivity {...props} />;
      case 'redesign':
        return <PackageActivity {...props} />;
      case 'transfer':
        return <TransferActivity {...props} />;
      case 'post_check':
        return <CheckActivity {...props} post />;
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
        {!preview && (me.submittedThisRound || state.round.locked) && <WaitingReflection phase={state.phase} />}
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
              가상의 중학교 축제. 인기 있는 <strong>미래탐험 체험 부스</strong>에 12명이 신청했지만 우선 체험권은 <strong>{CAPACITY}장</strong>뿐이에요. 올해 운영팀은 <strong>{AI_AGENT.name}</strong>를 처음 들였어요. 우리 반은 그 추천을 심사하는 <strong>배정위원회</strong>예요.
            </p>
          </Scene>
          <AiIntroCard />
          <ApplicantIntro />
          <div className="paper">
            <p style={{ margin: 0 }}>
              <strong>우리 반 전체가 하나의 위원회예요.</strong> 개인 순위도 모둠 경쟁도 없어요. AI의 추천을 받아들일지, 무엇을 확인할지, 규칙을 어떻게 바꿀지를 여섯 번의 결정으로 함께 정해요. 모든 신청자와 자료는 가상이에요.
            </p>
          </div>
        </div>
      );
    case 'verdict_result':
      return (
        <div className="stack">
          <Scene image="appeal-morning">
            <p className="eyebrow">우리 결정의 결과</p>
            <h2 className="h1">{state.verdictScene?.title ?? '…'}</h2>
          </Scene>
          <PhaseResult state={state} phase="verdict_result" />
        </div>
      );
    case 'investigate_reveal':
      return (
        <div className="stack">
          <Scene image="scene-investigation">
            <p className="eyebrow">단서 공개</p>
            <h2 className="h1">AI 배정기가 몰랐던 것</h2>
            <p style={{ color: 'var(--ink-dim)' }}>우리 반이 고른 카드 {state.revealedClues.length}장이 열렸어요.</p>
          </Scene>
          <PhaseResult state={state} phase="investigate_reveal" />
        </div>
      );
    case 'redesign_result':
      return (
        <div className="stack">
          <Scene image="scene-redesign">
            <p className="eyebrow">AI 배정기 다시 돌리기</p>
            <h2 className="h1">이전과 이후</h2>
            <p style={{ color: 'var(--ink-dim)' }}>같은 12명에게 새 설정을 적용했어요.</p>
          </Scene>
          <PhaseResult state={state} phase="redesign_result" />
        </div>
      );
    case 'ending':
    case 'closed':
      return (
        <div className="stack">
          {state.ending && <EndingScene ending={state.ending} portrait={portrait} />}
          {state.ending && <PrinciplesBlock e={state.ending} />}
          {state.ending && (
            <details className="paper" open={portrait}>
              <summary>엔딩 내용 자세히 보기 (글자 크게)</summary>
              <div style={{ marginTop: 12 }}>
                <EndingContent e={state.ending} />
              </div>
            </details>
          )}
          {!preview && <MyReflection me={me} />}
          {state.phase === 'closed' && <div className="banner ok">수업이 끝났어요. 수고했어요! 이 방의 데이터는 곧 정리돼요.</div>}
        </div>
      );
    default:
      return null;
  }
}

export function EndingScene({ ending, portrait, big }: { ending: NonNullable<PublicState['ending']>; portrait: boolean; big?: boolean }) {
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

function MyReflection({ me }: { me: MeState }) {
  const before = me.submissions.pre_check?.payload;
  const after = me.submissions.post_check?.payload;
  if (!before && !after) return null;
  const label = (p: SubmissionPayload | undefined) => (p && 'choice' in p ? (checkLabels[p.choice as string] ?? '—') : '—');
  const same = before && after && 'choice' in before && 'choice' in after && before.choice === after.choice;
  return (
    <div className="paper">
      <h3 className="h3">나의 전후 비교 (나만 볼 수 있어요)</h3>
      <p style={{ margin: '8px 0 0' }}>
        처음: <strong>{label(before)}</strong> → 지금: <strong>{label(after)}</strong>
      </p>
      <p className="small muted" style={{ margin: '4px 0 0' }}>{same ? '생각을 유지했어요. 이유를 설명할 수 있다면 그것도 성과예요.' : '생각이 달라졌어요. 무엇을 보고 달라졌는지가 중요해요.'}</p>
    </div>
  );
}
