// 순수 계산 모듈: 배정, 집계, 비교. 서버와 테스트에서 사용한다.
// 입력이 같으면 결과가 같아야 한다(세션별 추첨 순서는 인자로 받는다).
import { APPLICANTS, CAPACITY, PACKAGES, packageById, type Applicant } from './content';
import type { AllocationResult, Comparison, PackageId, PerspectiveBoardRow, PerspectiveId, PolicyId, Tally } from './types';

// ---------- 결정적 난수 / 추첨 ----------

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 세션별 고정 추첨 순서: 같은 seed → 같은 순서 */
export function makeLottery(seed: string, ids: string[] = APPLICANTS.map((a) => a.id)): string[] {
  const rnd = mulberry32(hashSeed(seed));
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const rnd = mulberry32(hashSeed(seed));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ---------- 배정 ----------

/** 신청 기회 보정: applicantId → 보정할 분(分). 서버 전용 콘텐츠에서 넘긴다. */
export type Barriers = Record<string, number>;

export const experienceScore = (a: Applicant): number => a.prior * 10 + a.interest;

function adjustedMinute(a: Applicant, barriers?: Barriers): number {
  const d = barriers?.[a.id] ?? 0;
  return Math.max(0, a.applyMinute - d);
}

type Keyed = { a: Applicant; key: number[]; lot: number };

function rank(applicants: Applicant[], lottery: string[], keyOf: (a: Applicant) => number[]): Keyed[] {
  const lotIndex = new Map(lottery.map((id, i) => [id, i]));
  const rows: Keyed[] = applicants.map((a) => ({ a, key: keyOf(a), lot: lotIndex.get(a.id) ?? 999 }));
  rows.sort((x, y) => {
    for (let i = 0; i < Math.max(x.key.length, y.key.length); i++) {
      const d = (x.key[i] ?? 0) - (y.key[i] ?? 0);
      if (d !== 0) return d;
    }
    return x.lot - y.lot;
  });
  return rows;
}

function sameKey(x: number[], y: number[]): boolean {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** 정원 경계에서 동점 추첨으로 갈린 신청자 id */
function lotteryDecided(rows: Keyed[], cut: number): string[] {
  if (cut <= 0 || cut >= rows.length) return [];
  const last = rows[cut - 1]!;
  const first = rows[cut]!;
  if (!sameKey(last.key, first.key)) return [];
  return rows.filter((r) => sameKey(r.key, last.key)).map((r) => r.a.id);
}

export function policyKey(policy: PolicyId, barriers?: Barriers): (a: Applicant) => number[] {
  switch (policy) {
    case 'first':
      return (a) => [adjustedMinute(a, barriers)];
    case 'experience':
      return (a) => [-experienceScore(a)];
    case 'newcomer':
      return (a) => [a.prior === 0 ? 0 : 1, adjustedMinute(a, barriers)];
  }
}

export interface RawAllocation {
  selected: string[];
  waiting: string[];
  decidedByLottery: string[];
}

export function allocateByPolicy(policy: PolicyId, lottery: string[], barriers?: Barriers, applicants: Applicant[] = APPLICANTS, capacity = CAPACITY): RawAllocation {
  const rows = rank(applicants, lottery, policyKey(policy, barriers));
  return {
    selected: rows.slice(0, capacity).map((r) => r.a.id),
    waiting: rows.slice(capacity).map((r) => r.a.id),
    decidedByLottery: lotteryDecided(rows, capacity),
  };
}

const firstTimers = (ids: string[], applicants: Applicant[]) => ids.filter((id) => applicants.find((a) => a.id === id)!.prior === 0).length;

export function r1Allocation(policy: PolicyId, lottery: string[], applicants: Applicant[] = APPLICANTS): AllocationResult {
  const raw = allocateByPolicy(policy, lottery, undefined, applicants);
  return {
    policyOrPackage: policy,
    ...raw,
    firstTimerCount: firstTimers(raw.selected, applicants),
    explanationMinutes: 2,
    appeal: '이의 제기 없음.',
    explainsWhat: '결과만 알려 줘요. "선정" 또는 "미선정".',
    publishes: ['선정 여부'],
  };
}

export function allocateByPackage(pkg: PackageId, basePolicy: PolicyId, lottery: string[], barriers: Barriers, applicants: Applicant[] = APPLICANTS, capacity = CAPACITY): AllocationResult {
  const info = packageById(pkg);
  let raw: RawAllocation;
  switch (pkg) {
    case 'keep':
    case 'open':
      raw = allocateByPolicy(basePolicy, lottery, undefined, applicants, capacity);
      break;
    case 'access': {
      // 보정한 기존 규칙으로 4자리, 처음 참여하는 사람 중 추첨 2자리
      const baseSeats = capacity - 2;
      const rows = rank(applicants, lottery, policyKey(basePolicy, barriers));
      const seats = rows.slice(0, baseSeats).map((r) => r.a.id);
      const decided = lotteryDecided(rows, baseSeats);
      const remainingFirst = lottery.filter((id) => !seats.includes(id) && applicants.find((a) => a.id === id)!.prior === 0);
      const reserved = remainingFirst.slice(0, 2);
      const selected = [...seats, ...reserved];
      const fill = rows.map((r) => r.a.id).filter((id) => !selected.includes(id));
      while (selected.length < capacity && fill.length) selected.push(fill.shift()!);
      const waiting = rows.map((r) => r.a.id).filter((id) => !selected.includes(id));
      const lotteryIds = new Set([...decided, ...reserved, ...remainingFirst.slice(2)]);
      raw = { selected, waiting, decidedByLottery: [...lotteryIds] };
      break;
    }
    case 'mix': {
      const newcomers = rank(applicants.filter((a) => a.prior === 0), lottery, (a) => [adjustedMinute(a, barriers)]);
      const veterans = rank(applicants.filter((a) => a.prior > 0), lottery, (a) => [-experienceScore(a)]);
      const half = capacity / 2;
      const selected = [...newcomers.slice(0, half).map((r) => r.a.id), ...veterans.slice(0, half).map((r) => r.a.id)];
      const waiting = [...newcomers.slice(half).map((r) => r.a.id), ...veterans.slice(half).map((r) => r.a.id)];
      raw = { selected, waiting, decidedByLottery: [...lotteryDecided(newcomers, half), ...lotteryDecided(veterans, half)] };
      break;
    }
  }
  return {
    policyOrPackage: pkg,
    ...raw,
    firstTimerCount: firstTimers(raw.selected, applicants),
    explanationMinutes: info.explanationMinutes,
    appeal: info.appeal,
    explainsWhat: info.explanation,
    publishes: info.publishes,
  };
}

export function compareAllocations(before: AllocationResult, after: AllocationResult): Comparison {
  const b = new Set(before.selected);
  const a = new Set(after.selected);
  return {
    before,
    after,
    gained: after.selected.filter((id) => !b.has(id)),
    lost: before.selected.filter((id) => !a.has(id)),
    unchanged: after.selected.filter((id) => b.has(id)),
  };
}

/** 모든 패키지의 결과를 한 번에 — 테스트와 교사 요약에 사용 */
export function allPackageOutcomes(basePolicy: PolicyId, lottery: string[], barriers: Barriers): Record<PackageId, AllocationResult> {
  const out = {} as Record<PackageId, AllocationResult>;
  for (const p of PACKAGES) out[p.id] = allocateByPackage(p.id, basePolicy, lottery, barriers);
  return out;
}

// ---------- 집계 ----------

export const SMALL_GROUP = 3;

/**
 * 1인 1표 집계. votes 는 참가자별 마지막 유효 선택(기권 'abstain' 포함).
 * top 은 기권을 제외한 최다 득표. 3명 미만 항목은 'few' 로 묶는다(최다 득표 항목은 유지).
 */
export function tallyVotes(roundId: string, votes: string[], eligible: number, options: string[]): Tally {
  const raw: Record<string, number> = {};
  for (const o of options) raw[o] = 0;
  raw['abstain'] = 0;
  for (const v of votes) raw[v] = (raw[v] ?? 0) + 1;
  const max = Math.max(0, ...options.map((o) => raw[o] ?? 0));
  const top = max > 0 ? options.filter((o) => raw[o] === max) : [];
  const counts: Record<string, number> = {};
  let merged = false;
  for (const o of options) {
    const n = raw[o] ?? 0;
    if (n > 0 && n < SMALL_GROUP && !top.includes(o)) {
      counts['few'] = (counts['few'] ?? 0) + n;
      merged = true;
    } else {
      counts[o] = n;
    }
  }
  counts['abstain'] = raw['abstain'] ?? 0;
  return { roundId, counts, responded: votes.length, eligible, top, smallGroupsMerged: merged };
}

/** 복수 선택(질문 2개 고르기) 집계: 각 선택지의 선택 수, 상위 2개 */
export function tallyMulti(roundId: string, picks: string[][], eligible: number, options: string[], take: number): Tally & { ranked: string[] } {
  const raw: Record<string, number> = {};
  for (const o of options) raw[o] = 0;
  let abstain = 0;
  for (const p of picks) {
    if (p.length === 0) abstain++;
    for (const o of p) raw[o] = (raw[o] ?? 0) + 1;
  }
  const ranked = [...options].sort((x, y) => (raw[y] ?? 0) - (raw[x] ?? 0));
  // 상위 take 개를 정하되, take 번째 자리에서 동률이면 tie 로 표시
  const cutoffScore = raw[ranked[take - 1] ?? ''] ?? 0;
  const tiedAtCut = ranked.filter((o) => raw[o] === cutoffScore);
  const clearlyIn = ranked.filter((o) => (raw[o] ?? 0) > cutoffScore);
  const top = cutoffScore > 0 && clearlyIn.length + tiedAtCut.length > take ? [...clearlyIn, ...tiedAtCut] : ranked.slice(0, take).filter((o) => (raw[o] ?? 0) > 0);
  const counts: Record<string, number> = {};
  let merged = false;
  for (const o of options) {
    const n = raw[o] ?? 0;
    if (n > 0 && n < SMALL_GROUP && !top.includes(o)) {
      counts['few'] = (counts['few'] ?? 0) + n;
      merged = true;
    } else counts[o] = n;
  }
  counts['abstain'] = abstain;
  return { roundId, counts, responded: picks.length, eligible, top, smallGroupsMerged: merged, ranked };
}

export function perspectiveBoard(rows: { perspective: PerspectiveId; tag: string }[], perspectives: PerspectiveId[]): PerspectiveBoardRow[] {
  return perspectives.map((p) => {
    const mine = rows.filter((r) => r.perspective === p);
    const tags: Record<string, number> = {};
    for (const r of mine) tags[r.tag] = (tags[r.tag] ?? 0) + 1;
    const merged = mine.length < SMALL_GROUP;
    return { perspective: p, responded: mine.length, tags: merged ? {} : tags, merged };
  });
}

/** 사전·사후 분포. 3명 미만 응답이면 null */
export function surveyShift(before: string[], after: string[]) {
  if (before.length < SMALL_GROUP && after.length < SMALL_GROUP) return null;
  const count = (xs: string[]) => {
    const c: Record<string, number> = {};
    for (const x of xs) c[x] = (c[x] ?? 0) + 1;
    return c;
  };
  return { before: count(before), after: count(after), respondedBefore: before.length, respondedAfter: after.length };
}

/** 유지/변화 행렬. 개인 식별 없이 '유지', '변화' 두 묶음만 센다 */
export function changeMatrix(pairs: { before: string; after: string }[]): Record<string, number> | null {
  if (pairs.length < SMALL_GROUP) return null;
  let kept = 0;
  let changed = 0;
  for (const p of pairs) (p.before === p.after ? kept++ : changed++);
  return { kept, changed };
}
