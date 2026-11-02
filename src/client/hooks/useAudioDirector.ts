import { useEffect, useRef } from 'react';
import { phaseMeta } from '../../shared/content';
import type { PublicState } from '../../shared/types';
import { audio, type BgmId } from '../lib/audio';

/** 음향 출력 화면에서만 호출한다. 장면별 BGM 과 중립적 효과음을 상태 변화에 맞춰 재생. */
export function useAudioDirector(state: PublicState | undefined, active: boolean, remaining: number | null) {
  const prev = useRef<{ phase: string; revealed: boolean; locked: boolean; roundId: string } | null>(null);
  const lastChime = useRef<string>('');

  useEffect(() => {
    if (!state) return;
    if (!active) {
      void audio.playBgm(null);
      return;
    }
    const scene = phaseMeta(state.phase).scene;
    const bgm: BgmId = scene === 'investigation' ? 'investigation' : scene === 'redesign' ? 'redesign' : scene === 'ending' ? null : 'lobby';
    void audio.playBgm(bgm);
    audio.setDucked(state.bgmDucked);
    audio.setPaused(state.paused);
    const p = prev.current;
    if (p) {
      if (p.phase !== state.phase) {
        void audio.sfx(state.phase === 'ending' ? 'ending' : state.phase === 'investigate_reveal' ? 'clue' : 'transition');
      } else if (p.roundId === state.round.roundId) {
        if (!p.revealed && state.round.revealed) void audio.sfx('reveal');
        else if (!p.locked && state.round.locked && !state.round.revealed) void audio.sfx('time');
      }
    }
    prev.current = { phase: state.phase, revealed: state.round.revealed, locked: state.round.locked, roundId: state.round.roundId };
  }, [state?.phase, state?.round.revealed, state?.round.locked, state?.round.roundId, state?.bgmDucked, state?.paused, active, state]);

  useEffect(() => {
    if (!active || !state || remaining === null) return;
    const key = `${state.round.roundId}:${remaining}`;
    if (remaining === 10 && lastChime.current !== key) {
      lastChime.current = key;
      void audio.sfx('time');
    }
  }, [remaining, active, state]);
}
