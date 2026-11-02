import { z } from 'zod';
import { CLUES, FREE_TEXT_MAX, PACKAGES, PERSPECTIVES, POLICIES, QUESTION_CANDIDATES, TRANSFER_SCENARIO } from '../shared/content';
import { PHASES } from '../shared/types';

const clueIds = CLUES.map((c) => c.id) as [string, ...string[]];
const policyIds = POLICIES.map((p) => p.id) as [string, ...string[]];
const packageIds = PACKAGES.map((p) => p.id) as [string, ...string[]];
const questionIds = QUESTION_CANDIDATES.map((q) => q.id) as [string, ...string[]];
const transferIds = TRANSFER_SCENARIO.options.map((o) => o.id) as [string, ...string[]];
const allTags = PERSPECTIVES.flatMap((p) => p.tags.map((t) => t.id)) as [string, ...string[]];

/** 자유 응답: 길이 제한, 제어문자 제거, URL 금지 */
const freeText = z
  .string()
  .trim()
  .max(FREE_TEXT_MAX)
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
  .refine((s) => !/https?:\/\//i.test(s), { message: '링크는 쓸 수 없어요.' })
  .optional();

const confidence = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const surveyChoice = z.enum(['always', 'mostly', 'depends', 'unsure']);

export const submissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('practice'), choice: z.enum(['booth', 'food', 'stage', 'unsure']) }),
  z.object({ kind: z.literal('survey'), choice: surveyChoice, confidence, reason: freeText }),
  z.object({ kind: z.literal('policy'), choice: z.enum([...policyIds, 'abstain']) }),
  z.object({ kind: z.literal('info'), choice: z.enum([...clueIds, 'abstain']) }),
  z
    .object({ kind: z.literal('investigate'), first: z.enum(clueIds), second: z.enum(clueIds), tag: z.enum(allTags), reason: freeText })
    .refine((v) => v.first !== v.second, { message: '서로 다른 카드 2장을 골라요.' }),
  z.object({ kind: z.literal('package'), choice: z.enum([...packageIds, 'abstain']) }),
  z
    .object({ kind: z.literal('questions'), picks: z.array(z.enum(questionIds)).max(2), abstain: z.boolean().optional() })
    .refine((v) => new Set(v.picks).size === v.picks.length, { message: '같은 질문을 두 번 고를 수 없어요.' })
    .refine((v) => v.abstain === true || v.picks.length === 2, { message: '질문 2개를 고르거나 보류를 선택해요.' }),
  z.object({ kind: z.literal('transfer'), choice: z.enum(transferIds) }),
  z.object({ kind: z.literal('post'), choice: surveyChoice, confidence, reason: freeText, changeNote: freeText }),
]);

export const phaseSchema = z.enum(PHASES);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(8).max(200) }),
  z.object({ type: z.literal('hello'), clientRevision: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('ping') }),
  z.object({
    type: z.literal('submit'),
    messageId: z.string().min(1).max(64),
    roundId: z.string().min(1).max(64),
    phase: phaseSchema,
    payload: submissionSchema,
  }),
  z.object({
    type: z.literal('teacher'),
    messageId: z.string().min(1).max(64),
    expectedRevision: z.number().int().nonnegative().optional(),
    command: z.discriminatedUnion('op', [
      z.object({ op: z.literal('start') }),
      z.object({ op: z.literal('next') }),
      z.object({ op: z.literal('back') }),
      z.object({ op: z.literal('goto'), phase: phaseSchema }),
      z.object({ op: z.literal('lock_room'), locked: z.boolean() }),
      z.object({ op: z.literal('close_submissions') }),
      z.object({ op: z.literal('reveal') }),
      z.object({ op: z.literal('rerun'), seconds: z.number().int().min(10).max(600).optional() }),
      z.object({ op: z.literal('extend'), seconds: z.number().int().min(10).max(600) }),
      z.object({ op: z.literal('pause') }),
      z.object({ op: z.literal('resume') }),
      z.object({ op: z.literal('decide'), choice: z.string().min(1).max(120), reason: z.string().trim().min(1).max(200) }),
      z.object({ op: z.literal('skip'), reason: z.string().trim().max(200) }),
      z.object({ op: z.literal('moderate'), textId: z.string().min(1).max(64), status: z.enum(['approved', 'hidden']) }),
      z.object({ op: z.literal('sound_screen'), screen: z.enum(['teacher', 'public']) }),
      z.object({ op: z.literal('duck'), ducked: z.boolean() }),
      z.object({ op: z.literal('end') }),
      z.object({ op: z.literal('delete_room') }),
    ]),
  }),
]);

export type ParsedClientMessage = z.infer<typeof clientMessageSchema>;
