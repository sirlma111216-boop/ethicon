// 연습용 봇 학생: 교사가 혼자 전체 흐름을 리허설할 수 있도록 그럴듯한 응답을 만든다.
// 봇은 실제 학생과 같은 경로(submissions·texts 테이블)로 저장되고, 교사가 언제든 제거할 수 있다.
import { CLUES, QUESTION_CANDIDATES, perspectiveById } from '../shared/content';
import type { CheckChoice, ClueId, PackageId, PerspectiveId, Phase, PhaseRound, SubmissionPayload, VerdictChoice } from '../shared/types';

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const chance = (p: number) => Math.random() < p;

function weighted<T extends string>(table: [T, number][], allow?: string[] | null): T {
  const rows = table.filter(([k]) => !allow || k === 'abstain' || allow.includes(k));
  const total = rows.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of rows) {
    r -= w;
    if (r <= 0) return k;
  }
  return rows[rows.length - 1]![0];
}

const INVESTIGATE_REASONS = ['왜 늦게 신청했는지부터 알아야 할 것 같아서', '점수가 무엇을 세는지 모르면 판단할 수 없어서', '동점을 어떻게 정했는지 궁금해서', '떨어진 사람이 무슨 말을 들었는지 알고 싶어서'];
const POST_REASONS = ['신청 창구가 하나뿐이었다는 걸 보고 나서', '경험 점수가 처음인 사람에게 불리하다는 걸 알고 나서', '기준을 공개해도 자리가 안 바뀌는 걸 보고 나서', '그래도 먼저 신청한 노력은 인정해야 한다고 생각해서'];

/** 단계에 맞는 봇 응답. limitTo(재투표 제한)와 토큰 수를 지킨다. */
export function botPayload(phase: Phase, round: PhaseRound, perspective: PerspectiveId, opts: { tokens?: number; before?: CheckChoice }): SubmissionPayload | null {
  const limit = round.limitTo;
  switch (phase) {
    case 'pre_check':
      return {
        kind: 'precheck',
        choice: weighted<CheckChoice>([
          ['yes', 5],
          ['no', 3],
          ['unsure', 2],
        ]),
      };
    case 'ai_verdict':
      return {
        kind: 'verdict',
        choice: weighted<VerdictChoice | 'abstain'>(
          [
            ['approve', 4],
            ['investigate', 4],
            ['reject', 2],
            ['abstain', 0.4],
          ],
          limit,
        ),
      };
    case 'investigate': {
      const n = Math.max(1, Math.min(2, opts.tokens ?? 2));
      const ids = CLUES.map((c) => c.id) as ClueId[];
      const first = weighted<ClueId>([
        ['access', 4],
        ['rules', 3],
        ['experience', 2],
        ['explanation', 2],
      ]);
      const picks: ClueId[] = [first];
      if (n === 2) picks.push(pick(ids.filter((id) => id !== first)));
      return { kind: 'investigate', picks, tag: pick(perspectiveById(perspective).tags).id, reason: chance(0.25) ? pick(INVESTIGATE_REASONS) : undefined };
    }
    case 'redesign':
      return {
        kind: 'package',
        choice: weighted<PackageId | 'abstain'>(
          [
            ['keep', 1.5],
            ['open', 2.5],
            ['access', 4],
            ['mix', 3],
            ['abstain', 0.4],
          ],
          limit,
        ),
      };
    case 'transfer': {
      const weights: Record<string, number> = { q_criteria: 3, q_data: 2, q_start: 4, q_tie: 2, q_appeal: 3, q_limits: 3, abstain: 0.3 };
      const pool = [...QUESTION_CANDIDATES.map((q) => q.id), 'abstain'];
      return { kind: 'transfer', choice: weighted(pool.map((id) => [id, weights[id] ?? 1] as [string, number]), limit) };
    }
    case 'post_check': {
      const keep = opts.before && chance(0.45);
      const choice: CheckChoice = keep
        ? opts.before!
        : weighted<CheckChoice>([
            ['yes', 1],
            ['no', 6],
            ['unsure', 1.5],
          ]);
      return { kind: 'postcheck', choice, reason: chance(0.3) ? pick(POST_REASONS) : undefined };
    }
    default:
      return null;
  }
}

export const BOT_NOUNS = ['봇 수달', '봇 고래', '봇 펭귄', '봇 여우', '봇 부엉이', '봇 거북이', '봇 다람쥐', '봇 돌고래', '봇 토끼', '봇 고슴도치'];
export const BOT_ADJ = ['연습용', '리허설', '테스트', '시험용', '가상'];
