import { useEffect, useState } from 'react';
import type { PhaseRound } from '../../shared/types';

/** 서버 시각 기준 남은 초. 타이머가 없으면 null, 일시정지면 멈춘 값. */
export function useRemaining(round: PhaseRound | undefined, paused: boolean, serverNow: () => number): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    // 활동이 없는 장면(타이머 없음)에서는 표시하지 않는다.
    if (!round || round.durationSeconds === null) {
      setLeft(null);
      return;
    }
    if (paused && round.pausedRemainingMs !== null) {
      setLeft(Math.ceil(round.pausedRemainingMs / 1000));
      return;
    }
    if (!round.endsAt || round.locked) {
      setLeft(round.locked ? 0 : null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((round.endsAt! - serverNow()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [round?.roundId, round?.endsAt, round?.locked, round?.pausedRemainingMs, round?.durationSeconds, paused, serverNow]);
  return left;
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
