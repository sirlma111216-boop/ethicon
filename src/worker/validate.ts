import { z } from 'zod';
import { CLUES, FREE_TEXT_MAX, PACKAGES, PERSPECTIVES, QUESTION_CANDIDATES } from '../shared/content';
import { PHASES } from '../shared/types';

const clueIds = CLUES.map((c) => c.id) as [string, ...string[]];
const packageIds = PACKAGES.map((p) => p.id) as [string, ...string[]];
const questionIds = QUESTION_CANDIDATES.map((q) => q.id) as [string, ...string[]];
const allTags = PERSPECTIVES.flatMap((p) => p.tags.map((t) => t.id)) as [string, ...string[]];

/** 자유 응답: 길이 제한, 제어문자 제거, URL 금지 */
const freeText = z
  .string()
  .trim()
  .max(FREE_TEXT_MAX)
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
  .refine((s) => !/https?:\/\//i.test(s), { message: '링크는 쓸 수 없어요.' })
  .optional();

const checkChoice = z.enum(['yes', 'no', 'unsure']);

export const submissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('precheck'), choice: checkChoice }),
  z.object({ kind: z.literal('verdict'), choice: z.enum(['approve', 'investigate', 'reject', 'abstain']) }),
  z
    .object({ kind: z.literal('investigate'), picks: z.array(z.enum(clueIds)).min(1).max(2), tag: z.enum(allTags), reason: freeText })
    .refine((v) => new Set(v.picks).size === v.picks.length, { message: '같은 카드를 두 번 고를 수 없어요.' }),
  z.object({ kind: z.literal('package'), choice: z.enum([...packageIds, 'abstain']) }),
  z.object({ kind: z.literal('transfer'), choice: z.enum([...questionIds, 'abstain']) }),
  z.object({ kind: z.literal('postcheck'), choice: checkChoice, reason: freeText }),
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
      z.object({ op: z.literal('add_bots'), count: z.number().int().min(1).max(40) }),
      z.object({ op: z.literal('remove_bots') }),
    ]),
  }),
]);

export type ParsedClientMessage = z.infer<typeof clientMessageSchema>;
