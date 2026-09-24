# 홈화면 월 달력 위젯 (안드로이드 + 아이폰) — 설계

작성 2026-09-23. 요구자는 와이프(안드로이드), 지수님도 같이 씀(아이폰).

## 무엇을 왜

홈화면에서 앱을 열지 않고 **월 달력 + 이번 주 일정**을 본다.
보이는 범위는 **자기 개인·업무·가족 일정 + 가족이 공유한 타인의 개인·업무 일정** —
`work_tasks` RLS(`user_id = 나` 또는 `family_id in 내 가족`)와 같다.

### 배치: 「이번 주 줄만 키우기」 (시안 Ⓒ)

한 달 전체를 점으로 그리되, **이번 주 행만 높이를 키워 일정 제목을 칸 안에 직접** 넣는다.
나머지 주는 날짜 + 프로젝트 색 점만.

- 크기 4×4 칸 기준 (안드로이드), 아이폰은 large
- 한 칸에 **2건까지** 표시, 3건째부터 `＋N`
- 제목은 앞에서 자른다. 시간이 있으면 시간을 앞에 둔다
- 오늘은 초록 원(`--green #2f7a3d`), 이번 주 행은 연초록 밴드
- 프로젝트 색은 `lib.js`의 `projectColor()` 그대로:
  회사 업무 `#0a84ff` · 개인 일정 `#f0730a` · 가족 일정 `#2f7a3d`
- 주 시작은 **일요일** (`lib.js`의 `DOW`와 같다)

시안: https://claude.ai/artifact/JLekBRmVMEJzqgwoJj5z88

### 버린 것과 그 이유

- **구글 캘린더 / TimeTree 경유** — 위젯으로 직접 보므로 중간 경유지가 불필요해졌다.
  덧붙여 TimeTree 공개 API는 2023-12-22에 종료됐고, TimeTree의 "구글 캘린더 연동"은
  기기 캘린더를 *겹쳐 보여주기*일 뿐 공유 캘린더로 들어가지 않는다.
- **ICS 구독 피드** — 구글 캘린더가 외부 ICS를 다시 읽는 주기가 8~24시간이고 강제 갱신이 없다.
  오늘 할 일을 다루는 데 못 쓴다.
- **TWA로 안드로이드 앱 감싸기** — Digital Asset Links 검증이 붙는데,
  이미 PWA를 홈화면에 깔아 쓰므로 얻는 것이 없다.

## 구조

```
  안드로이드 위젯 ┐
                ├→ GET /api/widget?token=…   (pig-farm-log, Vercel)
  아이폰 위젯    ┘       │
                        ├ token → user_id
                        ├ 볼 수 있는 일정 조회 (service_role)
                        └ 달력을 PNG로 그려 반환
```

**서버가 그림을 그린다.** 위젯은 이미지 하나만 띄운다.

- 디자인이 한 벌로 끝난다 (Kotlin·JS 두 벌로 그리지 않는다)
- **위젯 모양을 고쳐도 APK 재설치가 필요 없다** — 서버만 배포하면 즉시 반영
- 대가: 날짜 칸별 탭은 불가. 위젯 전체 탭 = 앱 열기

## 데이터

### `widget_tokens` (신규, Supabase)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `token` | text PK | 32바이트 랜덤 base64url |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `created_at` | timestamptz default now() | |
| `last_used_at` | timestamptz | 서버가 갱신 |

- **계정당 1개만 산다.** 재발급하면 옛 행을 지우고 새로 넣는다 (폐기 = 행 삭제)
- RLS: 본인 행만 select/delete. **insert는 막는다** — 클라가 토큰 값을 고르면 안 된다
- 발급은 **`issue_widget_token()` RPC**(security definer, 로그인 사용자만).
  옛 행을 지우고 서버가 고른 랜덤 값으로 새 행을 넣은 뒤 그 토큰을 돌려준다.
  `create_family`·`join_family`와 같은 패턴이다
- 위젯 요청은 service_role로 조회하므로 RLS를 타지 않는다

### 기존 테이블 변경 없음

`work_tasks`·`families`·`family_members`는 그대로 쓴다.

## 서버 — `/api/widget` (pig-farm-log)

```
GET /api/widget?token=…&w=320&h=250&theme=dark&dpr=3&t=<ms>
→ 200 image/png
→ 401 (토큰 없음/폐기됨)  ※ 본문에 토큰·키를 절대 싣지 않는다 (lib/redact.ts 경유)
```

- `Cache-Control: no-store`. 안드로이드 이미지 캐시를 피하려고 호출 측이 `t`를 붙인다
- `w`·`h`·`dpr`로 기기 실제 픽셀에 맞춰 그린다 (흐릿함 방지)
- `theme`은 `light`|`dark`. 호출 측이 기기 설정을 넘긴다
- 렌더는 `@napi-rs/canvas`. **한글 TTF를 저장소에 넣고 `GlobalFonts`로 등록한다**
  — 빠뜨리면 날짜 숫자만 나오고 제목이 `□□□`가 된다

### ⚠️ RLS 우회 지점

service_role로 조회하면 "본인 또는 내 가족" 규칙이 걸리지 않아 **조건을 손으로 다시 쓰게 된다.**
이 저장소에서 같은 규칙을 여러 자리에 적었다가 한쪽만 늙은 전례가 있다.

그래서 **가시성 조건은 순수 함수 한 벌**(`visibleTaskFilter(userId, familyIds)`)로 떼어내고
테스트를 붙인다. 규칙이 바뀌면 테스트가 먼저 깨진다.

## 화면 — 앱의 "위젯 연결" 카드 (my-work-desk)

설정 영역에 카드 하나.

- 토큰이 없으면 **[위젯 주소 만들기]** 버튼
- 있으면 주소를 마스킹해 보여주고 **[복사]** · **[새로 만들기]** · **[폐기]**
- 복사 버튼 아래 한 줄 안내: 아이폰은 Scriptable, 안드로이드는 앱 설치
- ⚠️ 경고 문구를 같이 둔다: **이 주소를 아는 사람은 내 달력 그림을 볼 수 있습니다.**
  새로 만들면 예전 주소는 즉시 막힙니다.

## 위젯 앱

### 안드로이드 (`my-work-desk/android/`, 신규)

- 화면 하나: 토큰 주소 붙여넣기 → 저장. `EncryptedSharedPreferences`에 보관
- `CalendarWidgetProvider` (AppWidgetProvider): 이미지를 받아 `setImageViewBitmap`
- 기본 4×4, 크기 조절 허용. `onAppWidgetOptionsChanged`에서 실제 dp를 읽어 `w`·`h`에 넘긴다
- 갱신: 30분 주기(안드로이드 하한) + **자정 날짜 변경 알람** + 위젯 구석 새로고침 버튼
- 빌드: GitHub Actions `assembleRelease` → 서명 키는 Secrets → APK를 Release에 첨부.
  저장소가 공개라 Actions는 무료
- 설치: 폰에서 Release의 APK 내려받아 설치 (「알 수 없는 앱 설치」 1회 허용)

### 아이폰 (`widget/ios/home-desk.js`, 신규)

Scriptable(무료) 스크립트 한 개. 토큰 주소로 PNG를 받아 `ListWidget`에 얹는다.
위젯 크기는 **large** — 월 달력은 medium에 들어가지 않는다.
갱신 시점은 iOS가 정한다(대략 15분~1시간, 보장 없음).

설치 안내를 스크립트 주석 맨 위에 순서대로 적는다.

## 순수 함수 (테스트 대상)

| 함수 | 무엇 | 어디 |
|---|---|---|
| `monthGrid(year, month)` | 주×7일 칸 배열(그 달에 필요한 5~6주), 앞뒤 달 채움 | `lib.js` |
| `weekRowIndex(grid, today)` | 이번 주가 몇 번째 행인지 | `lib.js` |
| `visibleTaskFilter(userId, familyIds)` | 볼 수 있는 일정 조건 | pig-farm-log `lib/` |
| `cellEntries(tasks, date, max)` | 칸에 넣을 항목 + 넘침 개수 | `lib.js` |

## 완료 기준

1. `npm test` 통과 — 위 순수 함수 4종, 특히:
   - 2026-09 배치가 실제와 일치 (1일 화요일, 30일까지, 이번 주 = 20~26)
   - **6주가 필요한 달**(1일이 금·토이면서 31일까지인 달)에서도 칸이 안 잘린다
   - 남의 비공유 일정이 새면 **깨진다**
   - 하루 3건 이상이면 `＋N`
2. PNG를 실제로 열어 **눈으로** 확인:
   - 한글 제목이 `□□□`가 아니다
   - 밝은 테마·어두운 테마 두 장 다
   - 일정 0건인 달에도 안 깨진다
3. 토큰을 폐기한 뒤 그 주소가 401이고, **본문에 토큰·키가 없다**
4. 실기기: 지수님 아이폰(Scriptable), 와이프 안드로이드(APK)
5. reviewer 서브에이전트 APPROVE

## 배포 순서

**서버(pig-farm-log)를 먼저** 배포하고 앱(my-work-desk)을 올린다.
거꾸로 하면 앱에서 주소는 발급되는데 그 주소가 404가 된다.

⚠️ `pig-farm-log`는 커밋 author 이메일이 `jskim1@woosung.kr`이어야 Vercel이 배포한다.

## 파일

| 저장소 | 파일 | 신규/수정 |
|---|---|---|
| my-work-desk | `supabase-setup.sql` | 수정 — `widget_tokens` |
| my-work-desk | `settings.js`, `ui.js`, `styles.css` | 수정 — 위젯 연결 카드 |
| my-work-desk | `lib.js`, `tests/lib.test.mjs` | 수정 — 순수 함수 3종 |
| my-work-desk | `android/**` | 신규 |
| my-work-desk | `.github/workflows/android.yml` | 신규 |
| my-work-desk | `widget/ios/home-desk.js` | 신규 |
| pig-farm-log | `app/api/widget/route.ts` | 신규 |
| pig-farm-log | `lib/widget-render.ts`, `lib/widget-visibility.ts` | 신규 |
| pig-farm-log | `public/fonts/*.ttf` | 신규 — 한글 글꼴 |
