// 공유 타입: 클라이언트·서버가 같은 정의를 사용한다.
// 민감한 콘텐츠(미공개 단서, 교사 메모)는 여기 두지 않고 서버 전용 모듈에 둔다.

export const PHASES = [
  'lobby',
  'intro', // 이야기 · 신청자 12명 · AI 배정기 소개
  'pre_check', // 결정 1: AI가 자료대로 계산하면 공정할까? (1탭)
  'ai_verdict', // 결정 2: AI 추천을 승인/보류/거부 (1탭)
  'verdict_result', // 분기 장면: 승인→발표+이의 제기 / 보류→조사 / 거부→운영자 반응
  'investigate', // 결정 3: 조사 토큰으로 열 카드 + 내 관점의 한마디
  'investigate_reveal', // 단서 공개 · 관점 보드
  'redesign', // 결정 4: 새 규칙 패키지 (1탭)
  'redesign_result', // AI 재계산 · 이전/이후 · AI 설명문
  'transfer', // 결정 5: 다른 상황에서 먼저 물어볼 질문 (1탭) → 공동 약속
  'post_check', // 결정 6: 처음 질문에 다시 답하기 (1탭 + 선택 이유)
  'ending',
  'closed',
] as const;
export type Phase = (typeof PHASES)[number];

export type PolicyId = 'first' | 'experience' | 'newcomer';
export type PackageId = 'keep' | 'open' | 'access' | 'mix';
export type ClueId = 'access' | 'experience' | 'rules' | 'explanation';
export type PerspectiveId = 'applicant' | 'newcomer' | 'organizer' | 'guide';
export type CheckChoice = 'yes' | 'no' | 'unsure';
export type VerdictChoice = 'approve' | 'investigate' | 'reject';

export type Role = 'teacher' | 'student' | 'public';

/** 학생 제출 payload — 단계별로 모양이 다르다. 서버가 zod로 검증한다. */
export type SubmissionPayload =
  | { kind: 'precheck'; choice: CheckChoice }
  | { kind: 'verdict'; choice: VerdictChoice | 'abstain' }
  | { kind: 'investigate'; picks: ClueId[]; tag: string; reason?: string }
  | { kind: 'package'; choice: PackageId | 'abstain' }
  | { kind: 'transfer'; choice: string }
  | { kind: 'postcheck'; choice: CheckChoice; reason?: string };

export type SubmissionKind = SubmissionPayload['kind'];

export interface Tally {
  roundId: string;
  /** 선택지별 득표 수 (기권 포함, key 'abstain') */
  counts: Record<string, number>;
  responded: number;
  eligible: number;
  /** 최다 득표 선택지(들). 2개 이상이면 동률. */
  top: string[];
  /** 소수 응답(3명 미만) 항목은 counts 에서 'few'로 묶였는지 여부 */
  smallGroupsMerged: boolean;
}

export interface TeacherDecision {
  phase: Phase;
  roundId: string;
  choice: string;
  reason: string;
  at: number;
}

export interface AllocationResult {
  policyOrPackage: PolicyId | PackageId;
  selected: string[]; // applicant ids, 정원 6
  waiting: string[]; // 남은 신청자 (대기 순서)
  firstTimerCount: number;
  /** 동점 추첨으로 결정된 신청자 id 목록 */
  decidedByLottery: string[];
  explanationMinutes: number;
  appeal: string;
  explainsWhat: string;
  publishes: string[];
}

export interface Comparison {
  before: AllocationResult;
  after: AllocationResult;
  gained: string[]; // 새로 선발
  lost: string[]; // 새로 제외
  unchanged: string[];
}

export interface PerspectiveBoardRow {
  perspective: PerspectiveId;
  responded: number;
  tags: Record<string, number>; // tag id -> count (3명 미만은 묶음)
  merged: boolean;
}

export interface RevealedClue {
  id: ClueId;
  evidence: string[];
  reactions: { applicantId: string; text: string }[];
}

export interface RoomDecisions {
  verdict?: VerdictChoice;
  verdictByTeacher?: boolean;
  /** 조사 토큰 수: 승인 뒤 이의 제기 → 1, 보류·거부 → 2 */
  tokens?: number;
  clues?: ClueId[];
  cluesByTeacher?: boolean;
  pkg?: PackageId;
  pkgByTeacher?: boolean;
  questions?: string[];
  questionsByTeacher?: boolean;
}

export interface PhaseRound {
  roundId: string;
  startedAt: number;
  /** 서버 시각 기준 마감 시각. null 이면 타이머 없음 또는 일시정지 */
  endsAt: number | null;
  pausedRemainingMs: number | null;
  locked: boolean;
  revealed: boolean;
  tie: string[] | null;
  /** 재투표 시 선택지를 동률 항목으로 제한 */
  limitTo: string[] | null;
  rerunCount: number;
  /** 활동 단계에서 기본 제한 시간(초) */
  durationSeconds: number | null;
}

/** 승인 분기 장면에서 서버가 내려주는 내용 */
export interface VerdictScene {
  verdict: VerdictChoice;
  title: string;
  story: string[];
  /** 이의 제기 편지(승인 분기) 또는 반응 */
  letters: { applicantId: string; text: string }[];
  tokens: number;
  tokenNote: string;
}

/** 모든 역할에게 전달되는 공용 상태 */
export interface PublicState {
  code: string;
  appEnv: string;
  phase: Phase;
  phaseIndex: number;
  round: PhaseRound;
  revision: number;
  /** 장면·라운드·결정이 바뀔 때만 증가. 교사 버튼 연타 방지용 */
  flowRevision: number;
  serverNow: number;
  joined: number;
  locked: boolean; // 입장 잠금
  paused: boolean;
  teacherConnected: boolean;
  soundScreen: 'teacher' | 'public';
  bgmDucked: boolean;
  responded: number;
  decisions: RoomDecisions;
  teacherDecisions: TeacherDecision[];
  /** 공개된 집계(현재 또는 과거 라운드). phase 별로 저장 */
  tallies: Partial<Record<Phase, Tally>>;
  allocations: {
    r1?: AllocationResult; // AI 배정기의 첫 추천(선착순 기본 설정)
    r3?: Comparison;
  };
  verdictScene?: VerdictScene;
  revealedClues: RevealedClue[];
  /** 공개 후 '기본 자료' 로 열리는 미선택 단서 */
  baseClues: RevealedClue[];
  perspectiveBoard: PerspectiveBoardRow[];
  approvedTexts: { kind: string; text: string }[];
  lottery: string[];
  ending?: EndingSummary;
  expiresAt: number;
  createdAt: number;
}

export interface EndingSummary {
  verdictLabel: string;
  verdictNote: string;
  tokens: number;
  pkgName: string;
  gained: string[]; // 이름
  lost: string[]; // 이름
  questions: string[];
  openQuestion: string;
  surveyShift: { before: Record<string, number>; after: Record<string, number>; respondedBefore: number; respondedAfter: number } | null;
  principles: { id: 'fairness' | 'transparency'; name: string; official: string; whatWeDid: string }[];
  badges: { perspective: boolean; evidence: boolean; revision: boolean };
}

export interface PendingText {
  id: string;
  kind: string;
  text: string;
  status: 'pending' | 'approved' | 'hidden';
}

export interface TeacherState {
  publicToken: string;
  pendingTexts: PendingText[];
  notes: TeacherNotes | null;
  participants: { connected: number; total: number; bots: number };
  /** 라운드별 응답 수 (집계 전에도 보임, 분포는 안 보임) */
  responseCount: number;
  canAdvance: boolean;
  advanceBlockedReason: string | null;
  summary?: TeacherSummary;
}

export interface TeacherNotes {
  prompts: string[];
  misconceptions: string[];
  followUps: string[];
  script: string;
}

export interface TeacherSummary {
  generatedAt: number;
  joined: number;
  decisions: RoomDecisions;
  tallies: Partial<Record<Phase, Tally>>;
  surveyShift: EndingSummary['surveyShift'];
  changeMatrix: Record<string, number> | null;
  perspectiveBoard: PerspectiveBoardRow[];
  approvedTexts: { kind: string; text: string }[];
}

export interface MeState {
  participantId: string;
  pseudonym: string;
  avatar: number;
  perspective: PerspectiveId;
  submissions: Partial<Record<Phase, { roundId: string; payload: SubmissionPayload; at: number }>>;
  /** 현재 라운드에 제출했는지 */
  submittedThisRound: boolean;
  joinedAt: number;
}

// ---- WebSocket 메시지 ----

export type ClientMessage =
  | { type: 'hello'; clientRevision?: number }
  | { type: 'submit'; messageId: string; roundId: string; phase: Phase; payload: SubmissionPayload }
  | { type: 'ping' }
  | TeacherCommand;

export type TeacherCommand = {
  type: 'teacher';
  messageId: string;
  expectedRevision?: number;
  command: TeacherCommandBody;
};

export type TeacherCommandBody =
  | { op: 'start' }
  | { op: 'next' }
  | { op: 'back' }
  | { op: 'goto'; phase: Phase }
  | { op: 'lock_room'; locked: boolean }
  | { op: 'close_submissions' }
  | { op: 'reveal' }
  | { op: 'rerun'; seconds?: number }
  | { op: 'extend'; seconds: number }
  | { op: 'pause' }
  | { op: 'resume' }
  | { op: 'decide'; choice: string; reason: string }
  | { op: 'skip'; reason: string }
  | { op: 'moderate'; textId: string; status: 'approved' | 'hidden' }
  | { op: 'sound_screen'; screen: 'teacher' | 'public' }
  | { op: 'duck'; ducked: boolean }
  | { op: 'end' }
  | { op: 'delete_room' }
  | { op: 'add_bots'; count: number }
  | { op: 'remove_bots' };

export type ServerMessage =
  | { type: 'snapshot'; state: PublicState; me?: MeState; teacher?: TeacherState }
  | { type: 'ack'; messageId: string; ok: true; revision: number }
  | { type: 'ack'; messageId: string; ok: false; code: string; message: string }
  | { type: 'error'; code: string; message: string; fatal?: boolean }
  | { type: 'pong'; serverNow: number }
  | { type: 'kicked'; reason: string };

// ---- REST ----

export interface CreateRoomResponse {
  code: string;
  teacherToken: string;
  publicToken: string;
  expiresAt: number;
}
export interface JoinRoomResponse {
  participantId: string;
  studentToken: string;
  pseudonym: string;
  avatar: number;
}
export interface ApiError {
  error: string;
  code: string;
}
