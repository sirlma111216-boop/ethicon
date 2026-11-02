# 축제의 빈자리: AI 배정위원회

중학생 24~36명(최대 40명)이 교사 1명의 진행으로 45분 동안 함께 플레이하는 **실시간 협력 웹앱**입니다.
학급 전체가 하나의 배정위원회가 되어, 가상의 축제 체험권 6자리를 신청자 12명에게 어떻게 배정할지 정하고,
AI 추천의 기준을 조사하고, 규칙을 다시 설계합니다.

> **실제 사람을 평가하지 않는 가상 AI 배정 실험입니다.** 신청자와 자료는 모두 지어낸 것이며, 여기서 "AI"는 학급이 고른 규칙을 계산하는 교육용 시뮬레이터입니다(학습된 모델이 아님).

- 학습 원칙: **공정성·포용성**, **투명성** (2026 인공지능 윤리교육 콘텐츠 공모전 ③ 디지털 콘텐츠)
- 대상: 중학교 1~3학년 / 45분 1차시 (느린 학급용 35분 단축안은 TEACHER_GUIDE.md)

## 화면

| 경로 | 역할 | 설명 |
|---|---|---|
| `/` | 공통 | 인트로 키아트, 학생 입장 / 교사 시작 |
| `/teacher` → `/teacher/:code` | 교사 | 방 만들기, 코드·QR, 진행 제어(다음·이전·마감·공개·연장·일시정지·재투표·교사 결정), 자유 응답 승인, 발문·오개념 메모, 내보내기, 삭제 |
| `/join/:code` → `/play/:code` | 학생 | 코드 입장(가명 자동 발급), 단계별 활동, 제출 확인, 재연결 복구 |
| `/board/:code?t=<읽기전용 토큰>` | 공개 화면 | 프로젝터용 큰 글씨, 공동 결과, 승인된 익명 의견. 교사 메모·대기열·개인 응답 없음 |
| `/help` | 공통 | 도움말·개인정보 안내 |

## 45분 흐름

입장(0~3) → 인트로·연습·사전 판단(3~7) → **라운드 1** 첫 배정 규칙 투표·결과·추가 정보(7~15) → **라운드 2** 조사 카드 2장·관점 카드·단서 공개(15~25) → **라운드 3** 규칙 패키지 투표·이전/이후 비교(25~35) → 공동 질문 2개·다른 상황 적용(35~40) → 개인 성찰·엔딩(40~45)

학급의 실제 선택이 결과를 바꿉니다: 세 정책은 서로 다른 6명을 뽑고(처음 참여 2/0/5명), 네 패키지는 같은 12명에게 다른 결과·설명 시간·이의 제기 기회를 냅니다. 자세한 데이터와 계산식은 [CONTENT_MAP.md](CONTENT_MAP.md).

## 기술 구성

- **클라이언트**: React 19 + TypeScript + Vite 8 (`src/client`)
- **서버**: Cloudflare Workers (`src/worker/index.ts`) + Durable Objects (`RoomDO`: 방 1개 = DO 1개, SQLite 저장소, WebSocket Hibernation API; `LimiterDO`: 속도 제한)
- **공유 모듈**: 타입·프로토콜(`src/shared/types.ts`), 공개 콘텐츠(`src/shared/content.ts`), 순수 계산 엔진(`src/shared/engine.ts`)
- **서버 전용 콘텐츠**: 미공개 단서·인물 반응·보정표·교사 메모(`src/worker/secretContent.ts`) — 공용 번들에 포함되지 않음
- 서버가 방 상태의 유일한 기준(`phase`, `roundId`, `revision`, `flowRevision`, `endsAt`, `pausedRemainingMs`). 역할·라운드·스키마·방 인원을 서버에서 검증하고, 클라이언트 role 필드를 믿지 않음
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

## 검사·테스트

```bash
npm run build
```
빌드 = 타입 검사 + 단위 테스트 + Vite 빌드. 실패하면 배포되지 않습니다.

```bash
npm run sim -- http://localhost:5173 40
```
교사 1 + 학생 40 + 공개 화면 1을 독립 WebSocket 으로 연결해 입장→투표→동률·재투표·교사 결정→단서 공개→규칙 재설계→엔딩→삭제까지 57개 항목을 자동 검증합니다(결과: [TEST_REPORT.md](TEST_REPORT.md)). 이는 기술 검증이며 실제 학급 수업 실증이 아닙니다.

## 문서

- [TEACHER_GUIDE.md](TEACHER_GUIDE.md) — 1쪽 시작 가이드, 45분·35분 운영안, 장애 대응, 관찰 기준
- [CONTENT_MAP.md](CONTENT_MAP.md) — 원칙→활동→행동→성찰 연결표, 가상 데이터, 계산식, 분기
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub + Cloudflare Workers Builds 자동배포, 스테이징, 수업 중 배포 영향
- [TEST_REPORT.md](TEST_REPORT.md) — 실제 검증 기록과 미검증 항목
- [AI_USAGE.md](AI_USAGE.md) — 생성형 AI 활용 범위(이미지·음향·코드)
- [ASSET_MANIFEST.json](ASSET_MANIFEST.json) — 이미지·음향 자산 대응표
- [docs/SUBMISSION.md](docs/SUBMISSION.md) — 공모전 기획 의도·활용 방법·심사기준 대응표
- [docs/STUDENT_WORKSHEET.md](docs/STUDENT_WORKSHEET.md) — 학생 활동지
- [DESIGN.md](DESIGN.md) — 시각 디자인 참고 문서(Discord 분석, 토큰만 차용)

## 상태 (2026-11-02)

- 구현·로컬 검증 완료: 멀티플레이 전 과정, 권한 분리, 재연결, 동률·미응답, 40명 동시 제출, 만료·삭제
- 외부 연결 대기: GitHub 원격 저장소, Cloudflare 계정 연결 및 첫 배포 (DEPLOYMENT.md 2장)
- 자산 대기: 엔딩용 배경음악(`bgm-reflection.mp3`)은 제공되지 않아 엔딩은 효과음만 사용
