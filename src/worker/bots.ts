// 연습용 봇 학생: 교사가 혼자 전체 흐름을 리허설할 수 있도록 그럴듯한 응답을 만든다.
// 봇은 실제 학생과 같은 경로(submissions·texts 테이블)로 저장되고, 교사가 언제든 제거할 수 있다.
import { CLUES, PACKAGES, POLICIES, PRACTICE_OPTIONS, QUESTION_CANDIDATES, SURVEY_OPTIONS, TRANSFER_SCENARIO, perspectiveById } from '../shared/content';
import type { ClueId, PackageId, PerspectiveId, Phase, PhaseRound, PolicyId, SubmissionPayload, SurveyChoice } from '../shared/types';

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

const SURVEY_REASONS = ['규칙이 같으면 누구나 똑같이 적용받으니까', '같은 규칙이어도 상황이 다르면 결과가 다를 것 같아서', '예외가 있을지 아직 잘 모르겠어서', '먼저 준비한 사람이 유리한 건 당연한 것 같아서'];
const INVESTIGATE_REASONS = ['왜 늦게 신청했는지부터 알아야 할 것 같아서', '점수가 무엇을 세는지 모르면 판단할 수 없어서', '동점을 어떻게 정했는지 궁금해서', '떨어진 사람이 무슨 말을 들었는지 알고 싶어서'];
const POST_REASONS = ['신청 창구가 하나뿐이었다는 걸 보고 나서', '경험 점수가 처음인 사람에게 불리하다는 걸 알고 나서', '기준을 공개해도 자리가 안 바뀌는 걸 보고 나서', '그래도 먼저 신청한 노력은 인정해야 한다고 생각해서'];

/** 단계에 맞는 봇 응답. limitTo(재투표 제한)를 지킨다. */
export function botPayload(phase: Phase, round: PhaseRound, perspective: PerspectiveId, before?: SurveyChoice): SubmissionPayload | null {
  const limit = round.limitTo;
  switch (phase) {
    case 'practice':
      return { kind: 'practice', choice: pick(PRACTICE_OPTIONS).id as 'booth' | 'food' | 'stage' | 'unsure' };
    case 'pre_survey':
      return {
        kind: 'survey',
        choice: weighted<SurveyChoice>([
          ['always', 3],
          ['mostly', 4],
          ['depends', 2],
          ['unsure', 1],
        ]),
        confidence: pick([1, 2, 2, 3] as const),
        reason: chance(0.3) ? pick(SURVEY_REASONS) : undefined,
      };
    case 'r1_vote':
      return {
        kind: 'policy',
        choice: weighted<PolicyId | 'abstain'>(
          [
            ['first', 5],
            ['experience', 3],
            ['newcomer', 3],
            ['abstain', 0.5],
          ],
          limit,
        ),
      };
    case 'r1_info':
      return { kind: 'info', choice: pick(CLUES).id as ClueId };
    case 'r2_choose': {
      const ids = CLUES.map((c) => c.id) as ClueId[];
      const first = weighted<ClueId>([
        ['access', 4],
        ['rules', 3],
        ['experience', 2],
        ['explanation', 2],
      ]);
      const second = pick(ids.filter((id) => id !== first));
      return { kind: 'investigate', first, second, tag: pick(perspectiveById(perspective).tags).id, reason: chance(0.25) ? pick(INVESTIGATE_REASONS) : undefined };
    }
    case 'r3_vote':
      return {
        kind: 'package',
        choice: weighted<PackageId | 'abstain'>(
          [
            ['keep', 1.5],
            ['open', 2.5],
            ['access', 4],
            ['mix', 3],
            ['abstain', 0.5],
          ],
          limit,
        ),
      };
    case 'r4_questions': {
      if (chance(0.05)) return { kind: 'questions', picks: [], abstain: true };
      const pool = (limit && limit.length >= 2 ? limit : QUESTION_CANDIDATES.map((q) => q.id)).slice();
      const weightsAll: Record<string, number> = { q_criteria: 3, q_data: 2, q_start: 4, q_tie: 2, q_appeal: 3, q_limits: 3 };
      const a = weighted(pool.map((id) => [id, weightsAll[id] ?? 1] as [string, number]));
      const b = weighted(pool.filter((id) => id !== a).map((id) => [id, weightsAll[id] ?? 1] as [string, number]));
      return { kind: 'questions', picks: [a, b] };
    }
    case 'r4_transfer':
      return { kind: 'transfer', choice: weighted(TRANSFER_SCENARIO.options.map((o) => [o.id, o.id === 'abstain' ? 0.5 : o.id === 't_attendance' ? 4 : 2] as [string, number])) };
    case 'r5_post': {
      // 사전 답을 기준으로 일부는 유지, 일부는 '출발 조건' 쪽으로 이동
      const keep = before && chance(0.45);
      const choice: SurveyChoice = keep
        ? before
        : weighted<SurveyChoice>([
            ['always', 1],
            ['mostly', 3],
            ['depends', 5],
            ['unsure', 1],
          ]);
      return { kind: 'post', choice, confidence: pick([2, 2, 3] as const), reason: chance(0.3) ? pick(POST_REASONS) : undefined };
    }
    default:
      return null;
  }
}

export const BOT_NOUNS = ['봇 수달', '봇 고래', '봇 펭귄', '봇 여우', '봇 부엉이', '봇 거북이', '봇 다람쥐', '봇 돌고래', '봇 토끼', '봇 고슴도치'];
export const BOT_ADJ = ['연습용', '리허설', '테스트', '시험용', '가상'];
export const surveyChoiceIds = SURVEY_OPTIONS.map((o) => o.id);
export const policyIds = POLICIES.map((p) => p.id);
export const packageIds = PACKAGES.map((p) => p.id);
