# My Work Desk 세션 인수인계

이 문서는 새 Codex 세션에서 `YuhaABBA2/my-work-desk` 작업을 바로 이어가기 위한 요약입니다.

## 현재 저장소/배포

- GitHub 저장소: `YuhaABBA2/my-work-desk`
- 로컬 작업 폴더: `C:\Projects2\my-work-desk-github`
- 프로덕션 URL: `https://my-work-desk.vercel.app/`
- Vercel은 GitHub `main` 브랜치 push 후 자동 배포됨
- Supabase 프로젝트는 이미 연결되어 있음
- `work_tasks` 테이블과 RLS 설정은 이미 적용됨
- Supabase publishable key는 코드에 들어있지만, service_role 키는 절대 사용하거나 요청하지 말 것

## 중요한 운영 원칙

- service_role 키를 코드, 문서, 대화에 넣지 않는다.
- 기존 Supabase 프로젝트의 다른 앱/데이터와 섞이지 않게 `work_tasks`와 현재 RLS 정책 범위에서만 작업한다.
- Google OAuth Provider의 비밀값은 사용자가 Google Cloud와 Supabase Dashboard에서 직접 관리한다.
- 정적 Vercel 배포이므로 브라우저에서 직접 호출하기 어려운 기관 API는 공개 링크/안전한 프록시 구조로 접근한다.

## 주요 작업 내역

### 루트 앱 전환

- `/`에서 예전 로컬 전용 화면 대신 로그인형 업무판이 뜨도록 변경했다.
- `cloud.html`은 `/`로 이동하는 리다이렉트 페이지가 됐다.
- `vercel.json`에는 캐시 문제를 줄이기 위한 정적 배포 설정이 적용되어 있다.

### 로그인/동기화

- Google 로그인은 Supabase Auth 기반이다.
- 로그인 후 `work_tasks`에 업무/일정을 저장한다.
- 사용자별 RLS 기준으로 로그인한 계정의 데이터만 보이도록 전제하고 있다.

### PWA/아이콘

- `site.webmanifest` 추가.
- 홈 화면 추가용 아이콘 추가:
  - `icons/work-desk-icon.svg`
  - `icons/work-desk-icon-180.png`
  - `icons/work-desk-icon-192.png`
  - `icons/work-desk-icon-512.png`
- 아이콘 컨셉은 대장간/스미스 느낌이다.

### UI 개선

- Apple스럽고 단순한 업무판 UI로 정리했다.
- CSS는 `styles.css`, 앱 로직은 `app.js`로 분리했다.
- 다크모드 토글이 있다.

### 업무/일정 기능

현재 구현된 기능:

- 일정/업무 추가
- 일정 수정
- 일정 삭제
- 완료 체크
- 완료한 일 숨기기/보기
- 날짜 클릭 후 해당 날짜 일정 추가
- 반복 일정 생성
  - 매일
  - 매주
  - 매월
  - 최대 24회
- 프로젝트/카테고리 관리
- 오늘 해야 할 일
- 이번 주 마감
- 월간 캘린더
- 마감 임박 표시
- 브라우저 알림 버튼
- 프로젝트 목록은 Supabase `work_projects`로 동기화 (localStorage에서 1회 이관)
- 반복 일정은 `series_id`로 묶이며, 수정·삭제 시 "이 일정만 / 이후 모두" 선택 (`<dialog>`)
- 시간 입력은 5분 단위(`step="300"`)
- 기간 일정(시작일~종료일, `end_date`), 하루종일(`task_time null`), 알림 시점(`remind_1h`/`remind_1d`, 저장만 — 발송은 다음 스펙)
- 고정 프로젝트 3개(회사 업무·개인 일정·가족 일정, 삭제 불가, 로그인 시 자동 생성) + 프로젝트별 색상(이름 해시, 체크박스 테두리·캘린더 점)
- 반복 "없음"이면 횟수칸 숨김(CSS `:has`). 캘린더 칸은 2개 + "+N"
- 기존 업무 중 시간이 없던 것은 이제 "하루종일"로 표시된다

### 축산물 시세

- 축산물 시세 카드 추가.
- 대상:
  - 양돈
  - 한우
  - 산란
  - 육계
- KAMIS 가격정보 API 조회를 시도한다.
- 브라우저 제한이나 테스트 키 한계가 있으면 공식 페이지 안내로 fallback한다.
- 상세 실시간 데이터를 안정적으로 앱 안에 넣으려면 추후 서버리스 프록시/API 키 구조가 필요하다.

### 투자 지표 조회

투자 지표 조회 카드 추가.

종목명/종목코드/키워드를 입력하면 관련 공식/참고 페이지 링크를 만든다.

포함된 링크:

- KRX 정보데이터시스템
- DART 전자공시
- KIND
- 네이버페이증권
- FnGuide
- 한국은행 ECOS
- KOSIS
- FRED
- TradingView

목적별 지표 카드:

- 시장 전체 체온
- 수급
- 개별 기업 원문
- 거래소 공시/상장 이슈
- 실적·컨센서스
- 금리·환율·유동성
- 국내 경기
- 정책/규제
- 글로벌 압력

현재는 정적 앱에서 안전하게 동작하도록 공식 조회 허브/링크 중심으로 구현되어 있다. 실시간 수치 자체를 앱 내부에 직접 표시하려면 기관별 API 인증키와 서버리스 프록시가 필요하다.

## 2026-09-12 세션에서 알게 된 함정

- Supabase Auth의 Site URL이 옛 배포 스냅샷 주소로 남아 있으면 로그인 후 옛 코드로 튕긴다. Site URL/Redirect URLs는 `https://my-work-desk.vercel.app` 기준.
- `.overlay{display:grid}`가 `[hidden]`을 덮어써 로그인 후에도 오버레이가 남았던 적이 있다 → `.overlay[hidden]{display:none}` 유지.
- Chrome 152에서 `<dialog>`의 `close` 이벤트가 오지 않는 경우가 있어 `askSeriesScope`는 form `submit`/`cancel`로 판정한다.
- iOS Safari의 date/time 입력은 고유 min-width가 있어 `min-width:0` + `appearance:none`이 필요하다.

## 다음 스펙 후보 (사용자 요청 순)

1. 가족 공유: "가족 일정" 프로젝트만 가족 계정끼리 공유. 투자·시세·투자지표 패널은 본인에게만. RLS 재설계 필요
2. 푸시 알림 발송: 저장된 알림 시점에 폰에서 울리게 (Web Push + 크론)
3. 축산 시세 수치화: `livestock_price` + 한우 크론(pig-farm-log), `pig_price` 읽기. 육계·계란은 산지가 API가 없어 2단계

## 최근 커밋

- `d8d91b6 feat: add investment indicator hub`
- `2384be9 feat: expand work desk planning tools`
- `fb675f0 style: make app icon forge themed`
- `b79f88b feat: add pwa home screen icons`
- `7d249ee style: refine work desk interface`
- `c418efe fix: prevent stale root html cache`

## 마지막 검증 결과

최근 검증 기준:

- `node --check app.js` 통과
- `git diff --check` 통과
- 로컬 정적 서버에서 `/`, `/app.js`, `/styles.css` 200 확인
- 브라우저 콘솔 에러 0개 확인
- Vercel 프로덕션 배포 성공 확인
- 프로덕션 URL에서 투자 섹션 반영 확인

최근 Vercel deployment:

- `6402827049`
- commit: `d8d91b6`
- state: `success`

## 주요 파일 구조

- `index.html`: 루트 앱 화면
- `cloud.html`: 루트로 리다이렉트
- `app.js`: 진입점 (ES module). 이벤트 바인딩과 `start()`
- `lib.js`: DOM/Supabase 의존 없는 순수 함수. `npm test`(`tests/lib.test.mjs`)로 검증
- `state.js`: 공유 상태와 localStorage 설정(다크모드, 완료 숨김)
- `supabase.js`: Supabase 클라이언트 (publishable key만)
- `ui.js`: 화면 그리기, 폼, 시리즈 선택 dialog(`askSeriesScope`)
- `tasks.js`: `work_tasks` CRUD, 반복 생성(series_id), "이 일정만/이후 모두"
- `projects.js`: `work_projects` CRUD, localStorage → Supabase 1회 이관
- `market.js`: 축산 시세 자리표시자 + 투자 링크
- `package.json`: `"type": "module"`, `npm test`. 빌드 없음 (Vercel Framework Preset: Other)
- `styles.css`: 전체 UI 스타일과 다크모드
- `site.webmanifest`: PWA 설정
- `icons/`: 홈 화면 아이콘
- `supabase-setup.sql`: Supabase 테이블/RLS 참고 SQL
- `vercel.json`: Vercel 정적 배포 설정

## 다음에 하면 좋은 일

- 투자 지표를 실제 수치 카드로 확장할 경우 서버리스 API 프록시 설계
- KRX/KOSIS/ECOS/DART Open API 키를 안전하게 다룰 환경 변수 구조 추가
- 축산물 시세도 공식 API 키 기반으로 안정화
- 모바일 캘린더 주간 뷰를 더 촘촘하게 개선

