# DEPLOYMENT — 배포·운영 안내

대상: Cloudflare Workers(정적 자산 + API) + Durable Objects(방 상태, SQLite 저장소, WebSocket Hibernation).
별도의 장기 실행 Node 서버는 없다. 코드 원본은 GitHub, 배포는 Cloudflare **Workers Builds**(main push 시 자동)이다.

> 현재 상태(2026-11-02): GitHub `https://github.com/sirlma111216-boop/ethicon` 의 `main` 이 Cloudflare Workers Builds 에 연결되어 자동배포되며, 운영 주소는 `https://ethicon.labbitory.com` 이다(사용자가 대시보드에서 연결하고 교사 화면이 뜨는 것을 확인함). 운영 환경에서의 40명 시뮬레이션은 아직 돌리지 않았다.

## 1. 구성 요약

| 항목 | 값 |
|---|---|
| Worker 이름 | `festival-empty-seat` (대시보드 Worker 이름과 `wrangler.jsonc` 의 `name` 을 일치시킬 것) |
| 스테이징 | `festival-empty-seat-staging` (`wrangler.jsonc` 의 `env.staging`) |
| 빌드 명령 | `npm run build` = 타입 검사(`tsc` ×2) → 단위 테스트(`vitest run`) → `vite build`. 하나라도 실패하면 빌드가 실패하고 배포되지 않는다. |
| 배포 명령 | `npx wrangler deploy` (Workers Builds 기본값). `@cloudflare/vite-plugin` 이 `dist/festival_empty_seat/wrangler.json` 과 `.wrangler/deploy/config.json` 리다이렉트를 생성하므로 추가 인자가 필요 없다. |
| 정적 자산 | `dist/client` (SPA, `not_found_handling: single-page-application`), `/api/*`·`/ws` 는 `run_worker_first` 로 Worker 가 먼저 처리 |
| Durable Objects | `ROOM` → `RoomDO`(방 1개 = DO 1개), `LIMITER` → `LimiterDO`(IP 별 속도 제한). 둘 다 `new_sqlite_classes` 마이그레이션 `v1` |
| 호환 날짜 | `2026-10-01`, `nodejs_compat` |
| 변수 | `APP_ENV`(production/staging/development), `ROOM_TTL_HOURS`(기본 24) |
| 비밀값(선택) | `TEACHER_CREATE_SECRET` — 설정하면 방 생성 시 교사용 비밀번호를 요구 |
| 의존성 | `package.json` 에 정확한 버전 고정, `package-lock.json` 커밋 |

## 2. 최초 연결 단계 (사용자가 1회 수행)

### 2-1. GitHub (완료)

원격 `origin` = `https://github.com/sirlma111216-boop/ethicon.git`, 기본 브랜치 `main`. 이후 변경은 커밋 후 `git push` 하면 된다. 기존 기록을 덮어쓰는 강제 푸시는 하지 않는다.

### 2-2. Cloudflare Workers Builds 연결

1. Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Import a repository** → GitHub 연결 후 이 저장소 선택.
2. 설정값
   - Project/Worker name: `festival-empty-seat` (반드시 `wrangler.jsonc` 의 `name` 과 동일)
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
   - Production branch: `main`
3. (선택) **Settings → Variables & Secrets** 에 `TEACHER_CREATE_SECRET` 를 Secret 으로 추가.
4. 저장하면 첫 빌드가 실행된다. 빌드 로그에서 `tsc`, `vitest`, `vite build`, `wrangler deploy` 가 순서대로 성공했는지 확인한다.
5. 배포 주소(`https://festival-empty-seat.<subdomain>.workers.dev` 또는 연결한 도메인)로 접속해 `/healthz` 가 `{"ok":true,"env":"production"}` 을 돌려주는지 확인한다.

### 2-3. 스테이징

계정에서 지원하는 가장 단순한 방식은 **두 번째 Workers Builds 프로젝트**를 같은 저장소의 `staging` 브랜치에 연결하고 배포 명령을 `npx wrangler deploy --env staging` 으로 두는 것이다. 이름은 `festival-empty-seat-staging` 이 된다. Durable Object 네임스페이스는 Worker 별로 분리되므로 **스테이징 방 데이터와 운영 방 데이터는 섞이지 않는다.** 로컬 개발(`vite dev`)은 `.wrangler/state` 에만 저장하며 `.dev.vars` 의 `APP_ENV=development` 로 속도 제한이 꺼진다.

> 참고: Workers Builds 의 "Preview" 기능은 Durable Objects 를 쓰는 Worker 에서 버전 URL 을 만들지 않으므로(공식 문서), 미리보기 대신 스테이징 Worker 를 쓴다.

## 3. 운영 수업 중 배포·스키마 변경의 영향

- 배포 시 Durable Object 는 코드가 교체되지만 **SQLite 저장소는 유지**된다. 진행 중인 방의 `meta.room` 문서와 제출 테이블은 남고, 새 코드가 `loadDoc()` 으로 읽는다. 하이버네이션 중인 WebSocket 은 기본 "deferred" 업데이트 전략에서는 유지되지만, 즉시 교체가 일어나면 끊기고 클라이언트가 자동 재연결한다(학생 화면은 "다시 연결하는 중" 배너를 보이고 제출은 재연결 뒤에만 확인된다).
- **수업 중(45분) 배포는 피한다.** 꼭 필요하면 `일시정지` 를 누른 뒤 배포하고 재개한다.
- 스키마 변경: `initSchema()` 는 `CREATE TABLE IF NOT EXISTS` 만 쓰므로 새 테이블·인덱스 추가는 안전하다. 기존 열 변경은 새 마이그레이션 태그(`v2`)와 함께 코드에서 호환 처리해야 한다. `RoomDoc` 에 필드를 추가할 때는 `loadDoc()` 에서 기본값을 채운다(`flowRevision ??= 1` 과 같은 방식).
- DO 클래스 이름 변경·삭제는 `migrations` 에 `renamed_classes`/`deleted_classes` 를 추가해야 한다. 진행 중인 방이 있으면 데이터가 사라지므로 수업 시간 외에 한다.

## 4. 데이터 보존과 삭제

- 방 생성 후 `ROOM_TTL_HOURS`(기본 24시간) 가 지나면 DO 알람이 `storage.deleteAll()` 로 모든 데이터를 지우고 연결을 닫는다. 재접속해도 만료 시각은 연장되지 않는다.
- 교사의 "방 데이터 삭제"는 즉시 같은 동작을 한다.
- 애플리케이션 로그(`log` 테이블, `console.error`)에는 원문 응답·토큰을 기록하지 않는다. 토큰은 URL 이 아니라 WebSocket 첫 메시지로만 전달한다.
- 속도 제한기 DO 는 창 길이의 2배가 지나면 스스로 비운다.

## 5. 로컬 개발

```bash
npm install
```
```bash
npm run dev
```
- http://localhost:5173 — 교사/학생/공개 화면을 서로 다른 브라우저 프로필(또는 시크릿 창)에서 연다. 같은 브라우저 프로필은 `localStorage` 를 공유하므로 학생 2명을 시험하려면 창을 분리한다.
- 멀티플레이 시뮬레이션: `npm run sim -- http://localhost:5173 40`
- 이미지 재최적화: `npm run images` (원본 `assets/images/*.png` → `public/images/festival/*.webp`)
- 타입 생성: `npm run cf-typegen` (`wrangler.jsonc` 변경 시)

## 6. 검증하지 못한 항목 (정직한 표기)

- 실제 Cloudflare 운영 배포와 `main` push 에 따른 자동 배포 실행 — 계정 연결이 없어 **미검증**.
- 운영 환경에서의 40명 동시 접속 지연 — 로컬 Miniflare(workerd) 기준으로만 측정(TEST_REPORT.md 참고).
- 실제 학급 수업 실증 — 수행하지 않았다.
