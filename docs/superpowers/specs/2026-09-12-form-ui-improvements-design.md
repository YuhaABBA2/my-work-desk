# 폼/UI 개선 설계 (기간·하루종일·알림 시점·프로젝트 색상·고정 프로젝트)

날짜: 2026-09-12
대상: `YuhaABBA2/my-work-desk` (정적 Vercel, Supabase Auth + `work_tasks`/`work_projects`, ES 모듈, `npm test`)
선행: `2026-09-12-work-data-sync-design.md` (프로젝트 동기화, 반복 시리즈) — 프로덕션 반영 완료

## 배경 / 요청

폰에서 쓰면서 나온 요청 여섯 가지를 한 번에 처리한다.

1. 일정에 **기간**(시작일~종료일)을 줄 수 있어야 한다.
2. 시간 대신 **하루종일**을 고를 수 있어야 한다.
3. 반복이 "없음"일 때 **횟수칸 `1`**이 덩그러니 보이는 것을 없앤다.
4. 일정마다 **알림 시점**(1시간 전 / 하루 전, 둘 다 가능)을 저장한다. 실제 발송은 별도 스펙(푸시).
5. **프로젝트별 색상** — 체크박스와 캘린더 점이 프로젝트에 따라 다른 색.
6. **고정 프로젝트 3개**: 회사 업무 · 개인 일정 · 가족 일정. 삭제 불가. (가족 공유 스펙의 토대)

## 범위 밖

- 알림 실제 발송(Web Push, 크론) — 다음 스펙.
- 가족 공유(RLS) — 다음 스펙. 여기서는 "가족 일정" 프로젝트만 만들어 둔다.
- 프로젝트 색을 사용자가 직접 고르는 기능. 이름에서 결정한다.
- 기간 일정을 "이후 모두"로 옮기는 것. 날짜 규칙은 기존과 같다(해당 회차만).
- 프로젝트 이름 변경.

## 데이터 모델

### `work_tasks` 컬럼 추가

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `end_date` | `date null` | 종료일. null이면 하루짜리. `check (end_date is null or end_date >= task_date)` |
| `remind_1h` | `boolean not null default false` | 1시간 전 알림 |
| `remind_1d` | `boolean not null default false` | 하루 전 알림 |

**하루종일**은 컬럼 없이 `task_time = null`로 표현한다. 폼의 "하루종일" 체크박스는 시간칸을 비우고 잠그는 UX일 뿐이다.

### SQL (`supabase-setup.sql`에 추가)

```sql
alter table public.work_tasks add column if not exists end_date date;
alter table public.work_tasks add column if not exists remind_1h boolean not null default false;
alter table public.work_tasks add column if not exists remind_1d boolean not null default false;
alter table public.work_tasks drop constraint if exists work_tasks_end_after_start;
alter table public.work_tasks add constraint work_tasks_end_after_start
  check (end_date is null or end_date >= task_date);
```

기존 행은 `end_date` null, 알림 false → 지금과 똑같이 보인다.

### 고정 프로젝트

- `lib.js` 상수 `FIXED_PROJECTS = ['회사 업무', '개인 일정', '가족 일정']`. `PROJECT_DEFAULTS`는 이 3개로 바뀐다(기존 4개 목록 폐기).
- 로그인 후 `loadProjects()` 성공 시 `ensureFixedProjects()`: `work_projects`에 없는 고정 이름을 `sort_order` 0·1·2로 insert (`upsert … onConflict: 'user_id,name', ignoreDuplicates: true`). 기존 사용자의 "투자 · 자산", "Work Station" 등은 사용자 프로젝트로 그대로 남는다.
- 고정 프로젝트 칩에는 × 버튼이 없다. `deleteProject(name)`은 고정 이름이면 `new Error('기본 프로젝트는 삭제할 수 없습니다.')`를 돌려준다.
- 정렬: 고정 3개가 항상 앞(`sort_order` 0~2), 나머지는 기존 순서. 목록을 그릴 때 `FIXED_PROJECTS` 순서 → 나머지 `sort_order` 순으로 정렬한다(기존 행의 sort_order를 고치지 않는다).

### 프로젝트 색상

저장하지 않고 이름에서 결정한다. `lib.js`:

```js
export const PROJECT_COLORS = {
  '회사 업무': '#0a84ff',   // 파랑
  '개인 일정': '#248a5b',   // 초록
  '가족 일정': '#f0730a'    // 주황
};
export const PALETTE = ['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280']; // 보라·분홍·청록·황토·회색
export function projectColor(name) {
  if (PROJECT_COLORS[name]) return PROJECT_COLORS[name];
  const s = String(name || '');
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
```

같은 이름은 어느 기기에서도 같은 색. 프로젝트가 없는 업무(`미분류`)는 회색(`#6b7280`)으로 고정한다(`projectColor(null)`이 회색을 돌려주도록 `'' → PALETTE[4]` 처리).

## 입력 폼

```
제목
[시작일            ] [종료일 (선택)      ]
[시간              ] [☐ 하루종일         ]
[우선순위 ▾        ] [프로젝트 ▾         ]
[반복 없음 ▾       ] [횟수]                 ← 반복 없음이면 횟수칸 숨김
알림  ☐ 1시간 전  ☐ 하루 전
메모
```

- **종료일** 비우면 하루짜리. 종료일 < 시작일이면 저장하지 않고 `alert('종료일은 시작일보다 앞설 수 없습니다.')`.
- **하루종일** 체크 → `#time` 비우고 `disabled`. 해제 → `disabled` 풀림. 저장 시 시간이 비어 있으면 체크 여부와 무관하게 `task_time = null`(=하루종일). 수정 폼을 열 때 시간이 null이면 체크 상태로 보여 준다.
- **프로젝트**는 `<select id="project">`. 옵션 = 정렬된 프로젝트 목록. 기본 선택 "개인 일정". 수정 중인 업무의 `project`가 목록에 없으면(예: 옛 이름, null→"미분류") 그 값을 임시 옵션으로 추가해 선택 상태로 보여 준다. 새 이름은 "프로젝트 관리" 카드에서만 추가한다. `<datalist id="projects">`는 제거.
- **횟수칸**: CSS `.form-row:has(#repeat option[value=none]:checked) #repeatCount{display:none}` + 같은 조건에서 행을 1열로. JS 변경 없음.
- **알림**: 체크박스 두 개(`#remind1h`, `#remind1d`). 하루종일이면 `#remind1h`를 해제하고 `disabled`.
- **반복 + 기간**: 각 회차가 같은 길이를 유지한다. `occurrenceDates`가 만든 시작일마다 `end_date = 시작일 + (원래 종료일 − 원래 시작일)`.
- 시간 5분 단위(`step="300"`) 유지.

## 표시 규칙

**마감일** `dueDate(t) = t.endDate ?? t.date`. "언제까지" 판단은 전부 이 값.

| 화면 | 규칙 |
|---|---|
| 오늘 해야 할 일 | `t.date ≤ 오늘 ≤ dueDate(t)` |
| 이번 주 마감 | 미완료 + `오늘 ≤ dueDate(t) ≤ 오늘+7` |
| 마감 임박 배지 | `diff = dueDate − 오늘`. diff<0 "지남", `t.date < 오늘 ≤ dueDate` 이고 diff>0 "진행중", diff=0 "오늘", diff≤3 "N일" |
| 마감 임박 알림 카드/버튼 | 미완료 + `dueDate ≤ 오늘+3` |
| 월간 캘린더 | `t.date ≤ 날짜 ≤ dueDate(t)`인 모든 칸에 표시. 점 색 = `projectColor(t.project)` |

**업무 카드**
- 체크박스 `style="accent-color:<색>"`.
- 메타: `[9/14 ~ 9/16 ·] [HH:MM | 하루종일] · 프로젝트 [· 메모]`. 하루짜리는 날짜 생략. `task_time` null이면 "하루종일".
- 배지: 우선순위 + "반복"(시리즈) + **"알림"**(`remind_1h || remind_1d`, `title` 속성에 "1시간 전 · 하루 전").

**프로젝트 칩·진행 목록**: 이름 앞에 색 점(`<i class="dot-color" style="background:<색>">`). 고정 3개는 × 없음.

**반복 시리즈 "이후 모두"**: 제목·시간(하루종일 포함)·우선순위·프로젝트·메모·`remind_1h`·`remind_1d`는 시리즈에 적용. `task_date`·`end_date`는 해당 회차에만.

## 코드 변경 위치

| 파일 | 변경 |
|---|---|
| `supabase-setup.sql` | 컬럼 3개 + check |
| `lib.js` | `FIXED_PROJECTS`, `PROJECT_DEFAULTS` 교체, `PROJECT_COLORS`/`PALETTE`/`projectColor`, `dueDate(t)`, `spansDay(t, iso)`, `dueState(t, todayIso)`('past'/'ongoing'/'today'/'soon:N'/''), `shiftEndDate(startIso, endIso, newStartIso)`, `splitSeriesEdit`에서 `end_date`도 분리, `sortProjects(names)` |
| `state.js` | 변경 없음 |
| `projects.js` | `ensureFixedProjects()`, `deleteProject` 고정 이름 거부, `loadProjects`가 `sortProjects` 적용 |
| `tasks.js` | `load()` 매핑에 `endDate`, `remind1h`, `remind1d`; `readForm()`에 종료일·하루종일·알림; 종료일 검증; 반복 시 `end_date` 이동; 시리즈 필드에 알림 포함 |
| `ui.js` | 폼(select 옵션 채우기, 하루종일 토글, 수정 폼 채우기), `taskHTML`(색·메타·알림 배지), `render`/`calendar`의 기간 규칙, 칩 색 점·고정 × 제거 |
| `app.js` | `start()`에서 `ensureFixedProjects()` 호출, 하루종일/반복 change 핸들러 바인딩 |
| `index.html` | 폼 마크업(종료일, 하루종일, select, 알림) |
| `styles.css` | 횟수칸 숨김 `:has`, 색 점, 알림 배지, 진행중 배지, 폼 행 |
| `tests/lib.test.mjs` | 새 순수 함수 테스트 |

## 마이그레이션·에러·검증

- SQL을 먼저 적용한다(Supabase SQL Editor). 코드가 먼저 나가면 `end_date` 컬럼 없음으로 저장이 실패하므로 순서를 지킨다. SQL은 두 번 실행해도 안전하다.
- 기존 사용자: 로그인 시 고정 프로젝트가 자동 생성되고, 기존 프로젝트·업무는 손대지 않는다. `PROJECT_DEFAULTS` 변경은 신규 사용자 이관에만 영향.
- Supabase 에러는 기존 패턴대로 `alert`.
- **테스트(`npm test`)**: `projectColor` 고정 3색·결정성·`null`→회색, `dueDate`, `spansDay` 경계(시작일·종료일·밖), `dueState` 5분기, `shiftEndDate`, `splitSeriesEdit`가 `end_date`도 분리, `sortProjects`가 고정 3개를 앞에.
- **프로덕션 화면 검증**: (1) 9/14~9/16 기간 일정 생성 → 캘린더 3칸 표시, 오늘이 기간 안이면 오늘 목록에 뜸, 메타에 `9/14 ~ 9/16`; (2) 하루종일 체크 → 시간칸 잠김, 저장 후 "하루종일" 표기, "1시간 전" 비활성; (3) 반복 "없음"에서 횟수칸 안 보임, "매주"로 바꾸면 보임; (4) 알림 두 개 체크 → "알림" 배지; (5) 고정 3개 칩에 × 없음, 회사/개인/가족 업무의 체크박스 색이 서로 다름(스크린샷); (6) 종료일 < 시작일 → 저장 거부; (7) 기존 업무(종료일 없음)가 이전과 같게 보임.
