import { useState } from 'react';
import { APP_TITLE } from '../../shared/content';
import { useToast } from '../components/ui';
import { ApiFailure, api } from '../lib/api';
import { navigate } from '../lib/router';
import { teacherStore } from '../lib/storage';

export function TeacherStart() {
  const existing = teacherStore.get();
  const [busy, setBusy] = useState(false);
  const [needSecret, setNeedSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverToken, setRecoverToken] = useState('');
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.createRoom(needSecret ? secret : undefined);
      teacherStore.set({ code: r.code, teacherToken: r.teacherToken, publicToken: r.publicToken, expiresAt: r.expiresAt });
      navigate(`/teacher/${r.code}`);
    } catch (e) {
      const f = e as ApiFailure;
      if (f.code === 'forbidden') setNeedSecret(true);
      toast(f.message ?? '방을 만들지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    const code = recoverCode.trim().toUpperCase();
    if (!code || !recoverToken.trim()) return;
    setBusy(true);
    try {
      await api.recoverTeacher(code, recoverToken.trim());
      teacherStore.set({ code, teacherToken: recoverToken.trim(), publicToken: '', expiresAt: Date.now() + 24 * 3600_000 });
      navigate(`/teacher/${code}`);
    } catch (e) {
      toast((e as ApiFailure).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container narrow stack" style={{ padding: '32px 16px 64px' }}>
      <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>← 처음으로</a>
      <h1 className="h1">{APP_TITLE} · 교사 시작</h1>
      <p className="lead">방을 만들면 학생용 6자리 코드와 QR, 프로젝터용 공개 화면 링크가 생겨요. 수업 45분 운영안은 교사 화면 오른쪽에 단계별로 표시돼요.</p>

      {existing && (
        <section className="card stack">
          <h2 className="h2">진행 중인 방이 있어요</h2>
          <p style={{ margin: 0 }}>
            코드 <strong className="mono">{existing.code}</strong> · 만료 {new Date(existing.expiresAt).toLocaleString('ko-KR')}
          </p>
          <div className="row">
            <button className="btn green" onClick={() => navigate(`/teacher/${existing.code}`)}>
              이어서 진행하기
            </button>
            <button
              className="btn outline"
              onClick={() => {
                teacherStore.clear();
                navigate('/teacher', true);
              }}
            >
              이 기기에서 자격 지우기
            </button>
          </div>
        </section>
      )}

      <section className="paper stack">
        <h2 className="h2">새 방 만들기</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>교사 자격(비밀 토큰)은 이 브라우저에만 저장돼요. 새로고침해도 유지되고, 다른 기기에서는 아래 복구 절차로 들어와요.</li>
          <li>학생 코드로는 교사 권한을 얻을 수 없어요. 공개 화면 링크는 읽기 전용이에요.</li>
          <li>방 데이터는 교사가 삭제하거나 24시간 뒤 자동 삭제돼요.</li>
        </ul>
        {needSecret && (
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700 }}>교사용 비밀번호 (학교 관리자에게 받은 값)</span>
            <input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
          </label>
        )}
        <button className="btn green lg" disabled={busy} onClick={create}>
          {busy ? '만드는 중…' : '방 만들기'}
        </button>
      </section>

      <details className="card compact">
        <summary>다른 기기에서 교사 화면 복구하기</summary>
        <p className="small muted">방을 만든 기기의 교사 화면 → "교사 복구 키 보기"에서 키를 확인해 입력해요. 키는 학생이나 공개 화면에 노출되지 않아요.</p>
        <div className="stack">
          <input className="input code" placeholder="방 코드" value={recoverCode} onChange={(e) => setRecoverCode(e.target.value.toUpperCase())} maxLength={6} aria-label="방 코드" />
          <input className="input" placeholder="교사 복구 키" value={recoverToken} onChange={(e) => setRecoverToken(e.target.value)} aria-label="교사 복구 키" autoComplete="off" />
          <button className="btn" disabled={busy} onClick={recover}>
            복구하기
          </button>
        </div>
      </details>
    </main>
  );
}
