# 우리집 데스크 — 세션 인수인계

새 세션에서 `YuhaABBA2/my-work-desk` 작업을 바로 이어가기 위한 요약. (마지막 갱신: 2026-09-12)

## 현재 저장소/배포

- 앱 이름: **우리집 데스크** (구 "나의 업무판")
- GitHub 저장소: `YuhaABBA2/my-work-desk` (main 자동 배포)
- 로컬 폴더: `C:\Projects2\my-work-desk-github`
- 프로덕션: `https://my-work-desk.vercel.app/`
- Supabase 프로젝트: `skihcfyndumifhaxamas` (pig-farm-log와 공유)
- 알림 발송용 서버는 **pig-farm-log** (`C:\Projects2\pig-farm-log`, https://masan-farm.vercel.app)

## 운영 원칙 (Global Constraints)

- service_role 키를 코드·문서·대화에 절대 두지 않는다. 브라우저는 publishable key(`sb_publishable_…`)만.
- 다른 앱과 같은 Supabase 프로젝트를 쓰므로 `work_tasks`·`work_projects`·`families`·`family_members`·`work_settings`·`push_subscriptions`·`notification_log`·`work_notes` 외에는 건드리지 않는다. `pig_price`는 읽기만 허용됨.
- `work_tasks` RLS는 **"본인 또는 내 가족(`family_id`)"**. `create_family`/`join_family`는 security definer RPC(로그인 사용자만). `work_tasks.user_id`·`family_members.family_id`는 컬럼 권한으로 변경 불가.
- 정적 Vercel 배포 — 브라우저에서 못 부르는 API는 pig-farm-log 서버 함수(또는 크론)로.
- **pig-farm-log push 시 커밋 author 이메일은 `jskim1@woosung.kr` 이어야 Vercel 자동 배포됨**. `bethebrave91@gmail.com`으로 push된 커밋은 "member of Vercel team이 아님"으로 거부됨(2026-09-12 확인).
- **Vercel Hobby 플랜은 크론 하나가 하루 1회 초과 스케줄이면 배포 자체가 실패**. `notify-tasks`는 GitHub Actions로 옮겼음.

## 현재 기능

### 업무·일정 (work-desk)

- Google 로그인, 계정별 데이터. `work_tasks`에 저장.
- 오늘 카드, 이번 주 마감(마감일 기준), 월간 캘린더(기간 일정은 모든 칸에 표시, 3개 이상이면 `+N`).
- 폼은 **모달 다이얼로그**. 헤더 `+ 추가` 버튼, 폰에서는 오른쪽 아래 FAB.
- 필드: 제목, 시작일, **종료일(선택)**, 시간(5분 단위) + **하루종일** 체크, 우선순위, 프로젝트(select), 반복(없음/매일/매주/매월, 없음이면 횟수칸 숨김), **알림 시점**(1시간 전 / 하루 전), **가족과 공유**(가족 있으면 표시. "가족 일정" 프로젝트면 자동 켜지고 잠금), 메모.
- 캘린더 날짜 클릭 → 그 날짜로 다이얼로그 열림. 편집 버튼 → 채워진 다이얼로그.
- 반복 일정은 `series_id`로 묶이고, 수정·삭제 시 **"이 일정만 / 이후 모두"** 선택(앱 내 `<dialog>`).
- 완료 체크, 완료 숨김, 다크모드.

### 프로젝트

- `work_projects` 테이블에 계정별 저장. 최초 로그인 시 localStorage에서 1회 이관, 없으면 고정 3개 자동 생성.
- **고정 3개**: 회사 업무 · 개인 일정 · 가족 일정 (삭제 불가). 사용자 프로젝트 추가/삭제 가능.
- **색상**: 이름에서 결정(고정 3개는 지정색, 나머지는 해시로 팔레트 5색). 체크박스 테두리, 캘린더 점, 칩 앞 점에 반영.

### 가족 공유

- 초대 코드 6자로 두 계정을 묶음(`families`/`family_members` + `create_family`·`join_family` RPC).
- "가족 일정" 프로젝트 업무는 자동 공유. **"가족과 공유"** 체크박스로 다른 프로젝트도 공유 가능(→ `family_id` 세팅).
- 로그인 시 자기 "가족 일정"/"가족일정"(띄어쓰기 무관) 업무 중 `family_id`가 null인 것을 소급 태그.
- 카드: 구성원 목록(만든 계정에 **"가장"** 뱃지), 표시 이름 수정, 가장은 초대 코드 재발급, 구성원은 나가기.
- 남이 만든 가족 업무는 카드 메타 끝에 작성자 이름 표시.

### 아이디어 노트 (제텔카스텐, 본인 전용) — 2026-09-14

- `work_notes`(id, user_id, title, body, updated_at). RLS 본인만. 제목은 계정 안 유일(대소문자·공백 무시), 대괄호 금지.
- 링크는 본문 `[[제목]]`이 전부 — 링크 표 없음. 연결·백링크는 클라에서 `lib.js noteLinks/noteBacklinks`로 계산.
- 제목 바꾸면 `notes.js saveNote`가 백링크 본문의 `[[옛제목]]`을 함께 치환. 삭제하면 남은 링크는 회색 취소선(끊긴 링크).
- 편집은 textarea. `@`(줄 시작·공백 뒤)로 제목 검색 → 선택하면 `[[제목]] ` 삽입. 없는 제목이면 "새 노트 만들기".
- 화면: 대시보드 카드(최근 5장·검색, `notes-ui.js`) → `noteDialog` 읽기/편집. 링크 타고 들어간 만큼 `state.noteStack`, ← 뒤로.
- **기본 숨김.** 프로필 → 설정 → "아이디어 노트 보기"로 계정별 켬(`work_settings.show_notes`). 꺼져 있으면 카드도 없고 `loadNotes()`도 안 부른다. 끄기는 숨김일 뿐 노트는 남는다. 배포 후 기존 사용자도 한 번 켜야 한다. 스펙 `docs/superpowers/specs/2026-09-14-notes-opt-in-design.md`.
- 가족 공유·태그·노트→업무 전환은 안 만듦. 스펙 `docs/superpowers/specs/2026-09-14-idea-notes-design.md`, 계획 `docs/superpowers/plans/2026-09-14-idea-notes.md`.

### 가족 일정 등록 알림 + 반복 지난 회차 접기 — 2026-09-15

- **등록 알림**: `work_tasks` INSERT 트리거 `work_tasks_created_hook` → `public.notify_task_created()`(pg_net `net.http_post`) → pig-farm-log `POST /api/hooks/task-created`. 서버가 id로 행을 재조회해 `family_id` 있는 것만, 가족 구성원 중 **등록자 제외**에 푸시. 반복은 시리즈의 가장 이른 회차 1건만. `notification_log.reminder_kind='new'`(제약에 추가됨)로 중복 방지. 시크릿 없음(Vercel env 접근 불가) — payload 무시·재조회로 대신함.
- **지난 회차 접기**: `lib.js isStaleRepeat` — 반복 시리즈의 미완료 지난 회차는 남은 업무 카운트·마감 임박·저녁 배너에서 제외. 캘린더·상세엔 "지남" 배지로 남음.
- 아침 요약 크론의 "오늘" 판정은 pig-farm-log `lib/task-day.ts`(데스크 `spansDay`와 동일)로 고침 — 종료일 없으면 당일만.
- 스펙 `docs/superpowers/specs/2026-09-15-family-task-alert-design.md`.

### 시세·투자 패널 (계정 설정)

- `work_settings.show_market` 계정별 설정. 기본 꺼짐.
- 프로필 → 설정 → "시세·투자 패널 보기". 2026-09-14부터 가족 가장 여부와 무관하게 모든 계정이 켤 수 있다. (헤더 토글 버튼은 9/13에 없어졌는데 `applyMarketVisibility`가 계속 참조해 TypeError → `loadMarket` 미실행 결함이 있었다. 같은 날 해소.)
- 축산물 시세 카드:
  - **양돈** = `pig_price` 실데이터. 등외제외, 헤드라인 + 14일 스파크라인 + 전일/전주/전년 대비.
  - **300두 미만 경매일은 표시에서 제외**(`lib.js filterPigSeries`, 토요일 30두 평균이 5,365로 찍히던 것). 당일 값은 pig-farm-log GH Actions `pig-price-evening.yml`(월~토 20:00 KST, `?today=1`)이 넣고 다음날 11:00 Vercel 크론이 확정치로 덮는다. 스펙 `docs/superpowers/specs/2026-09-15-pig-price-same-day-design.md`.
  - 한우 / 산란 / 육계 = 축산유통정보 다봄 링크(fallback). 실데이터는 다음 스펙.
- 투자 지표 카드: 맨 위에 **실시간 타일**(`ticker.js`) + 아래 공식 조회 페이지 링크 허브.
  - 시세는 pig-farm-log 공개 프록시 `https://masan-farm.vercel.app/api/market/quotes?symbols=…`(Yahoo 차트 API, 60초 캐시, 데스크 origin만 CORS). 카드·탭이 보일 때만 60초 타이머, 숨겨지면 정지.
  - 관심 목록은 계정별 `work_settings.market_symbols jsonb` (`null`=기본 7종: 코스피·코스닥·SOX·VIX·S&P500·달러/원·달러/엔). "편집"에서 추가/삭제, 최대 20개.
  - 검색: 한글·숫자 → 앱 안의 `krx-list.json`(KIND 상장목록 2,686종목, 회사 단위라 우선주 없음; 갱신은 `python scripts/build-krx-list.py`), 영문 → `/api/market/search` (Yahoo). 한국 주식(.KS/.KQ)은 정수, 나머지 소수 2자리.
  - Yahoo는 비공식 — 형식이 바뀌면 타일이 "조회 실패". pig-farm-log `app/api/market/quotes/route.ts` 한 곳 수정. 스펙 `docs/superpowers/specs/2026-09-15-market-watchlist-design.md`.

### 푸시 알림 (구독은 라이브, 발송은 CRON_SECRET 등록 후)

- 서비스워커 `sw.js` 등록. `notify.js`가 VAPID 공개키로 구독 → `push_subscriptions` 저장.
- 발송: **pig-farm-log** `/api/cron/notify-tasks` (GitHub Actions 매 15분 curl).
- `remind_1h`(시간 있는 업무만, 목표 시각 60분 전), `remind_1d`(전날 09:00 KST) 트리거.
- 같은 (task, user, kind)는 `notification_log`로 한 번만 발송.
- **VAPID_PUBLIC_KEY**(공개), **VAPID_PRIVATE_KEY**(비밀), **VAPID_SUBJECT**(mailto:) 는 pig-farm-log Vercel env에 있음.
- GitHub Actions는 `secrets.CRON_SECRET`로 endpoint를 부름. 이 시크릿을 GH `pig-farm-log` 저장소에 Vercel의 CRON_SECRET과 같은 값으로 등록해야 발송이 산다.

## 파일 구조 (work-desk)

- `index.html`: 루트 앱 + `<dialog id="taskDialog">`(폼) + `<dialog id="seriesDialog">`(반복 선택)
- `cloud.html`: 루트 리다이렉트
- `app.js`: 진입점, 이벤트 바인딩, `start()`
- `lib.js`: 순수 함수 (`node --test`)
- `state.js`: 공유 상태 + localStorage 설정
- `supabase.js`: 클라이언트
- `ui.js`: 화면, `renderFamily`, `applyMarketVisibility`, dialog 유틸
- `tasks.js`: `work_tasks` CRUD, 반복, 시리즈 분기
- `projects.js`: `work_projects` CRUD, 이관, 고정 프로젝트
- `family.js`: 가족 CRUD, `loadFamily` 소급 태그
- `settings.js`: `work_settings` (show_market, show_notes, market_symbols)
- `market.js`: 시세 카드(`pig_price` 실데이터) + 투자 링크 + `sparkline()` 공용
- `ticker.js`: 투자 지표 실시간 타일·관심 목록 편집 (pig-farm-log `/api/market/*`)
- `notify.js`: 푸시 구독/해제, VAPID 공개키
- `sw.js`: 서비스워커 (push/notificationclick)
- `styles.css`: 초록/카키/연두 팔레트 (`--blue`=`#2f7a3d`), 다크모드, dialog·FAB·spark-svg
- `icons/`: 나무 + 가족 아이콘(SVG + 180/192/512 PNG)
- `site.webmanifest`: PWA (name "우리집 데스크", short "우리집")
- `supabase-setup.sql`: 모든 테이블·RLS·RPC 참고 SQL
- `vercel.json`: 정적 배포 + `/` 캐시 무시
- `tests/lib.test.mjs`: 순수 함수 테스트 (2026-09-12 기준 23개 pass)
- `docs/superpowers/specs/`, `docs/superpowers/plans/`: 오늘 진행한 스펙·계획

## 파일 구조 (pig-farm-log — 알림·시세 서버측)

- `app/api/cron/notify-tasks/route.ts`: work_tasks 순회 → push_subscriptions 로 발송 → notification_log 기록. `CRON_SECRET` 필요.
- `app/api/cron/pig-price/route.ts`: 축평원 돼지 도매가 수집(기존).
- `.github/workflows/notify-tasks.yml`: 매 15분 curl (Vercel Hobby cron 제약 우회).
- `vercel.json`: notify-tasks는 여기 없음. 있으면 배포 실패.

## 2026-09-12 세션에서 알게 된 함정

1. Supabase Auth의 Site URL이 옛 배포 스냅샷 주소면 로그인 후 옛 코드로 튕긴다. Site URL/Redirect URLs는 `https://my-work-desk.vercel.app`.
2. `.overlay{display:grid}`가 `[hidden]`을 덮으면 로그인 후 오버레이가 안 사라진다 → `.overlay[hidden]{display:none}` 필수.
3. Chrome 152에서 `<dialog>`의 `close` 이벤트가 안 오는 경우가 있다. 선택 판정은 form `submit`/`cancel`로. (`askSeriesScope`)
4. iOS Safari의 date/time 입력은 고유 min-width가 있어 `min-width:0` + `appearance:none` 필요.
5. 캘린더 셀이 긴 제목 때문에 화면보다 넓어짐 → `grid-template-columns: repeat(7, minmax(0,1fr))` + `.day{min-width:0;overflow:hidden}`.
6. Claude-in-Chrome의 `javascript_tool`은 페이지에 modal dialog가 열리면 CDP evaluate가 45s 타임아웃되기 쉽다. 결과는 다음 호출에서 상태를 읽어 회수.
7. `crypto.randomUUID()`는 secure context(HTTPS/localhost)에서만 동작.
8. **pig-farm-log의 GitHub push는 `jskim1@woosung.kr` author 이메일이 아니면 Vercel이 배포 안 함** (yuhaABBA GitHub 계정이 Vercel `jisoo kim's projects` 팀 멤버가 아니어서). 로컬에서 `git config user.email` 확인 필수.
9. **Vercel Hobby는 한 크론이 하루 1회 초과면 배포 자체 실패.** 여러 번 실행이 필요한 크론은 GitHub Actions로.
10. Vercel Dashboard의 시크릿 등록은 자동 모드가 막는다(Secret-Store Writes). 사용자가 직접.
11. Supabase Dashboard SQL Editor는 편집기에 타이핑 + Run 클릭이 통과됨. 자동 모드가 `javascript_tool`로 SQL 문자열을 주입하는 것은 막힘.

## 지금 열린 항목 (우선순위 순)

1. **CRON_SECRET을 GitHub `pig-farm-log` 저장소 시크릿으로 등록** — 이거만 하면 푸시 알림 라이브. Vercel과 같은 값이어야 함. https://github.com/YuhaABBA2/pig-farm-log/settings/secrets/actions
2. 한우 실시간 시세 (축평원 `/user/grade/auct/cattle` API). 새 크론 `/api/cron/cattle-price` + `cattle_price` 테이블 or 확장. 응답 구조가 돼지와 다르니 실제 응답 보고 반복 필요.
3. 육계·계란 산지가격 — ekapepia 스크래핑(불안정) 또는 협회 사이트. 별도 스펙.
4. 모바일 캘린더 주간 뷰(더 촘촘).
5. 알림 발송 안정성 모니터링 (실패 로그 대시보드, dead subscription cleanup 반복).

## 최근 커밋 (work-desk)

- `8f04b87` 시세 카드에 실제 돼지 도매가
- `3684f6c` 초록/카키/연두 팔레트
- `8f040a5` 앱 이름 "우리집 데스크" + 아이콘
- `13a14be` 로그인 시 가족 일정 소급 태그
- `93e5e99` 가족과 공유 태그
- `490437f` "관리자" → "가장"
- `b8c8792` 가족 공유 보안 4건
- `946f0bc` 가족 카드 + 시세·투자 토글
- `5948916` 폼을 모달 다이얼로그로
- `b7f4a65` Web Push 구독 클라이언트

## 최근 커밋 (pig-farm-log)

- `975d5d9` notify-tasks 크론을 GitHub Actions로
- `f926c88` 재배포 (author fix)
- `e39e898` 우리집 데스크 알림 발송 크론

## 마지막 검증

- `npm test` 23/23 pass
- `node --check` 모든 모듈 clean
- 브라우저 콘솔 에러 0개 (라이트/다크, 로그인 유/무, 데스크톱/폰 시뮬)
- 2계정 검증(가족 만들기·참여·공유·수정·완료·나가기·RLS steal 시도 거부)
