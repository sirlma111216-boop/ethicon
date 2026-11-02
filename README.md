# 축제의 빈자리: AI 배정위원회

중학생 24~36명(최대 40명)이 교사 1명의 진행으로 45분 동안 함께 플레이하는 **실시간 협력 웹앱**입니다.
가상의 축제 운영팀이 올해 처음 들인 **AI 배정기**가 신청자 12명 중 6명을 추천했습니다. 학급 전체가 그 추천을 심사하는 **배정위원회**가 되어 여섯 번 결정합니다. 결정에 따라 다음 장면이 달라집니다.

> **실제 사람을 평가하지 않는 가상 AI 배정 실험입니다.** 신청자와 자료는 모두 지어낸 것이며, 여기서 "AI 배정기"는 정해진 식을 계산하는 교육용 시뮬레이터입니다(학습된 모델이 아님).

- 학습 원칙: **공정성·포용성**, **투명성** (2026 인공지능 윤리교육 콘텐츠 공모전 ③ 디지털 콘텐츠)
- 대상: 중학교 1~3학년 / 45분 1차시 (느린 학급용 35분 단축안은 TEACHER_GUIDE.md)

## 화면

| 경로 | 역할 | 설명 |
|---|---|---|
| `/` | 공통 | 인트로 키아트, 학생 입장 / 교사 시작 |
| `/teacher` → `/teacher/:code` | 교사 | 방 만들기, 코드·QR, **학생 화면 미리보기(할 일 띠 포함)**, 진행 제어(다음·이전·마감·공개·연장·일시정지·재투표·교사 결정), 자유 응답 승인, 발문·오개념 메모, 연습용 봇, 내보내기, 삭제 |
| `/join/:code` → `/play/:code` | 학생 | 코드 입장(가명 자동 발급), 맨 위 "할 일" 한 줄, 결정 1~6 활동, 제출 확인, 재연결 복구 |
| `/board/:code?t=<읽기전용 토큰>` | 공개 화면 | 프로젝터용 큰 글씨, 할 일 띠, AI 출력문, 공동 결과, 승인된 익명 의견. 교사 메모·대기열·개인 응답 없음 |
| `/help` | 공통 | 도움말·개인정보 안내 |

## 45분 흐름 (13장면 · 결정 6번)

입장(0~3) → 이야기·신청자 12명·AI 배정기 소개(3~7) → **결정 1** 자료대로 계산하면 공정할까(7~8) → **결정 2** AI 추천을 승인/보류/거부(8~13) → **우리 결정의 결과**: 승인이면 이의 제기 편지 3통과 조사 토큰 1개, 보류·거부면 토큰 2개(13~16) → **결정 3** 조사 카드 토큰 수만큼 + 관점의 한마디(16~22) → 단서 공개 "AI 배정기가 몰랐던 것"(22~27) → **결정 4** 새 설정 묶음 4개 중 하나(27~32) → AI 배정기 다시 돌리기: 이전/이후·AI 설명문·유리/불리·남은 문제(32~36) → **결정 5** 다른 AI에게 먼저 물어볼 질문 → 상위 2개가 약속(36~40) → **결정 6** 다시, 내 생각(40~43) → 엔딩: 첫 결정·새 설정·약속·남은 질문과 **두 원칙 카드**(43~45)

학급의 실제 선택이 결과를 바꿉니다: 결정 2는 조사 토큰 수와 분기 장면을, 결정 4는 같은 12명의 재계산 결과(새로 선발/제외된 사람, 설명 시간, 이의 제기)를 바꿉니다. "기준 공개" 묶음을 고르면 설명은 늘지만 자리는 바뀌지 않는 것도 직접 봅니다. 자세한 데이터와 계산식은 [CONTENT_MAP.md](CONTENT_MAP.md).

## 기술 구성

- **클라이언트**: React 19 + TypeScript + Vite 8 (`src/client`)
- **서버**: Cloudflare Workers (`src/worker/index.ts`) + Durable Objects (`RoomDO`: 방 1개 = DO 1개, SQLite 저장소, WebSocket Hibernation API; `LimiterDO`: 속도 제한)
- **공유 모듈**: 타입·프로토콜(`src/shared/types.ts`), 공개 콘텐츠(`src/shared/content.ts`), 순수 계산 엔진(`src/shared/engine.ts`)
- **서버 전용 콘텐츠**: 미공개 단서·인물 반응·보정표·분기 장면·교사 메모(`src/worker/secretContent.ts`) — 공용 번들에 포함되지 않음
- 서버가 방 상태의 유일한 기준(`phase`, `roundId`, `revision`, `flowRevision`, `endsAt`, `pausedRemainingMs`, `decisions.tokens`). 역할·라운드·스키마·토큰 수·방 인원을 서버에서 검증하고, 클라이언트 role 필드를 믿지 않음
- 토큰은 URL 이 아닌 WebSocket 첫 메시지로 전달. 교사 토큰은 해시로만 저장
- 개인 응답·자유 응답: 교사 즉시 삭제, 생성 후 최대 24시간 자동 삭제(DO 알람)

## 시작하기

```bash
npm install
```
```bash
npm run dev
```
교사: http://localhost:5173/teacher → 방 만들기 → 공개 화면 "새 창으로 열기" → 학생은 시크릿 창에서 http://localhost:5173/join/코드

## 혼자 미리 돌려보기

교사 화면의 **연습용 봇 학생** 패널에서 봇 10명 또는 25명을 추가하면, 봇이 결정 1~6마다 몇 초에 걸쳐 그럴듯한 답(이유 포함)을 제출해 교사 혼자 13장면 전체를 리허설할 수 있습니다. 봇끼리 동률이 나면 재투표·교사 결정도 연습됩니다. 왼쪽 **학생 화면 · 지금 이렇게 보여요** 상자에서 학생이 보는 화면과 "할 일" 문장을 그대로 확인할 수 있습니다. 실제 수업 전에는 `봇 모두 제거`를 누릅니다. 자동 검증은 `node scripts/bot-rehearsal.mjs http://localhost:5173 25`.

## 검사·테스트

```bash
npm run build
```
빌드 = 타입 검사 + 단위 테스트 + Vite 빌드. 실패하면 배포되지 않습니다.

```bash
node scripts/sim.mjs http://localhost:5173 40 approve
```
`approve | investigate | reject` 중 하나로 결정 2의 분기를 고릅니다. 교사 1 + 학생 N + 공개 화면 1을 독립 WebSocket 으로 연결해 입장 → 결정 1~6 → 분기 장면 → 동률·재투표·교사 결정 → 단서 공개 → 재계산 → 엔딩 → 삭제까지 자동 검증합니다(결과: [TEST_REPORT.md](TEST_REPORT.md)). 이는 기술 검증이며 실제 학급 수업 실증이 아닙니다.

## 문서

- [TEACHER_GUIDE.md](TEACHER_GUIDE.md) — 1쪽 시작 가이드, 13장면 45분·35분 운영안, 분기 설명, 장애 대응, 관찰 기준
- [CONTENT_MAP.md](CONTENT_MAP.md) — 원칙→결정→행동→성찰 연결표, AI 배정기 설정, 가상 데이터, 계산식, 분기, 노출 시점
- [docs/IMAGE_REQUESTS.md](docs/IMAGE_REQUESTS.md) — 개편으로 추가 요청하는 이미지 목록과 프롬프트(제공 전까지 기존 그림으로 대체)
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub + Cloudflare Workers Builds 자동배포, 스테이징, 수업 중 배포 영향
- [TEST_REPORT.md](TEST_REPORT.md) — 실제 검증 기록과 미검증 항목
- [AI_USAGE.md](AI_USAGE.md) — 생성형 AI 활용 범위(이미지·음향·코드)
- [ASSET_MANIFEST.json](ASSET_MANIFEST.json) — 이미지·음향 자산 대응표
- [docs/SUBMISSION.md](docs/SUBMISSION.md) — 공모전 기획 의도·활용 방법·심사기준 대응표
- [docs/STUDENT_WORKSHEET.md](docs/STUDENT_WORKSHEET.md) — 학생 활동지(결정 1~6)
- [DESIGN.md](DESIGN.md) — 시각 디자인 참고 문서(Discord 분석, 토큰만 차용)

## 상태 (2026-11-02, 개편판)

- 구현·로컬 검증 완료: 결정 1~6 전 과정과 세 분기, 권한 분리, 재연결, 동률·미응답, 40명 동시 제출, 만료·삭제, 교사 미리보기, 연습용 봇
- 코드 원본: https://github.com/sirlma111216-boop/ethicon (main) → Cloudflare Workers Builds 자동배포
- 운영 주소: https://ethicon.labbitory.com
- 자산 대기: AI 배정기 장면·편지 장면·원칙 배지·신청자 초상은 요청 중(docs/IMAGE_REQUESTS.md), 엔딩용 배경음악(`bgm-reflection.mp3`) 미제공
