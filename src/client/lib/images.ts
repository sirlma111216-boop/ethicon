// 최적화된 WebP 자산 경로. 원본 PNG 는 assets/images 에 보존되며 배포에는 포함하지 않는다.
export type ImageId =
  | 'intro-desktop'
  | 'intro-mobile'
  | 'ending-desktop'
  | 'ending-mobile'
  | 'scene-allocation'
  | 'scene-investigation'
  | 'scene-redesign'
  | 'perspective-applicant'
  | 'perspective-newcomer'
  | 'perspective-organizer'
  | 'perspective-guide'
  | 'clue-access'
  | 'clue-experience'
  | 'clue-rules'
  | 'clue-explanation'
  | 'badge-perspective'
  | 'badge-evidence'
  | 'badge-revision';

const WIDTHS: Record<ImageId, number[]> = {
  'intro-desktop': [1672, 1280],
  'ending-desktop': [1672, 1280],
  'scene-allocation': [1672, 1280],
  'scene-investigation': [1672, 1280],
  'scene-redesign': [1672, 1280],
  'intro-mobile': [941, 720],
  'ending-mobile': [941, 720],
  'perspective-applicant': [640, 320],
  'perspective-newcomer': [640, 320],
  'perspective-organizer': [640, 320],
  'perspective-guide': [640, 320],
  'clue-access': [960, 640],
  'clue-experience': [960, 640],
  'clue-rules': [960, 640],
  'clue-explanation': [960, 640],
  'badge-perspective': [320, 160],
  'badge-evidence': [320, 160],
  'badge-revision': [320, 160],
};

export const ALT: Record<ImageId, string> = {
  'intro-desktop': '학교 축제의 체험권과 자료를 살펴보며 함께 이야기하는 네 학생.',
  'intro-mobile': '축제 조명 아래 공동 계획을 세우는 네 학생과 체험권 상자.',
  'ending-desktop': '축제 공간의 큰 빈 게시판 옆에서 함께 토의하는 학생들.',
  'ending-mobile': '커다란 빈 게시판 아래 모여 활동을 마무리하는 학생들.',
  'scene-allocation': '체험권 발급 기계 앞에서 신청자들의 자료와 결과를 함께 살펴보는 학생들.',
  'scene-investigation': '서로 다른 이동 경로와 기계의 내부 구조를 비교하며 단서를 찾는 학생들.',
  'scene-redesign': '연결된 규칙 조각을 옮기며 체험권 배정 방식을 함께 고치는 학생들.',
  'perspective-applicant': '빈 신청 카드를 들고 생각하는 민트색 재킷의 학생.',
  'perspective-newcomer': '지도를 펼치고 새로운 체험을 기대하는 크림색 상의의 학생.',
  'perspective-organizer': '클립보드와 체험권을 들고 이야기를 듣는 살구색 카디건의 학생.',
  'perspective-guide': '돋보기와 투명한 카드를 살펴보는 보라색 겉옷의 학생.',
  'clue-access': '같은 신청 부스로 향하지만 길이와 접근 조건이 다른 두 경로.',
  'clue-experience': '활동 배지가 든 보관함과 비어 있는 같은 모양의 보관함.',
  'clue-rules': '내부 연결 구조가 보이는 투명한 배정 기계와 동점 추첨용 조각 주머니.',
  'clue-explanation': '판단 경로를 보여주는 투명 패널과 닫힌 개인 정보 봉투.',
  'badge-perspective': '같은 크기의 세 렌즈가 겹친 관점 발견 배지.',
  'badge-evidence': '자료 폴더와 돋보기로 표현한 근거 확인 배지.',
  'badge-revision': '서로 맞물린 조각으로 표현한 규칙 수정 배지.',
};

export const imgSrc = (id: ImageId, width?: number) => `/images/festival/${id}-${width ?? WIDTHS[id][0]}.webp`;
export const imgSrcSet = (id: ImageId) => WIDTHS[id].map((w) => `${imgSrc(id, w)} ${w}w`).join(', ');

const preloaded = new Set<string>();
/** 다음 장면 자산 미리 읽기 */
export function preload(ids: ImageId[]) {
  for (const id of ids) {
    const src = imgSrc(id);
    if (preloaded.has(src)) continue;
    preloaded.add(src);
    const img = new Image();
    img.src = src;
  }
}
