import { useEffect, useState } from 'react';
import { ANONYMITY_NOTICE, APP_TITLE, SIMULATION_NOTICE } from '../../shared/content';
import { useToast } from '../components/ui';
import { ApiFailure, api } from '../lib/api';
import { navigate } from '../lib/router';
import { studentStore } from '../lib/storage';

export function StudentJoin({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const toast = useToast();
  const saved = studentStore.get();

  useEffect(() => {
    // 같은 코드의 저장된 참가 정보가 있으면 바로 이어서 입장
    if (initialCode && saved && saved.code === initialCode) navigate(`/play/${initialCode}`, true);
  }, [initialCode, saved]);

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) {
      toast('코드는 6자리예요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await api.join(c);
      studentStore.set({ code: c, participantId: r.participantId, studentToken: r.studentToken, pseudonym: r.pseudonym, avatar: r.avatar, savedAt: Date.now() });
      navigate(`/play/${c}`);
    } catch (e) {
      toast((e as ApiFailure).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container narrow stack" style={{ padding: '32px 16px 64px' }}>
      <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>← 처음으로</a>
      <h1 className="h1">{APP_TITLE} · 학생 입장</h1>
      <p className="muted" style={{ margin: 0 }}>{SIMULATION_NOTICE}</p>

      {saved && (
        <section className="card stack">
          <p style={{ margin: 0 }}>
            이 기기에 <strong>{saved.pseudonym}</strong>(코드 {saved.code}) 참가 정보가 있어요.
          </p>
          <div className="row">
            <button className="btn green" onClick={() => navigate(`/play/${saved.code}`)}>
              이어서 입장하기
            </button>
            <button
              className="btn outline"
              onClick={() => {
                studentStore.clear();
                navigate('/join', true);
              }}
            >
              다른 코드로 입장
            </button>
          </div>
        </section>
      )}

      <section className="paper stack" aria-labelledby="join-h">
        <h2 id="join-h" className="h2">선생님이 알려 준 코드</h2>
        <input className="input code" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label="방 코드 6자리" placeholder="ABC123" />
        <div className="stack" style={{ gap: 8, background: 'var(--paper-2)', borderRadius: 14, padding: 14 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>참여 안내</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            {ANONYMITY_NOTICE.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span>안내를 읽었어요. 본명 없이 가명으로 참여해요.</span>
          </label>
        </div>
        <button className="btn green lg block" disabled={busy || !agree || code.length !== 6} onClick={join}>
          {busy ? '입장하는 중…' : '입장하기'}
        </button>
      </section>
    </main>
  );
}
