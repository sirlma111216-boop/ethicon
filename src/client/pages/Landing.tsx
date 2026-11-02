import { ANONYMITY_NOTICE, APP_SUBTITLE, APP_TITLE, SIMULATION_NOTICE } from '../../shared/content';
import { Picture } from '../components/ui';
import { navigate } from '../lib/router';

export function Landing() {
  return (
    <main className="keyart">
      <Picture id="intro-desktop" mobileId="intro-mobile" />
      <div className="keyart-content" style={{ display: 'grid', gridTemplateRows: '1fr auto', minHeight: '100dvh' }}>
        {/* 데스크톱: 왼쪽 35% 어두운 영역. 모바일: 상단 하늘 */}
        <div className="container landing-top">
          <div className="landing-title">
            <p className="eyebrow">AI 배정위원회 · 중학교 협력 수업</p>
            <h1 className="display">{APP_TITLE}</h1>
            <p className="lead" style={{ marginTop: 12, color: '#fff' }}>{APP_SUBTITLE}</p>
            <p className="small" style={{ marginTop: 16, color: 'var(--ink-dim)', maxWidth: 420 }}>{SIMULATION_NOTICE}</p>
          </div>
        </div>
        <div className="container" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <div className="stack" style={{ maxWidth: 460, background: 'rgba(6,8,41,.72)', backdropFilter: 'blur(6px)', borderRadius: 24, padding: 16 }}>
            <button className="btn green lg block" onClick={() => navigate('/join')}>
              학생 입장 — 코드 입력
            </button>
            <button className="btn white block" onClick={() => navigate('/teacher')}>
              교사로 시작 — 방 만들기
            </button>
            <div className="row between small" style={{ color: 'var(--ink-dim)' }}>
              <a href="/help" onClick={(e) => (e.preventDefault(), navigate('/help'))}>도움말·개인정보</a>
              <span>가명 참여 · 24시간 자동 삭제</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function Help() {
  return (
    <main className="container narrow stack" style={{ padding: '32px 16px 64px' }}>
      <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>← 처음으로</a>
      <h1 className="h1">도움말</h1>
      <section className="paper stack">
        <h2 className="h2">이 앱은 무엇인가요?</h2>
        <p>
          <strong>{SIMULATION_NOTICE}</strong> 한 학급이 하나의 배정위원회가 되어, 가상의 축제 체험권 6자리를 신청자 12명에게 어떻게 배정할지 함께 정하고, AI 추천의 기준을 조사하고, 규칙을 다시 설계해요.
        </p>
        <p>
          여기서 "AI"는 선착순·경험 우선·첫 참여 우선처럼 <em>정해진 식을 계산하는 교육용 시뮬레이터</em>예요. 학습된 모델이 아니에요. 실제 AI는 훨씬 복잡한 자료를 쓰지만, "어떤 기준으로, 어떤 자료로, 무엇을 모른 채 결정했는지" 묻는 질문은 똑같이 필요해요.
        </p>
      </section>
      <section className="paper stack">
        <h2 className="h2">익명성과 개인정보</h2>
        <ul>
          {ANONYMITY_NOTICE.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>자유 응답은 80자 이내이고, 선생님이 익명 원문을 확인해 승인한 것만 공개돼요. 실명·개인 사정은 적지 않아요.</li>
          <li>집계 항목의 응답자가 3명 미만이면 묶거나 비공개 처리해요.</li>
          <li>실시간 활동에는 인터넷 연결이 필요해요. 연결이 끊기면 제출이 "성공"으로 표시되지 않고, 다시 연결된 뒤 제출해야 해요.</li>
        </ul>
      </section>
      <section className="paper stack">
        <h2 className="h2">문제가 생겼어요</h2>
        <ul>
          <li>
            <strong>코드가 틀렸대요</strong> — 코드는 영문 대문자·숫자 6자리예요. 0(영)과 O, 1과 I 같은 혼동 문자는 쓰지 않아요.
          </li>
          <li>
            <strong>방이 잠겼대요</strong> — 선생님이 입장을 잠근 상태예요. 선생님께 말씀해 주세요.
          </li>
          <li>
            <strong>방이 만료됐대요</strong> — 방은 만든 뒤 최대 24시간 보존돼요. 선생님이 새 방을 만들어야 해요.
          </li>
          <li>
            <strong>새로고침했어요</strong> — 같은 기기·브라우저라면 자동으로 다시 들어가요. 가명과 제출 상태가 복구돼요.
          </li>
        </ul>
      </section>
    </main>
  );
}
