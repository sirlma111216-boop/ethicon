// 공개 콘텐츠: 학생·공개 화면에서 언제든 보여도 되는 내용만 둔다.
// 미공개 단서·인물 반응·교사 메모는 src/worker/secretContent.ts 에 있다.
import type { ClueId, PackageId, PerspectiveId, Phase, PolicyId, SurveyChoice } from './types';

export const CAPACITY = 6;
export const MAX_STUDENTS = 40;
export const FREE_TEXT_MAX = 80;

export const APP_TITLE = '축제의 빈자리';
export const APP_SUBTITLE = '우리 반이 바꾸는 AI의 선택';
export const SIMULATION_NOTICE = '실제 사람을 평가하지 않는 가상 AI 배정 실험입니다. 신청자와 자료는 모두 지어낸 것입니다.';

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

export interface PolicyInfo {
  id: PolicyId;
  name: string;
  short: string;
  formula: string;
  benefit: string;
  cost: string;
}

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
}

export const PACKAGES: PackageInfo[] = [
  {
    id: 'keep',
    name: '지금 규칙 그대로',
    kind: '기존 규칙 유지',
    criteria: '1라운드에서 고른 규칙을 그대로 적용해요.',
    explanation: '결과만 알려 줘요. "선정" 또는 "미선정".',
    appeal: '이의 제기 없음.',
    explanationMinutes: 2,
    publishes: ['선정 여부'],
    remainingProblem: '왜 떨어졌는지 아무도 모른 채 끝나요.',
  },
  {
    id: 'open',
    name: '같은 규칙 + 기준 공개',
    kind: '일부 보완',
    criteria: '1라운드 규칙을 그대로 적용해요.',
    explanation: '어떤 기준으로 계산했는지, 동점은 어떻게 정했는지 모두에게 알려 줘요.',
    appeal: '하루 동안 질문·이의 제기 창구를 열어요.',
    explanationMinutes: 6,
    publishes: ['선정 여부', '계산 기준', '동점 처리 방식', '질문 창구'],
    remainingProblem: '설명은 늘었지만 자리는 하나도 바뀌지 않았어요.',
  },
  {
    id: 'access',
    name: '같은 규칙 + 신청 기회 보정 + 첫 참여 2자리',
    kind: '일부 보완',
    criteria:
      '신청 창구를 온라인과 종이 2개로 늘린 것으로 보고, 늦게 열린 사람의 시각을 보정해 1라운드 규칙으로 4자리를 정해요. 나머지 2자리는 처음 참여하는 사람 중 추첨.',
    explanation: '계산 기준과 보정 이유를 알려 줘요. 개인 사정은 "신청 기회가 늦게 열림"으로만 표시해요.',
    appeal: '하루 동안 이의 제기 창구를 열어요.',
    explanationMinutes: 8,
    publishes: ['선정 여부', '계산 기준', '보정 적용 여부', '추첨 순서', '이의 제기 창구'],
    remainingProblem: '어떤 사정을 "보정"으로 인정할지 누가 정할까요?',
  },
  {
    id: 'mix',
    name: '첫 참여 3자리 + 경험자 3자리',
    kind: '새로운 조합',
    criteria:
      '보정한 신청 시각순으로 처음 참여하는 사람 3명, 경험 점수순으로 경험자 3명(진행 도우미 역할)을 뽑아요.',
    explanation: '두 트랙의 기준을 모두 알려 주되, 개인 사정은 본인에게만 설명해요.',
    appeal: '하루 동안 이의 제기 창구를 열고, 대기자에게 다음 기회를 안내해요.',
    explanationMinutes: 10,
    publishes: ['선정 여부', '두 트랙의 기준', '추첨 순서', '이의 제기 창구', '대기 순번'],
    remainingProblem: '설명과 이의 제기에 시간이 가장 많이 들어요. 축제 당일에 가능할까요?',
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
  {
    id: 'access',
    title: '신청 기회의 차이',
    question: '모두가 같은 시간에 신청할 수 있었을까?',
    image: 'clue-access',
    alt: '같은 신청 부스로 향하지만 길이와 접근 조건이 다른 두 경로.',
  },
  {
    id: 'experience',
    title: '경험 점수의 의미',
    question: '경험 점수는 무엇을 세는 걸까?',
    image: 'clue-experience',
    alt: '활동 배지가 든 보관함과 비어 있는 같은 모양의 보관함.',
  },
  {
    id: 'rules',
    title: '추천 기준과 동점 처리',
    question: 'AI 추천은 어떻게 계산됐고 동점은 어떻게 정했을까?',
    image: 'clue-rules',
    alt: '내부 연결 구조가 보이는 투명한 배정 기계와 동점 추첨용 조각 주머니.',
  },
  {
    id: 'explanation',
    title: '결과를 전달하는 설명 방식',
    question: '떨어진 사람은 무엇을 들었을까?',
    image: 'clue-explanation',
    alt: '판단 경로를 보여주는 투명 패널과 닫힌 개인 정보 봉투.',
  },
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
    prompt: '당신은 신청자예요. 결과를 받았을 때 가장 먼저 알고 싶은 것은 무엇인가요?',
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

export const SURVEY_QUESTION = '모두에게 같은 규칙을 적용하면 늘 공정할까?';
export const SURVEY_OPTIONS: { id: SurveyChoice; label: string }[] = [
  { id: 'always', label: '늘 공정하다. 규칙이 같으면 된다.' },
  { id: 'mostly', label: '대체로 공정하지만 예외가 있을 것 같다.' },
  { id: 'depends', label: '출발 조건이 다르면 같은 규칙도 불공정할 수 있다.' },
  { id: 'unsure', label: '아직 모르겠다.' },
];

export const PRACTICE_QUESTION = '연습: 축제에서 제일 먼저 가 보고 싶은 곳은?';
export const PRACTICE_OPTIONS = [
  { id: 'booth', label: '체험 부스' },
  { id: 'food', label: '먹거리 장터' },
  { id: 'stage', label: '공연 무대' },
  { id: 'unsure', label: '아직 모르겠다' },
];

export const INFO_QUESTION = '배정 결과를 보고 나니, 추가로 알아야 할 정보는 무엇인가요?';

export const QUESTION_CANDIDATES: { id: string; text: string }[] = [
  { id: 'q_criteria', text: '이 결정은 어떤 기준으로 계산했나요?' },
  { id: 'q_data', text: '그 기준에 쓰인 자료는 누가, 언제, 어떻게 모았나요?' },
  { id: 'q_start', text: '같은 기준이 누군가에게 처음부터 불리하지 않나요?' },
  { id: 'q_tie', text: '동점이거나 애매할 때는 어떻게 정하나요?' },
  { id: 'q_appeal', text: '결과에 동의하지 않으면 누구에게 어떻게 말할 수 있나요?' },
  { id: 'q_limits', text: '이 AI가 모르는 것, 틀릴 수 있는 것은 무엇인가요?' },
];

export const TRANSFER_SCENARIO = {
  title: '다른 상황: 동아리 체험 자리',
  story:
    '과학 동아리가 체험 자리 8개에 신청자 20명을 받았어요. 동아리 앱이 "지난 학기 활동 출석률"과 "신청 순서"로 8명을 추천했어요. 담당 선생님이 우리 위원회에 물어요. "이대로 발표해도 될까요?"',
  question: '우리가 가장 먼저 확인할 것은?',
  options: [
    { id: 't_attendance', label: '출석률을 못 채운 사람에게 그럴 수밖에 없던 사정이 있었는지' },
    { id: 't_rule', label: '출석률과 신청 순서를 어떤 비율로 섞었는지' },
    { id: 't_explain', label: '떨어진 12명에게 무엇을 어떻게 설명할 건지' },
    { id: 't_appeal', label: '결과에 이의를 말할 창구가 있는지' },
    { id: 'abstain', label: '아직 모르겠다 / 판단 보류' },
  ],
};

export interface PhaseMeta {
  id: Phase;
  title: string;
  minuteMark: string;
  studentHint: string;
  /** 제출 활동이 있는 단계인지 */
  activity: boolean;
  defaultSeconds: number | null;
  scene: 'intro' | 'allocation' | 'investigation' | 'redesign' | 'ending' | 'none';
}

export const PHASE_META: PhaseMeta[] = [
  { id: 'lobby', title: '입장 대기', minuteMark: '0~3분', studentHint: '선생님이 시작할 때까지 기다려요.', activity: false, defaultSeconds: null, scene: 'intro' },
  { id: 'intro', title: '축제의 빈자리', minuteMark: '3~5분', studentHint: '이야기를 함께 읽어요.', activity: false, defaultSeconds: null, scene: 'intro' },
  { id: 'practice', title: '연습 선택', minuteMark: '5~6분', studentHint: '제출·대기·공개를 연습해요.', activity: true, defaultSeconds: 60, scene: 'intro' },
  { id: 'pre_survey', title: '사전 판단', minuteMark: '6~7분', studentHint: '지금 생각을 솔직하게 기록해요. 정답은 없어요.', activity: true, defaultSeconds: 120, scene: 'intro' },
  { id: 'r1_vote', title: '라운드 1 · 첫 배정 규칙 정하기', minuteMark: '7~10분', studentHint: '세 규칙 중 하나를 비밀 투표해요.', activity: true, defaultSeconds: 120, scene: 'allocation' },
  { id: 'r1_result', title: '라운드 1 · 배정 결과', minuteMark: '10~13분', studentHint: '누가 들어오고 누가 남았는지 살펴봐요.', activity: false, defaultSeconds: null, scene: 'allocation' },
  { id: 'r1_info', title: '라운드 1 · 더 알아야 할 정보', minuteMark: '13~15분', studentHint: '결과를 보고 나니 무엇이 궁금한가요?', activity: true, defaultSeconds: 60, scene: 'allocation' },
  { id: 'r2_choose', title: '라운드 2 · 조사 카드 고르기', minuteMark: '15~20분', studentHint: '관점 카드로 생각하며 조사 카드 2장을 골라요.', activity: true, defaultSeconds: 180, scene: 'investigation' },
  { id: 'r2_reveal', title: '라운드 2 · 단서 공개', minuteMark: '20~25분', studentHint: '학급이 고른 단서와 관점 보드를 살펴봐요.', activity: false, defaultSeconds: null, scene: 'investigation' },
  { id: 'r3_vote', title: '라운드 3 · 규칙 다시 설계', minuteMark: '25~30분', studentHint: '완결된 패키지 중 하나를 골라요.', activity: true, defaultSeconds: 150, scene: 'redesign' },
  { id: 'r3_result', title: '라운드 3 · 이전과 이후', minuteMark: '30~35분', studentHint: '바뀐 규칙이 같은 신청자들에게 어떤 결과를 내는지 비교해요.', activity: false, defaultSeconds: null, scene: 'redesign' },
  { id: 'r4_questions', title: '공동 약속 · 먼저 물어볼 질문', minuteMark: '35~38분', studentHint: 'AI 결정을 받으면 먼저 물어볼 질문 2개를 골라요.', activity: true, defaultSeconds: 90, scene: 'redesign' },
  { id: 'r4_transfer', title: '다른 상황에 적용하기', minuteMark: '38~40분', studentHint: '새 상황에서 가장 먼저 확인할 것을 골라요.', activity: true, defaultSeconds: 90, scene: 'redesign' },
  { id: 'r5_post', title: '개인 성찰', minuteMark: '40~43분', studentHint: '처음 질문에 다시 답하고 이유를 한 문장으로 적어요.', activity: true, defaultSeconds: 150, scene: 'ending' },
  { id: 'ending', title: '우리의 기준은 이렇게 달라졌다', minuteMark: '43~45분', studentHint: '학급의 결정과 질문을 함께 봐요.', activity: false, defaultSeconds: null, scene: 'ending' },
  { id: 'closed', title: '수업 종료', minuteMark: '', studentHint: '수고했어요. 방은 곧 정리돼요.', activity: false, defaultSeconds: null, scene: 'ending' },
];

export const phaseMeta = (p: Phase): PhaseMeta => PHASE_META.find((m) => m.id === p)!;
export const phaseIndex = (p: Phase): number => PHASE_META.findIndex((m) => m.id === p);

/** 단계별 제출 payload 종류 */
export const PHASE_KIND: Partial<Record<Phase, string>> = {
  practice: 'practice',
  pre_survey: 'survey',
  r1_vote: 'policy',
  r1_info: 'info',
  r2_choose: 'investigate',
  r3_vote: 'package',
  r4_questions: 'questions',
  r4_transfer: 'transfer',
  r5_post: 'post',
};

/** 가명 생성 재료 — 평가적 의미가 없는 중립 단어 */
export const PSEUDONYM_ADJ = ['차분한', '호기심 많은', '느긋한', '성실한', '엉뚱한', '다정한', '씩씩한', '조용한', '명랑한', '꼼꼼한', '유쾌한', '상냥한', '든든한', '재빠른', '푸른', '노란'];
export const PSEUDONYM_NOUN = ['수달', '고래', '펭귄', '여우', '부엉이', '거북이', '다람쥐', '돌고래', '토끼', '고슴도치', '해달', '두루미', '알파카', '판다', '참새', '물범'];
export const AVATAR_EMOJI = ['🦦', '🐋', '🐧', '🦊', '🦉', '🐢', '🐿️', '🐬', '🐰', '🦔', '🦭', '🕊️', '🦙', '🐼', '🐦', '🦭'];

export const ANONYMITY_NOTICE = [
  '본명·학번·이메일·학교·전화번호는 입력받지 않아요. 서버가 임의 가명을 만들어 줘요.',
  '가명은 내 접속을 구분하는 용도예요. 가명과 답변을 묶어 공동 화면에 보여 주지 않아요.',
  '개인 투표와 짧은 이유는 선생님이 즉시 삭제할 수 있고, 늦어도 24시간 뒤 자동 삭제돼요.',
  '"완전한 익명"을 약속하지는 않아요. 접속을 유지하기 위한 세션 식별자와 서비스 운영에 필요한 기술 정보(접속 시각 등)는 남을 수 있어요.',
];
