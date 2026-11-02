# 추가 이미지 요청 목록 (개편 후)

> **2026-11-02 수령 완료.** 아래 18장이 모두 도착해 앱에 연결했다(`src/client/lib/images.ts` 의 PROVIDED·PORTRAITS). 이 문서는 요청 당시 프롬프트 기록으로 보존한다.

개편으로 새 장면이 생겼습니다. 아래 이미지가 **없어도 앱은 동작**하며, 그때까지는 기존 자산을 대신 씁니다(`src/client/lib/images.ts` 의 FALLBACK). 파일을 받으면 `assets/images/<id>.png` 에 넣고 `npm run images` 를 돌린 뒤 `images.ts` 의 `PROVIDED` 목록에 id 를 추가하면 바로 반영됩니다.

기존 18장과 같은 도구(OpenAI built-in imagegen)와 같은 공통 스타일 문장을 쓰면 화풍이 맞습니다. 모든 이미지는 **글자·숫자·로고·UI 없음**, 간판과 카드는 빈칸, 한국 중학생은 가상의 인물로 성별·외모에 역할을 고정하지 않습니다.

## 공통 스타일 문장 (모든 프롬프트 앞에 붙이기)

```
Original premium cooperative mystery game art for Korean middle-school students aged 12–15. A near-future school festival at blue hour, sophisticated stylized 2.5D editorial illustration, soft sculpted volumes, tactile matte surfaces, clean silhouettes, art-directed lighting, subtle grain. Palette deep indigo #151B3D, violet-blue #7468FF, mint #89E0CA, apricot #FFBE9A, warm white #F5F3EE. Same four recurring fictional students as the existing key art: a girl with a short black bob and mint jacket, a boy with wavy dark hair and cream sweatshirt, a girl with long tied-back hair and apricot cardigan, a boy with short hair and violet overshirt. Equal visual dignity, no villains. All signage, cards and screens are BLANK. NO letters, numerals, words, logos, watermarks or interface controls. Text-free artwork; the app adds Korean text and live data in HTML.
```

## 우선순위 1 — 꼭 필요한 장면 3장 (16:9, 가로 1672px 이상)

### 1. `ai-kiosk.png` — AI 배정기 (결정 1·2 장면 배경)
현재 대체: scene-allocation.png
```
Wide 16:9 scene. The committee of four students stands before the "AI allocator": a friendly, slightly retro-futuristic kiosk about the height of a student, matte indigo body with a translucent front panel showing six empty glowing ticket-shaped slots arranged in two rows, a small slot that has just printed a blank glowing card, and soft mint status lights. The machine is an ordinary tool, not a robot face, not menacing, not all-knowing. The students look curious and slightly uncertain; one holds the blank printed card up to read it. Festival lanterns and tents in the background at blue hour. Keep the LEFT 40 percent a calm dark indigo wall / negative space for a large Korean question overlay and three HTML buttons; put the kiosk and students in the right 60 percent. No text anywhere.
```

### 2. `appeal-morning.png` — 다음 날 아침, 편지 세 통 (결정 2 결과 분기 장면)
현재 대체: scene-investigation.png
```
Wide 16:9 scene, next morning light (cool soft daylight instead of blue hour). The same committee table in the festival pavilion. On the table: a small wooden suggestion box with three blank folded letters placed in front of it, a cold cup, and the blank printed card from the AI kiosk. Two of the four students read a letter together with thoughtful, concerned but not sad expressions; another checks the empty kiosk slots in the background. The mood: "we decided too fast and now we must look again" — reflective, not dramatic. Keep the LEFT 40 percent as calm negative space (pale indigo wall) for an HTML story overlay. No text on the letters.
```

### 3. `announcement-board.png` — 결과 게시판 앞 (승인 분기 보조 장면 · 교사 화면)
현재 대체: scene-allocation.png
```
Wide 16:9 scene. A festival notice board with six blank glowing ticket cards pinned in a row and a larger blank sheet below. A small crowd of fictional students of varied looks reading it: some relieved, some quietly disappointed, one asking a staff student with a clipboard a question. No ranking symbols, no numbers, no faces of triumph or humiliation. Blue hour, lanterns. Keep the LEFT 35 percent as calm negative space for HTML. No text.
```

## 우선순위 2 — 원칙 배지 2장 (1:1 1254px, 투명 배경 PNG)

기존 배지 3장(badge-*.png)과 같은 재질·카메라 각도·조명으로.

### 4. `principle-fairness.png` — 공정성·포용성
현재 대체: badge-perspective.png
```
A tactile collectible game emblem on a transparent background: a round indigo medallion with a thin gold rim. Inside, two different-length starting paths that both reach the same open gate, and a small balanced scale shape made of soft translucent mint and apricot glass. Symbolizes fairness and inclusion: different starting points, equal access. Same material, lighting and camera angle as the existing three badges. No text, no numbers, no stars.
```

### 5. `principle-transparency.png` — 투명성
현재 대체: badge-evidence.png
```
A tactile collectible game emblem on a transparent background: a round indigo medallion with a thin gold rim. Inside, a small translucent glass kiosk whose inner gears and paths are visible, with a soft light beam passing through it, and an open speech-bubble shape without any glyph. Symbolizes transparency: you can see how the decision was made and ask about it. Same material, lighting and camera angle as the existing badges. No text.
```

## 우선순위 3 — 선택: 신청자 초상 12장 (1:1 640px 이상, 배경 포함)

없어도 앱은 이름 머리글자 아바타로 표시합니다. 있으면 인트로의 "신청자 12명 만나기"와 AI 추천 명단이 훨씬 생생해집니다. 파일명은 `applicant-a01.png` … `applicant-a12.png`. 모두 **가상의 한국 중학생**, 다양한 머리 모양·옷·체형, 성별과 외모를 역할에 고정하지 않고, 누구도 우월하거나 열등해 보이지 않게. 같은 조명·같은 단순 남색 배경·가슴 위 구도.

| 파일 | 이름(앱 표시) | 짧은 힌트 (성격 묘사 금지, 소품만) |
|---|---|---|
| applicant-a01 | 하람 | 작은 로봇 부품 키링을 든 학생 |
| applicant-a02 | 도윤 | 휴대폰을 막 내려놓은 학생 |
| applicant-a03 | 서진 | 운영 도우미 완장(빈칸)을 찬 학생 |
| applicant-a04 | 지우 | 축제 안내 지도(빈칸)를 접고 있는 학생 |
| applicant-a05 | 로아 | 미래탐험 포스터(빈칸)를 바라보는 학생 |
| applicant-a06 | 태양 | 작년 축제 배지를 가방에 단 학생 |
| applicant-a07 | 은유 | 급식 앞치마를 벗고 있는 학생 |
| applicant-a08 | 민결 | 친구 쪽을 돌아보는 학생 |
| applicant-a09 | 해온 | 물감 묻은 손으로 태블릿을 든 학생 |
| applicant-a10 | 보라 | 여러 해의 축제 배지 묶음을 든 학생 |
| applicant-a11 | 시안 | 새 교과서와 빈 안내문을 든 학생 |
| applicant-a12 | 다온 | 헤드셋을 목에 건 방송부 학생 |

공통 프롬프트 뒤에 붙일 문장:
```
Waist-up portrait of ONE fictional Korean middle-school student on a simple deep indigo background with soft bokeh lights, neutral dignified expression, looking slightly toward the camera. Prop hint: <표의 힌트>. Do not depict wealth, poverty, disability, grades or popularity. No text.
```

## 선택: 모바일 세로 변형

`ai-kiosk-mobile.png`(9:16): 같은 AI 배정기 장면을 세로 구도로. 상단 35%는 어두운 하늘(제목용), 하단 띠는 버튼용. 없으면 가로 이미지를 위에 두고 질문은 아래에 배치합니다(현재 방식).

## 받은 뒤 할 일 (제가 합니다)

1. `assets/images/` 에 원본 저장, `npm run images` 로 WebP 생성
2. `src/client/lib/images.ts` 의 `PROVIDED`·`PORTRAITS` 목록에 id 추가, 필요 시 오버레이 안전 영역 조정
3. `ASSET_MANIFEST.json`·`AI_USAGE.md` 에 프롬프트·제작일 기록
