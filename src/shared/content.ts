// 공개 콘텐츠: 학생·공개 화면에서 언제든 보여도 되는 내용만 둔다.
// 미공개 단서·인물 반응·교사 메모는 src/worker/secretContent.ts 에 있다.
import type { CheckChoice, ClueId, PackageId, PerspectiveId, Phase, PolicyId, VerdictChoice } from './types';

export const CAPACITY = 6;
export const MAX_STUDENTS = 40;
export const FREE_TEXT_MAX = 80;

export const APP_TITLE = '축제의 빈자리';
export const APP_SUBTITLE = 'AI 배정기는 누구를 빼놓았을까';
export const SIMULATION_NOTICE = '실제 사람을 평가하지 않는 가상 AI 배정 실험입니다. 신청자와 자료는 모두 지어낸 것입니다.';

/** 이야기 속 AI. 학습된 모델이 아니라 정해진 식을 계산하는 교육용 시뮬레이터라는 점을 화면에 명시한다. */
export const AI_AGENT = {
  name: 'AI 배정기',
  tagline: '축제 운영팀이 올해 처음 도입한 자동 배정 프로그램',
  dataUsed: ['신청 시각', '이전 축제 부스 참여 횟수', '신청서의 관심도(1~3)'],
  defaultRule: '신청 시각이 빠른 순서 (기본 설정)',
  defaultRuleId: 'first' as PolicyId,
  verdictLine: '신청 시각이 빠른 순서로 6명을 추천합니다. 신청 시각이 같으면 추첨 순서로 정했습니다.',
  unknownHint: 'AI 배정기가 확인하지 않은 것이 있을까요? 조사해 보기 전에는 알 수 없어요.',
  disclaimer: '이 AI 배정기는 정해진 식을 계산하는 교육용 시뮬레이터예요. 실제 AI는 훨씬 복잡한 자료를 쓰지만, 기준·자료·한계를 묻는 질문은 똑같이 필요해요.',
};

/** 가상 신청자 공개 정보 — 모두 가상 인물. 성별·외모를 고정하지 않는 중성적 이름을 쓴다. */
export interface Applicant {
  id: string;
  name: string;
  /** 신청 창구가 열린 12:30 이후 몇 분 뒤에 신청했는지 */
  applyMinute: number;
  /** 이전 축제 부스 참여 횟수(가상) */
  prior: number;
  /** 신청서의 '미래탐험 관심도' 1~3 */
  interest: 1 | 2 | 3;
  /** 공개 가능한 한 줄 소개(가상) */
  intro: string;
}

export const APPLICANTS: Applicant[] = [
  { id: 'a01', name: '하람', applyMinute: 1, prior: 2, interest: 3, intro: '로봇 부스를 두 번 도와본 적이 있어요.' },
  { id: 'a02', name: '도윤', applyMinute: 2, prior: 0, interest: 2, intro: '친구가 알려줘서 바로 신청했어요.' },
  { id: 'a03', name: '서진', applyMinute: 3, prior: 3, interest: 3, intro: '작년에 운영 도우미를 했어요.' },
  { id: 'a04', name: '지우', applyMinute: 5, prior: 1, interest: 1, intro: '다른 부스도 가고 싶지만 일단 신청했어요.' },
  { id: 'a05', name: '로아', applyMinute: 7, prior: 0, interest: 3, intro: '미래탐험 영상을 보고 꼭 해보고 싶었어요.' },
  { id: 'a06', name: '태양', applyMinute: 9, prior: 2, interest: 2, intro: '작년에 재미있어서 또 신청했어요.' },
  { id: 'a07', name: '은유', applyMinute: 14, prior: 0, interest: 3, intro: '처음 신청해요. 설렙니다.' },
  { id: 'a08', name: '민결', applyMinute: 18, prior: 1, interest: 2, intro: '친구랑 같이 가려고 신청했어요.' },
  { id: 'a09', name: '해온', applyMinute: 22, prior: 0, interest: 3, intro: '처음이라 어떤 건지 궁금해요.' },
  { id: 'a10', name: '보라', applyMinute: 25, prior: 3, interest: 1, intro: '매년 가는 편이에요.' },
  { id: 'a11', name: '시안', applyMinute: 27, prior: 0, interest: 2, intro: '전학 온 지 얼마 안 됐어요.' },
  { id: 'a12', name: '다온', applyMinute: 29, prior: 2, interest: 3, intro: '점심시간에 방송부 일이 있어요.' },
];

export const applicantById = (id: string): Applicant => {
  const a = APPLICANTS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown applicant ${id}`);
  return a;
};
export const applyTime = (a: Applicant) => `12:${String(30 + a.applyMinute).padStart(2, '0')}`;

export interface PolicyInfo {
  id: PolicyId;
  name: string;
  short: string;
  formula: string;
  benefit: string;
  cost: string;
}

/** 배정 규칙 3종. AI 배정기 기본 설정은 '선착순'. 나머지는 패키지 안에서 조합된다. */
export const POLICIES: PolicyInfo[] = [
  {
    id: 'first',
    name: '선착순',
    short: '먼저 신청한 6명',
    formula: '신청 시각이 빠른 순서. 같은 시각이면 추첨 순서.',
    benefit: '빨리 움직인 노력을 인정하고, 계산이 단순해 바로 설명할 수 있어요.',
    cost: '제시간에 신청할 수 없었던 사람은 처음부터 불리해요.',
  },
  {
    id: 'experience',
    name: '경험 우선',
    short: '경험 점수가 높은 6명',
    formula: '경험 점수 = 이전 참여 횟수 × 10 + 관심도. 같은 점수면 추첨 순서.',
    benefit: '부스를 아는 사람이 많아 진행이 매끄러워요.',
    cost: '처음 참여하는 사람은 점수를 얻을 기회 자체가 없었어요.',
  },
  {
    id: 'newcomer',
    name: '첫 참여 기회 우선',
    short: '처음 참여하는 사람부터',
    formula: '이전 참여 횟수가 0인 신청자를 신청 시각순으로 먼저, 남은 자리는 나머지를 신청 시각순으로.',
    benefit: '새로운 사람에게 기회가 열려요.',
    cost: '꾸준히 참여해 온 사람의 노력이 밀릴 수 있고, 진행을 도울 경험자가 적어요.',
  },
];

export const policyById = (id: PolicyId): PolicyInfo => POLICIES.find((p) => p.id === id)!;

export interface PackageInfo {
  id: PackageId;
  name: string;
  kind: '기존 규칙 유지' | '일부 보완' | '새로운 조합';
  criteria: string;
  explanation: string;
  appeal: string;
  /** 모형에서 계산한 설명 시간(분). 가상 수치임을 화면에 표시 */
  explanationMinutes: number;
  publishes: string[];
  remainingProblem: string;
  /** AI 배정기가 결과와 함께 출력하는 설명문(투명성 수준이 다르다) */
  aiPrintout: string;
}

export const PACKAGES: PackageInfo[] = [
  {
    id: 'keep',
    name: 'AI 추천 그대로',
    kind: '기존 규칙 유지',
    criteria: 'AI 배정기 기본 설정(신청 시각 순)을 그대로 둬요.',
    explanation: '결과만 알려 줘요. "선정" 또는 "미선정".',
    appeal: '이의 제기 없음.',
    explanationMinutes: 2,
    publishes: ['선정 여부'],
    remainingProblem: '왜 떨어졌는지 아무도 모른 채 끝나요.',
    aiPrintout: '선정 6명 / 미선정 6명. (기준·동점 처리는 공개하지 않음)',
  },
  {
    id: 'open',
    name: 'AI 추천 그대로 + 기준 공개',
    kind: '일부 보완',
    criteria: 'AI 배정기 기본 설정을 그대로 두되, 계산 과정을 모두 공개해요.',
    explanation: '어떤 기준으로 계산했는지, 동점은 어떻게 정했는지 모두에게 알려 줘요.',
    appeal: '하루 동안 질문·이의 제기 창구를 열어요.',
    explanationMinutes: 6,
    publishes: ['선정 여부', '계산 기준', '동점 처리 방식', '질문 창구'],
    remainingProblem: '설명은 늘었지만 자리는 하나도 바뀌지 않았어요.',
    aiPrintout: '선정 6명 / 미선정 6명. 기준: 신청 시각 순. 동점: 이 방의 추첨 순서(공개). 질문 창구: 1일.',
  },
  {
    id: 'access',
    name: '신청 기회 보정 + 첫 참여 2자리',
    kind: '일부 보완',
    criteria: '신청 창구를 온라인·종이 2개로 늘린 것으로 보고, 늦게 열린 사람의 시각을 보정해 신청 시각 순으로 4자리를 정해요. 나머지 2자리는 처음 참여하는 사람 중 추첨.',
    explanation: '계산 기준과 보정 이유를 알려 줘요. 개인 사정은 "신청 기회가 늦게 열림"으로만 표시해요.',
    appeal: '하루 동안 이의 제기 창구를 열어요.',
    explanationMinutes: 8,
    publishes: ['선정 여부', '계산 기준', '보정 적용 여부', '추첨 순서', '이의 제기 창구'],
    remainingProblem: '어떤 사정을 "보정"으로 인정할지 누가 정할까요?',
    aiPrintout: '선정 6명 / 미선정 6명. 기준: 보정한 신청 시각 순 4자리 + 첫 참여 추첨 2자리. 보정 적용: 신청 기회가 늦게 열린 신청자(사유 비공개). 추첨 순서 공개. 이의 제기: 1일.',
  },
  {
    id: 'mix',
    name: '첫 참여 3자리 + 경험자 3자리',
    kind: '새로운 조합',
    criteria: '보정한 신청 시각순으로 처음 참여하는 사람 3명, 경험 점수순으로 경험자 3명(진행 도우미 역할)을 뽑아요.',
    explanation: '두 트랙의 기준을 모두 알려 주되, 개인 사정은 본인에게만 설명해요.',
    appeal: '하루 동안 이의 제기 창구를 열고, 대기자에게 다음 기회를 안내해요.',
    explanationMinutes: 10,
    publishes: ['선정 여부', '두 트랙의 기준', '추첨 순서', '이의 제기 창구', '대기 순번'],
    remainingProblem: '설명과 이의 제기에 시간이 가장 많이 들어요. 축제 당일에 가능할까요?',
    aiPrintout: '선정 6명 / 미선정 6명. 트랙 A: 첫 참여, 보정한 신청 시각 순 3자리. 트랙 B: 경험 점수 순 3자리(진행 도우미). 추첨 순서 공개. 개인 사정은 본인에게만 설명. 이의 제기 1일 + 대기 순번 안내.',
  },
];

export const packageById = (id: PackageId): PackageInfo => PACKAGES.find((p) => p.id === id)!;

export interface ClueMeta {
  id: ClueId;
  title: string;
  question: string;
  image: string;
  alt: string;
}

export const CLUES: ClueMeta[] = [
  { id: 'access', title: '신청 기회의 차이', question: '모두가 같은 시간에 신청할 수 있었을까?', image: 'clue-access', alt: '같은 신청 부스로 향하지만 길이와 접근 조건이 다른 두 경로.' },
  { id: 'experience', title: '경험 점수의 의미', question: '경험 점수는 무엇을 세는 걸까?', image: 'clue-experience', alt: '활동 배지가 든 보관함과 비어 있는 같은 모양의 보관함.' },
  { id: 'rules', title: 'AI가 쓴 기준과 동점 처리', question: 'AI 배정기는 어떻게 계산했고 동점은 어떻게 정했을까?', image: 'clue-rules', alt: '내부 연결 구조가 보이는 투명한 배정 기계와 동점 추첨용 조각 주머니.' },
  { id: 'explanation', title: '떨어진 사람이 들은 말', question: '떨어진 사람은 무엇을 들었을까?', image: 'clue-explanation', alt: '판단 경로를 보여주는 투명 패널과 닫힌 개인 정보 봉투.' },
];

export const clueById = (id: ClueId): ClueMeta => CLUES.find((c) => c.id === id)!;

export interface PerspectiveInfo {
  id: PerspectiveId;
  name: string;
  image: string;
  alt: string;
  prompt: string;
  tags: { id: string; label: string }[];
}

export const PERSPECTIVES: PerspectiveInfo[] = [
  {
    id: 'applicant',
    name: '신청자',
    image: 'perspective-applicant',
    alt: '빈 신청 카드를 들고 생각하는 민트색 재킷의 학생.',
    prompt: '당신은 신청자예요. 결과를 받았을 때 가장 먼저 알고 싶은 것은?',
    tags: [
      { id: 'why', label: '내가 왜 안 됐는지 알고 싶다' },
      { id: 'fair_time', label: '먼저 신청한 사람이 되는 게 맞다' },
      { id: 'appeal', label: '다시 말할 기회가 있어야 한다' },
    ],
  },
  {
    id: 'newcomer',
    name: '처음 참가하는 사람',
    image: 'perspective-newcomer',
    alt: '지도를 펼치고 새로운 체험을 기대하는 크림색 상의의 학생.',
    prompt: '당신은 처음 참가하는 사람이에요. 지금 규칙에서 어떤 점이 걸리나요?',
    tags: [
      { id: 'no_chance', label: '경험 점수는 얻을 기회가 없었다' },
      { id: 'late_info', label: '신청 방법을 늦게 알았다' },
      { id: 'ok_wait', label: '이번엔 기다려도 괜찮다, 다음 기회가 있다면' },
    ],
  },
  {
    id: 'organizer',
    name: '축제 운영자',
    image: 'perspective-organizer',
    alt: '클립보드와 체험권을 들고 이야기를 듣는 살구색 카디건의 학생.',
    prompt: '당신은 운영자예요. 축제 당일 30분 안에 정해야 해요. 무엇이 가장 걱정되나요?',
    tags: [
      { id: 'time', label: '설명하고 이의 받을 시간이 부족하다' },
      { id: 'smooth', label: '경험자가 있어야 진행이 된다' },
      { id: 'trust', label: '기준을 숨기면 나중에 더 큰 불만이 생긴다' },
    ],
  },
  {
    id: 'guide',
    name: '안내·설명 담당자',
    image: 'perspective-guide',
    alt: '돋보기와 투명한 카드를 살펴보는 보라색 겉옷의 학생.',
    prompt: '당신은 결과를 설명하는 담당자예요. 어디까지 말해야 할까요?',
    tags: [
      { id: 'criteria', label: '계산 기준은 모두에게 공개해야 한다' },
      { id: 'private', label: '개인 사정은 본인에게만 말해야 한다' },
      { id: 'unsure', label: '아직 모르겠다, 판단 보류' },
    ],
  },
];

export const perspectiveById = (id: PerspectiveId): PerspectiveInfo => PERSPECTIVES.find((p) => p.id === id)!;

/** 결정 1·6: 사전·사후 판단 (한 번 탭) */
export const CHECK_QUESTION = 'AI 배정기가 자료대로 계산해서 6명을 뽑으면, 그 결과는 공정할까?';
export const CHECK_OPTIONS: { id: CheckChoice; label: string; desc: string }[] = [
  { id: 'yes', label: '공정하다', desc: '같은 자료, 같은 식으로 계산했으니까.' },
  { id: 'no', label: '공정하지 않을 수 있다', desc: '자료에 안 잡히는 사정이 있을 수 있으니까.' },
  { id: 'unsure', label: '아직 모르겠다', desc: '더 알아봐야 판단할 수 있을 것 같다.' },
];

/** 결정 2: AI 추천 처리 */
export const VERDICT_QUESTION = 'AI 배정기의 추천, 우리 위원회는 어떻게 할까?';
export const VERDICT_OPTIONS: { id: VerdictChoice; label: string; desc: string; consequence: string }[] = [
  { id: 'approve', label: '이대로 승인', desc: '지금 바로 6명을 발표한다.', consequence: '빠르지만, 확인하지 않은 채 결정하는 셈이에요.' },
  { id: 'investigate', label: '보류하고 조사', desc: '발표를 미루고 조사 토큰 2개로 확인한 뒤 결정한다.', consequence: '하루가 더 걸리고, 운영자가 기다려야 해요.' },
  { id: 'reject', label: '거부하고 규칙부터', desc: 'AI 추천을 쓰지 않고 규칙을 새로 정한다.', consequence: '지금은 거부할 근거가 없어요. 운영자가 이유를 물을 거예요.' },
];

export const QUESTION_CANDIDATES: { id: string; text: string }[] = [
  { id: 'q_criteria', text: '이 결정은 어떤 기준으로 계산했나요?' },
  { id: 'q_data', text: '그 기준에 쓰인 자료는 누가, 언제, 어떻게 모았나요?' },
  { id: 'q_start', text: '같은 기준이 누군가에게 처음부터 불리하지 않나요?' },
  { id: 'q_tie', text: '동점이거나 애매할 때는 어떻게 정하나요?' },
  { id: 'q_appeal', text: '결과에 동의하지 않으면 누구에게 어떻게 말할 수 있나요?' },
  { id: 'q_limits', text: '이 AI가 모르는 것, 틀릴 수 있는 것은 무엇인가요?' },
];

/** 결정 5: 다른 상황에 적용 — 먼저 물어볼 질문을 고르면 상위 2개가 공동 약속이 된다 */
export const TRANSFER_SCENARIO = {
  title: '다른 상황: 동아리 체험 자리',
  story:
    '과학 동아리가 체험 자리 8개에 신청자 20명을 받았어요. 동아리 앱의 AI가 "지난 학기 활동 출석률"과 "신청 순서"로 8명을 추천했어요. 동아리 담당 선생님이 우리 위원회에 물어요. "이대로 발표해도 될까요?"',
  question: '동아리 앱의 AI에게 우리 위원회가 가장 먼저 물어볼 질문은?',
};

/** 엔딩에서 체험을 공식 원칙 이름에 연결한다. official 은 공식 원문 요지, student 는 학생용 풀이. */
export const PRINCIPLES = [
  {
    id: 'fairness' as const,
    name: '공정성·포용성',
    official: 'AI의 개발·활용 과정에서 부당한 편향과 차별을 줄이고, 다양한 사람이 혜택과 기회에 접근하며 의사결정에 참여하도록 한다.',
    student: '같은 규칙이라도 출발선이 다르면 누군가는 처음부터 불리해질 수 있어요. 그 사람도 기회와 결정에 끼게 하는 것.',
  },
  {
    id: 'transparency' as const,
    name: '투명성',
    official: 'AI 사용 사실, 판단 기준, 한계와 위험을 이해하기 쉽게 알린다.',
    student: 'AI가 어떤 자료와 기준으로 정했는지, 무엇을 모르는지, 떨어진 사람이 이유를 들을 수 있는지.',
  },
];

export interface PhaseMeta {
  id: Phase;
  title: string;
  minuteMark: string;
  /** 학생 화면 상단 "할 일" 한 줄. 활동이 없으면 보기만 한다고 적는다 */
  task: string;
  activity: boolean;
  defaultSeconds: number | null;
  scene: 'intro' | 'ai' | 'verdict' | 'investigation' | 'redesign' | 'ending' | 'none';
  /** 교사용 진행 도식에서 보이는 결정 번호 */
  decisionNo?: number;
}

export const PHASE_META: PhaseMeta[] = [
  { id: 'lobby', title: '입장 대기', minuteMark: '0~3분', task: '선생님이 시작할 때까지 기다려요.', activity: false, defaultSeconds: null, scene: 'intro' },
  { id: 'intro', title: '축제의 빈자리', minuteMark: '3~7분', task: '이야기와 신청자 12명, AI 배정기를 함께 읽어요. 누를 것은 없어요.', activity: false, defaultSeconds: null, scene: 'intro' },
  { id: 'pre_check', title: '결정 1 · 지금 내 생각', minuteMark: '7~8분', task: '세 가지 중 하나를 고르고 제출하기를 누르세요. (1개 선택)', activity: true, defaultSeconds: 60, scene: 'ai', decisionNo: 1 },
  { id: 'ai_verdict', title: '결정 2 · AI 추천을 어떻게 할까', minuteMark: '8~13분', task: 'AI 배정기의 추천을 읽고, 승인·보류·거부 중 하나를 골라 제출하세요. (1개 선택)', activity: true, defaultSeconds: 150, scene: 'ai', decisionNo: 2 },
  { id: 'verdict_result', title: '우리 결정의 결과', minuteMark: '13~16분', task: '우리 반의 결정으로 무슨 일이 생겼는지 봐요. 누를 것은 없어요.', activity: false, defaultSeconds: null, scene: 'verdict' },
  { id: 'investigate', title: '결정 3 · 무엇부터 조사할까', minuteMark: '16~22분', task: '조사 토큰 수만큼 카드를 고르고, 내 관점 카드의 한마디를 하나 고른 뒤 제출하세요.', activity: true, defaultSeconds: 180, scene: 'investigation', decisionNo: 3 },
  { id: 'investigate_reveal', title: '단서 공개', minuteMark: '22~27분', task: '열린 단서와 떨어진 사람의 말, 관점 보드를 함께 봐요. 누를 것은 없어요.', activity: false, defaultSeconds: null, scene: 'investigation' },
  { id: 'redesign', title: '결정 4 · 규칙을 어떻게 바꿀까', minuteMark: '27~32분', task: '네 가지 묶음 중 하나를 골라 제출하세요. (1개 선택)', activity: true, defaultSeconds: 150, scene: 'redesign', decisionNo: 4 },
  { id: 'redesign_result', title: 'AI 배정기 다시 돌리기', minuteMark: '32~36분', task: '새 규칙으로 다시 계산한 결과와 AI의 설명문을 봐요. 누를 것은 없어요.', activity: false, defaultSeconds: null, scene: 'redesign' },
  { id: 'transfer', title: '결정 5 · 다른 AI에게 먼저 물어볼 것', minuteMark: '36~40분', task: '새 상황을 읽고, 먼저 물어볼 질문 하나를 골라 제출하세요. 많이 고른 2개가 우리 반의 약속이 돼요.', activity: true, defaultSeconds: 90, scene: 'redesign', decisionNo: 5 },
  { id: 'post_check', title: '결정 6 · 다시, 내 생각', minuteMark: '40~43분', task: '처음 질문에 다시 답하고 제출하세요. 이유는 적어도 되고 안 적어도 돼요.', activity: true, defaultSeconds: 120, scene: 'ending', decisionNo: 6 },
  { id: 'ending', title: '우리의 기준은 이렇게 달라졌다', minuteMark: '43~45분', task: '우리 반이 바꾼 것과 남긴 질문을 함께 봐요.', activity: false, defaultSeconds: null, scene: 'ending' },
  { id: 'closed', title: '수업 종료', minuteMark: '', task: '수고했어요. 방은 곧 정리돼요.', activity: false, defaultSeconds: null, scene: 'ending' },
];

export const phaseMeta = (p: Phase): PhaseMeta => PHASE_META.find((m) => m.id === p)!;
export const phaseIndex = (p: Phase): number => PHASE_META.findIndex((m) => m.id === p);
/** 학생에게 보이는 장면 수(대기·종료 제외) */
export const SCENE_COUNT = PHASE_META.length - 2;

/** 단계별 제출 payload 종류 */
export const PHASE_KIND: Partial<Record<Phase, string>> = {
  pre_check: 'precheck',
  ai_verdict: 'verdict',
  investigate: 'investigate',
  redesign: 'package',
  transfer: 'transfer',
  post_check: 'postcheck',
};

/** 가명 생성 재료 — 평가적 의미가 없는 중립 단어 */
export const PSEUDONYM_ADJ = ['차분한', '호기심 많은', '느긋한', '성실한', '엉뚱한', '다정한', '씩씩한', '조용한', '명랑한', '꼼꼼한', '유쾌한', '상냥한', '든든한', '재빠른', '푸른', '노란'];
export const PSEUDONYM_NOUN = ['수달', '고래', '펭귄', '여우', '부엉이', '거북이', '다람쥐', '돌고래', '토끼', '고슴도치', '해달', '두루미', '알파카', '판다', '참새', '물범'];
export const AVATAR_EMOJI = ['🦦', '🐋', '🐧', '🦊', '🦉', '🐢', '🐿️', '🐬', '🐰', '🦔', '🦭', '🕊️', '🦙', '🐼', '🐦', '🦭'];

export const ANONYMITY_NOTICE = [
  '본명·학번·이메일·학교·전화번호는 입력받지 않아요. 서버가 임의 가명을 만들어 줘요.',
  '가명은 내 접속을 구분하는 용도예요. 가명과 답변을 묶어 공동 화면에 보여 주지 않아요.',
  '개인 선택과 짧은 이유는 선생님이 즉시 삭제할 수 있고, 늦어도 24시간 뒤 자동 삭제돼요.',
  '"완전한 익명"을 약속하지는 않아요. 접속을 유지하기 위한 세션 식별자와 서비스 운영에 필요한 기술 정보(접속 시각 등)는 남을 수 있어요.',
];
