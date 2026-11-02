# AI_USAGE — 생성형 AI 활용 내역

공모전 "생성형 AI 활용 범위 설명"용 기록. 아래 내용은 실제 제작 과정에서 확인된 사실만 적었다.

## 1. 이미지 18장

| 항목 | 내용 |
|---|---|
| 제작 도구 | **OpenAI built-in imagegen** (채팅 내 이미지 생성 도구). Google Imagen 으로 생성하지 않았다. |
| 모델 식별자 | 도구가 모델 이름을 노출하지 않음 (`assets/ASSET_MANIFEST.json` 의 `model` 필드 그대로) |
| 제작일 | 2026-11-01 |
| 프롬프트 | 자산별 실제 프롬프트 전문은 `assets/ASSET_MANIFEST.json` 에 보존. 공통 지시: 텍스트·로고·UI 없음, 가상의 한국 중학생, 특정 성별·외모에 유리/불리한 역할 고정 금지, 간판·카드는 모두 빈칸. |
| 참조 이미지 | 인트로 키아트 확정 후 나머지 자산은 같은 인물 묘사·팔레트 문장을 반복해 생성(일부는 참조 입력 사용, 매니페스트 `reference` 필드 참고) |
| 후편집 | 생성 원본 PNG 에 크롭·색 보정·합성 없음. 앱용으로는 `scripts/optimize-images.mjs` 가 **크기 축소 + WebP 변환만** 수행(원본 `assets/images/*.png` 보존, 결과 `public/images/festival/*.webp`, 대응표 `public/images/festival/manifest.json`). |
| 사람 검수 | 생성 후 시각 확인, 크기·알파 채널 확인(`assets/IMAGE_CHECKS.json`). 배지 3장은 실제 알파 채널 PNG. |
| 사용 원칙 | 제목·안내·버튼·수치·학급 결정은 이미지에 굽지 않고 HTML/CSS 로 올린다. 그림 속 티켓·인원·연결선 수를 게임 데이터로 읽지 않는다. 엔딩 결과는 생성 이미지에 미리 그리지 않고 빈 게시판 위에 실시간 데이터로 표시한다. |
| 초기 기획 문서 | `claude-prompts/02_IMAGEN_PROMPTS.txt` 는 최초 기획의 보관 문서이며 실제 제작 지시가 아니다. |

## 1-1. 개편 후 추가 이미지 18장 (2026-11-02)

| 항목 | 내용 |
|---|---|
| 제작 도구 | OpenAI built-in imagegen (기존 키아트를 참조 이미지로 사용) |
| 구성 | 장면 3장(ai-kiosk, appeal-morning, announcement-board), 모바일 세로 1장(ai-kiosk-mobile), 투명 PNG 원칙 배지 2장(principle-fairness, principle-transparency), 신청자 초상 12장(applicant-a01~a12) |
| 프롬프트 | 요청서 `docs/IMAGE_REQUESTS.md` 의 문장을 그대로 사용. 실제 입력 전문은 `assets/additional-2026-11-02/ASSET_MANIFEST.json` |
| 후편집 | 없음. 앱용은 크기 축소 + WebP 변환만 (`npm run images`) |
| 사용 원칙 | 초상은 가상의 인물이며 이름·자료는 HTML 로 표시. 배지는 alt="" 로 두고 원칙 이름을 텍스트로 병기 |

## 2. 음향 10개

| 항목 | 내용 |
|---|---|
| 제작 도구 | ElevenLabs — 배경음악은 **Eleven Music**, 효과음은 **Sound Effects** (프롬프트: `claude-prompts/03_ELEVENLABS_PROMPTS.txt`) |
| 제작일 | 2026-11-01 (제공 파일의 수정 시각 기준) |
| 받은 파일 | `bgm-lobby.mp3`, `bgm-investigation.mp3`, `bgm-redesign.mp3` (각 약 60초, 192kbps, 44.1kHz) / `sfx-select.wav`(0.49s), `sfx-submit.wav`(0.81s), `sfx-clue.wav`(1.48s), `sfx-transition.wav`(1.00s), `sfx-reveal.wav`(2.00s), `sfx-time.wav`(1.00s), `sfx-ending.wav`(3.00s) (모두 48kHz 16bit 스테레오) |
| 받지 못한 파일 | `bgm-reflection.mp3`(엔딩·성찰용). 엔딩 장면은 BGM 없이 `sfx-ending.wav` 만 재생한다. 파일이 준비되면 `public/audio/` 에 넣고 `src/client/lib/audio.ts` 의 BGM 표에 추가하면 된다. |
| 후편집 | 파일명 정규화(`*.mp3.mp3` → `*.mp3`) 외 편집 없음. 루프 경계 클릭을 줄이기 위해 재생 시 끝 20ms 를 잘라 루프하고, 시작 1.2초 페이드인·볼륨 변경 시 램프를 적용(코드 처리). 실제 루프 경계 청취 검사는 TEST_REPORT.md 의 미검증 항목 참고. |
| 사용 원칙 | 교사 화면 또는 공개 화면 중 **하나만** 음향 출력 화면. 학생 기기는 항상 무음. 투표 제출음은 정답/오답을 암시하지 않는 중립음이며 선택지별로 다른 소리를 붙이지 않는다. 음원이 없거나 재생이 차단돼도 모든 진행이 가능하다. |

## 3. 코드·문서

| 항목 | 내용 |
|---|---|
| 도구 | Anthropic Claude Code (Claude Fable 5.1), 2026-11-02 |
| 범위 | 요구 프롬프트(`claude-prompts/01_CLAUDE_CODE_PROMPT.txt`)에 따른 설계·구현·테스트·문서 초안 전체. 공식 문서(Cloudflare Durable Objects WebSocket Hibernation, Workers Builds, Vite plugin)를 확인해 구현. |
| 사람의 역할 | 요구사항·수업 설계 의도·자산 제공, 결과 검토. 실제 학급 적용과 최종 문구 확정은 교사가 한다. |
| AI 가 만들지 않은 것 | 실제 배포 주소, 실제 학급 수업 성과, Cloudflare·GitHub 계정 연결. 이들은 문서에 "미검증/대기"로 표기했다. |

## 4. 앱 안의 "AI"

앱에 외부 생성형 AI API 는 쓰지 않는다. "AI 추천"은 `src/shared/engine.ts` 의 공개된 계산식(선착순 / 경험 점수 = 이전 참여 횟수×10 + 관심도 / 첫 참여 우선)과 세션별 고정 추첨 순서로만 계산되는 **교육용 시뮬레이터**다. 첫 화면·도움말·엔딩·교사 자료에서 이를 명시하고, 실제 AI 는 더 복잡할 수 있음을 안내한다.
