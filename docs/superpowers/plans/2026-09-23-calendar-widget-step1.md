# 홈화면 달력 위젯 — STEP 1 (서버가 그림을 그린다) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 토큰이 든 주소를 열면 그 사람이 볼 수 있는 이번 달 달력이 PNG 그림으로 나오게 한다.

**Architecture:** 달력 계산과 가시성 판정을 순수 함수로 먼저 만들고(테스트 먼저), 그 위에 canvas 렌더러를 얹고, 마지막에 라우트가 셋을 엮는다. 토큰 발급은 Supabase RPC, 앱에는 발급·폐기 카드를 붙인다.

**Tech Stack:** Next.js 14 App Router / TypeScript / Node 24 `node --test` / `@napi-rs/canvas` / Supabase

스펙: `docs/superpowers/specs/2026-09-23-calendar-widget-design.md`

## Global Constraints

- **저장소가 둘이다.** 서버 코드는 `C:\Projects2\pig-farm-log`, 앱 코드는 `C:\projects\my-work-desk`. 두 저장소는 **서로 import할 수 없다.**
- `pig-farm-log` 테스트: `npm run test:unit` (`node --test "tests/unit/**/*.test.ts"`). import는 `../../lib/foo.ts`처럼 **확장자까지** 적는다.
- `pig-farm-log`는 **실제 농장이 매일 쓰는 상용 서비스**다. 기존 라우트·테이블을 건드리지 않는다.
- **service_role 키를 코드·문서·커밋 메시지에 절대 두지 않는다.** 환경변수로만.
- 에러 응답에 토큰·키가 섞이지 않게 기존 `lib/redact.ts`를 경유한다.
- `my-work-desk`는 순수 JS ES 모듈. 테스트는 `npm test` (`tests/lib.test.mjs`).
- **main 직접 push 금지.** 브랜치 `feat/home-calendar-widget`. 커밋과 push는 **별도 명령**으로.
- `pig-farm-log` 커밋 author 이메일은 `jskim1@woosung.kr` 이어야 Vercel이 배포한다.
- 색은 앱 값 그대로: 회사 업무 `#0a84ff` · 개인 일정 `#f0730a` · 가족 일정 `#2f7a3d` · 오늘 원 `#2f7a3d`.
- 주 시작은 **일요일**.

## File Structure

| 파일 | 책임 |
|---|---|
| `pig-farm-log/lib/widget-calendar.ts` | 달력 격자·이번 주 행·칸 항목. **DOM도 DB도 모른다** |
| `pig-farm-log/lib/widget-visibility.ts` | 누가 무엇을 볼 수 있는지. **이 판정의 유일한 자리** |
| `pig-farm-log/lib/widget-render.ts` | 위 결과를 canvas에 그려 PNG 버퍼를 낸다 |
| `pig-farm-log/app/api/widget/route.ts` | 토큰 확인 → 조회 → 렌더 → 응답 |
| `my-work-desk/settings.js` | 위젯 주소 발급·복사·폐기 |
| `my-work-desk/app.js` | `?d=` 읽어 그 날짜 창 열기 |

---

### Task 1: 달력 격자 (`monthGrid`)

**Files:**
- Create: `C:\Projects2\pig-farm-log\lib\widget-calendar.ts`
- Test: `C:\Projects2\pig-farm-log\tests\unit\widget-calendar.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type Cell = { iso: string; other: boolean }`
  - `function monthGrid(year: number, month1to12: number): Cell[][]`
    — 주 단위 배열. 각 주는 정확히 7칸, 일요일 시작.
    `other`는 그 달이 아닌 앞뒤 달 칸. **다음 달 칸으로만 이뤄진 마지막 주는 버린다.**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/widget-calendar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid } from "../../lib/widget-calendar.ts";

test("2026년 9월은 5주다 — 1일이 화요일, 30일까지", () => {
  const weeks = monthGrid(2026, 9);
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0].iso, "2026-08-30");   // 첫 칸은 지난달 일요일
  assert.equal(weeks[0][2].iso, "2026-09-01");   // 1일은 화요일 자리
  assert.equal(weeks[0][2].other, false);
  assert.equal(weeks[0][0].other, true);
  assert.equal(weeks[4][3].iso, "2026-09-30");   // 마지막 주 수요일이 30일
});

test("모든 주는 7칸이다", () => {
  for (const y of [2024, 2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
      for (const w of monthGrid(y, m)) assert.equal(w.length, 7, `${y}-${m}`);
    }
  }
});

test("6주가 필요한 달은 6주를 준다 — 2026년 5월(1일 금요일, 31일까지)", () => {
  const weeks = monthGrid(2026, 5);
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0][5].iso, "2026-05-01");
  assert.equal(weeks[5][0].iso, "2026-05-31");
});

test("다음 달로만 찬 주는 버린다 — 2026년 2월(1일 일요일, 28일까지)", () => {
  const weeks = monthGrid(2026, 2);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[0][0].iso, "2026-02-01");
  assert.equal(weeks[3][6].iso, "2026-02-28");
});

test("그 달 날짜는 하나도 빠지지 않는다", () => {
  const weeks = monthGrid(2026, 9);
  const mine = weeks.flat().filter(c => !c.other).map(c => c.iso);
  assert.equal(mine.length, 30);
  assert.equal(mine[0], "2026-09-01");
  assert.equal(mine[29], "2026-09-30");
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit -- --test-name-pattern="달력|주는|달 날짜"
```

기대: `Cannot find module '../../lib/widget-calendar.ts'` 로 실패.

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/widget-calendar.ts`:

```ts
export type Cell = { iso: string; other: boolean };

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 일요일 시작 월 격자. 다음 달로만 찬 마지막 주는 버린다. */
export function monthGrid(year: number, month1to12: number): Cell[][] {
  const first = new Date(year, month1to12 - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // 그 주 일요일로 되감는다

  const weeks: Cell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      week.push({ iso: isoOf(d), other: d.getMonth() !== month1to12 - 1 });
    }
    // 그 달 날짜가 하나도 없는 주는 만들지 않는다 (= 다음 달로만 찬 주)
    if (week.every(c => c.other) && weeks.length > 0) break;
    weeks.push(week);
  }
  return weeks;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: 위 5개 테스트 PASS, 기존 테스트도 전부 PASS.

- [ ] **Step 5: 커밋한다**

```bash
cd /c/Projects2/pig-farm-log && git checkout -b feat/home-calendar-widget
git add lib/widget-calendar.ts tests/unit/widget-calendar.test.ts
git commit -m "feat(위젯): 월 달력 격자 순수 함수

일요일 시작, 다음 달로만 찬 마지막 주는 버린다.
2026-09(5주)·2026-05(6주)·2026-02(4주)로 경계를 고정한다."
```

---

### Task 2: 이번 주 행과 칸 항목 (`weekRowIndex`, `cellEntries`)

**Files:**
- Modify: `C:\Projects2\pig-farm-log\lib\widget-calendar.ts`
- Modify: `C:\Projects2\pig-farm-log\tests\unit\widget-calendar.test.ts`

**Interfaces:**
- Consumes: `Cell`, `monthGrid` (Task 1)
- Produces:
  - `type WidgetTask = { id: string; title: string; date: string; endDate: string | null; time: string | null; project: string | null; familyId: string | null; ownerId: string }`
  - `function weekRowIndex(weeks: Cell[][], todayIso: string): number` — 없으면 `-1`
  - `function cellEntries(tasks: WidgetTask[], dayIso: string, max: number): { shown: WidgetTask[]; overflow: number }`
    — 시간 있는 것이 먼저, 그다음 제목 사전순. 기간 일정은 걸친 모든 날에 들어간다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** (파일 끝에 덧붙인다)

```ts
import { weekRowIndex, cellEntries, type WidgetTask } from "../../lib/widget-calendar.ts";

const T = (o: Partial<WidgetTask> & { id: string; title: string; date: string }): WidgetTask => ({
  endDate: null, time: null, project: null, familyId: null, ownerId: "me", ...o,
});

test("오늘이 속한 주 행을 찾는다 — 2026-09-23은 4번째 행(0부터)", () => {
  assert.equal(weekRowIndex(monthGrid(2026, 9), "2026-09-23"), 3);
});

test("그 달에 없는 날이면 -1", () => {
  assert.equal(weekRowIndex(monthGrid(2026, 9), "2026-12-01"), -1);
});

test("앞뒤 달 칸에 걸린 오늘도 찾는다 — 2026-08-30은 9월 격자 첫 행", () => {
  assert.equal(weekRowIndex(monthGrid(2026, 9), "2026-08-30"), 0);
});

test("칸에 max까지만 넣고 나머지는 넘침으로 센다", () => {
  const tasks = [
    T({ id: "1", title: "팀 회의", date: "2026-09-23", time: "14:00" }),
    T({ id: "2", title: "치과", date: "2026-09-23", time: "18:30" }),
    T({ id: "3", title: "장보기", date: "2026-09-23" }),
    T({ id: "4", title: "독서", date: "2026-09-23" }),
  ];
  const r = cellEntries(tasks, "2026-09-23", 2);
  assert.deepEqual(r.shown.map(t => t.id), ["1", "2"]);
  assert.equal(r.overflow, 2);
});

test("시간 있는 것이 먼저, 시간끼리는 이른 것이 먼저", () => {
  const tasks = [
    T({ id: "a", title: "가나", date: "2026-09-23" }),
    T({ id: "b", title: "나다", date: "2026-09-23", time: "18:30" }),
    T({ id: "c", title: "다라", date: "2026-09-23", time: "09:00" }),
  ];
  assert.deepEqual(cellEntries(tasks, "2026-09-23", 5).shown.map(t => t.id), ["c", "b", "a"]);
});

test("시간 없는 것끼리는 제목 사전순", () => {
  const tasks = [
    T({ id: "z", title: "하하", date: "2026-09-23" }),
    T({ id: "a", title: "가가", date: "2026-09-23" }),
  ];
  assert.deepEqual(cellEntries(tasks, "2026-09-23", 5).shown.map(t => t.id), ["a", "z"]);
});

test("기간 일정은 걸친 모든 날에 들어간다", () => {
  const tasks = [T({ id: "x", title: "출장", date: "2026-09-22", endDate: "2026-09-24" })];
  for (const d of ["2026-09-22", "2026-09-23", "2026-09-24"]) {
    assert.equal(cellEntries(tasks, d, 5).shown.length, 1, d);
  }
  assert.equal(cellEntries(tasks, "2026-09-25", 5).shown.length, 0);
});

test("넘치지 않으면 overflow는 0", () => {
  const tasks = [T({ id: "1", title: "하나", date: "2026-09-23" })];
  assert.equal(cellEntries(tasks, "2026-09-23", 2).overflow, 0);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: `weekRowIndex is not a function` 류로 실패.

- [ ] **Step 3: 최소 구현을 쓴다** (`lib/widget-calendar.ts` 끝에 덧붙인다)

```ts
export type WidgetTask = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  project: string | null;
  familyId: string | null;
  ownerId: string;
};

/** 오늘이 몇 번째 주 행인지. 그 격자에 없으면 -1. */
export function weekRowIndex(weeks: Cell[][], todayIso: string): number {
  return weeks.findIndex(w => w.some(c => c.iso === todayIso));
}

function spansDay(t: WidgetTask, dayIso: string): boolean {
  return t.date <= dayIso && dayIso <= (t.endDate || t.date);
}

/** 시간 있는 것 먼저(이른 순), 그다음 제목 사전순. max까지만 보여주고 나머지는 센다. */
export function cellEntries(
  tasks: WidgetTask[],
  dayIso: string,
  max: number,
): { shown: WidgetTask[]; overflow: number } {
  const hit = tasks.filter(t => spansDay(t, dayIso)).sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.title.localeCompare(b.title, "ko");
  });
  return { shown: hit.slice(0, max), overflow: Math.max(0, hit.length - max) };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: Task 1·2의 테스트 전부 PASS.

- [ ] **Step 5: 커밋한다**

```bash
cd /c/Projects2/pig-farm-log
git add lib/widget-calendar.ts tests/unit/widget-calendar.test.ts
git commit -m "feat(위젯): 이번 주 행 찾기와 칸 항목 추리기

시간 있는 것이 먼저, 시간끼리는 이른 순, 나머지는 제목 사전순.
기간 일정은 걸친 모든 날에 들어간다. max 넘으면 overflow로 센다."
```

---

### Task 3: 가시성 판정 (`visibleTaskFilter`)

**Files:**
- Create: `C:\Projects2\pig-farm-log\lib\widget-visibility.ts`
- Test: `C:\Projects2\pig-farm-log\tests\unit\widget-visibility.test.ts`

**Interfaces:**
- Consumes: `WidgetTask` (Task 2)
- Produces: `function canSee(t: { ownerId: string; familyId: string | null }, userId: string, familyIds: string[]): boolean`

**왜 이 태스크가 따로인가:** 서버는 service_role로 조회해 RLS를 우회한다. 그래서 "본인 또는 내 가족" 규칙을 손으로 다시 쓰게 되는데, 이 저장소들에는 같은 규칙을 여러 자리에 적었다가 한쪽만 늙은 전례가 있다. **이 판정은 여기 한 곳에만 산다.**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/widget-visibility.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSee } from "../../lib/widget-visibility.ts";

const ME = "user-me", WIFE = "user-wife", STRANGER = "user-x";
const FAM = "fam-1", OTHER_FAM = "fam-2";

test("내 일정은 공유 안 해도 보인다", () => {
  assert.equal(canSee({ ownerId: ME, familyId: null }, ME, [FAM]), true);
});

test("가족이 공유한 일정은 보인다", () => {
  assert.equal(canSee({ ownerId: WIFE, familyId: FAM }, ME, [FAM]), true);
});

test("남의 비공유 일정은 보이지 않는다", () => {
  assert.equal(canSee({ ownerId: WIFE, familyId: null }, ME, [FAM]), false);
});

test("모르는 사람의 비공유 일정은 보이지 않는다", () => {
  assert.equal(canSee({ ownerId: STRANGER, familyId: null }, ME, [FAM]), false);
});

test("다른 가족에 공유된 일정은 보이지 않는다", () => {
  assert.equal(canSee({ ownerId: STRANGER, familyId: OTHER_FAM }, ME, [FAM]), false);
});

test("가족이 없는 사람은 자기 것만 본다", () => {
  assert.equal(canSee({ ownerId: ME, familyId: FAM }, ME, []), true);
  assert.equal(canSee({ ownerId: WIFE, familyId: FAM }, ME, []), false);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: `Cannot find module '../../lib/widget-visibility.ts'`.

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/widget-visibility.ts`:

```ts
/**
 * 위젯이 보여줘도 되는 일정인가.
 *
 * work_tasks RLS(`user_id = auth.uid() or family_id in my_family_ids()`)와 **같은 규칙**이다.
 * 서버는 service_role로 조회해 RLS를 우회하므로 이 함수가 그 자리를 대신한다.
 * 규칙이 바뀌면 여기와 SQL을 같이 고친다 — tests/unit/widget-visibility.test.ts 가 지킨다.
 */
export function canSee(
  t: { ownerId: string; familyId: string | null },
  userId: string,
  familyIds: string[],
): boolean {
  if (t.ownerId === userId) return true;
  return t.familyId !== null && familyIds.includes(t.familyId);
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: 6개 PASS.

- [ ] **Step 5: 커밋한다**

```bash
cd /c/Projects2/pig-farm-log
git add lib/widget-visibility.ts tests/unit/widget-visibility.test.ts
git commit -m "feat(위젯): 가시성 판정 한 벌 — 본인 또는 내 가족

service_role이 RLS를 우회하므로 같은 규칙을 이 함수가 대신한다.
남의 비공유 일정이 새면 테스트가 깨진다."
```

---

### Task 4: `widget_tokens` 테이블과 발급 RPC

**Files:**
- Modify: `C:\projects\my-work-desk\supabase-setup.sql` (파일 끝에 덧붙인다)

**Interfaces:**
- Produces:
  - 테이블 `public.widget_tokens(token text pk, user_id uuid, created_at, last_used_at)`
  - RPC `public.issue_widget_token() returns text` — 옛 행을 지우고 새 토큰을 넣은 뒤 그 값을 반환
  - RPC `public.revoke_widget_token() returns void`

- [ ] **Step 1: SQL을 쓴다**

`supabase-setup.sql` 끝에 덧붙인다:

```sql
-- ---------- 홈화면 위젯 토큰 (2026-09-23) ----------
-- 위젯은 로그인 세션이 없다. 이 토큰이 든 주소 하나로만 신원을 확인한다.
-- 그래서 계정당 1개만 살려두고, 새로 발급하면 옛 것은 즉시 죽는다.
create table if not exists public.widget_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create unique index if not exists widget_tokens_user_idx on public.widget_tokens(user_id);

alter table public.widget_tokens enable row level security;

-- 본인 행만 읽고 지울 수 있다. INSERT/UPDATE는 정책이 없으므로 막힌다
-- (클라가 토큰 값을 직접 고르면 안 된다 — 발급은 아래 RPC가 한다).
drop policy if exists widget_tokens_select on public.widget_tokens;
create policy widget_tokens_select on public.widget_tokens for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists widget_tokens_delete on public.widget_tokens;
create policy widget_tokens_delete on public.widget_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.issue_widget_token()
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  -- search_path가 public뿐이라 스키마를 붙인다. Supabase는 pgcrypto를 extensions 에 둔다.
  t := replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_');
  t := replace(t, '=', '');
  delete from widget_tokens where user_id = auth.uid();
  insert into widget_tokens(token, user_id) values (t, auth.uid());
  return t;
end $$;

create or replace function public.revoke_widget_token()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  delete from widget_tokens where user_id = auth.uid();
end $$;

revoke all on function public.issue_widget_token() from public;
revoke all on function public.revoke_widget_token() from public;
revoke execute on function public.issue_widget_token() from anon;
revoke execute on function public.revoke_widget_token() from anon;
grant execute on function public.issue_widget_token() to authenticated;
grant execute on function public.revoke_widget_token() to authenticated;
```

- [ ] **Step 2: Supabase 대시보드에서 실행한다**

지수님이 직접 해야 하는 단계다. Supabase 프로젝트 `skihcfyndumifhaxamas` → SQL Editor → 위 블록 붙여넣고 Run.

- [ ] **Step 3: 실행 결과를 확인한다**

SQL Editor에서:

> ⚠️ SQL Editor는 postgres 로 돈다 — `auth.uid()`가 null 이라 `issue_widget_token()`을 여기서 부르면
> "로그인이 필요합니다"로 막힌다(정상). 발급·재발급·폐기의 실제 동작은 Task 7에서 앱으로 확인한다.
> 여기서는 **구조와 권한**만 본다.

```sql
select
  (select count(*) from public.widget_tokens)                                              as rows_0,
  (select relrowsecurity from pg_class where oid = 'public.widget_tokens'::regclass)       as rls_on,
  (select count(*) from pg_policies where tablename = 'widget_tokens')                     as policies_2,
  has_function_privilege('anon', 'public.issue_widget_token()', 'execute')                 as anon_issue_false,
  has_function_privilege('authenticated', 'public.issue_widget_token()', 'execute')        as auth_issue_true,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'extensions' and p.proname = 'gen_random_bytes')                    as pgcrypto_in_ext;
```

기대: `rows_0=0 · rls_on=true · policies_2=2 · anon_issue_false=false · auth_issue_true=true · pgcrypto_in_ext≥1`.

- [ ] **Step 4: 커밋한다**

```bash
cd /c/projects/my-work-desk
git add supabase-setup.sql
git commit -m "feat(위젯): widget_tokens 테이블과 발급·폐기 RPC

위젯은 세션이 없어 주소에 든 토큰으로만 신원을 확인한다.
계정당 1개만 살려 새로 발급하면 옛 주소가 즉시 죽는다.
토큰 값은 서버가 고른다 — INSERT 정책을 두지 않아 클라는 못 넣는다."
```

---

### Task 5: PNG 렌더러

**Files:**
- Create: `C:\Projects2\pig-farm-log\lib\widget-render.ts`
- Create: `C:\Projects2\pig-farm-log\assets\fonts\PretendardJP-Regular.ttf`, `PretendardJP-Bold.ttf`
- Test: `C:\Projects2\pig-farm-log\tests\unit\widget-render.test.ts`
- Modify: `C:\Projects2\pig-farm-log\package.json`
- Modify: `C:\Projects2\pig-farm-log\next.config.js`

> **왜 `public/`가 아니라 `assets/`인가:** Vercel은 `public/`을 CDN으로 빼서 서버 함수의 파일시스템에
> 없을 수 있다. 글꼴이 안 읽히면 한글이 □□□가 된다. `assets/`에 두고 `outputFileTracingIncludes`로 함수 번들에 싣는다.

**Interfaces:**
- Consumes: `Cell`, `WidgetTask`, `monthGrid`, `weekRowIndex`, `cellEntries` (Task 1·2)
- Produces:
  - `type RenderOpts = { year: number; month: number; todayIso: string; tasks: WidgetTask[]; width: number; height: number; dark: boolean }`
  - `function renderWidgetPng(o: RenderOpts): Buffer`

**시각 규칙 (스펙 Ⓒ):** 이번 주 행만 키워 제목을 칸 안에 넣는다. 나머지 주는 날짜 + 프로젝트 색 점. 한 칸에 2건까지, 넘치면 `＋N`. 오늘은 초록 원. 이번 주 행 배경은 연초록.

- [ ] **Step 1: 의존성과 글꼴을 넣는다**

```bash
cd /c/Projects2/pig-farm-log && npm install @napi-rs/canvas@0.1.80
mkdir -p assets/fonts
```

`next.config.js`를 이렇게 바꾼다 (기존 `reactStrictMode`는 그대로):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 네이티브 바이너리(.node)를 webpack이 번들하려다 빌드가 깨진다 — 외부 패키지로 둔다.
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
    // 글꼴을 /api/widget 함수 번들에 싣는다.
    outputFileTracingIncludes: { "/api/widget": ["./assets/fonts/**"] },
  },
};
module.exports = nextConfig;
```

글꼴은 Pretendard JP의 Regular·Bold `.ttf` 두 개를 `assets/fonts/`에 넣는다
(https://github.com/orioncactus/pretendard 릴리스의 `Pretendard-1.3.9.zip` 안 `public/static/PretendardJP-Regular.ttf`·`-Bold.ttf`).
**이 단계를 빠뜨리면 숫자만 나오고 한글이 □□□가 된다.**

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/unit/widget-render.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderWidgetPng } from "../../lib/widget-render.ts";
import type { WidgetTask } from "../../lib/widget-calendar.ts";

const base = { year: 2026, month: 9, todayIso: "2026-09-23", width: 320, height: 250, dark: false };
const T = (o: Partial<WidgetTask> & { id: string; title: string; date: string }): WidgetTask => ({
  endDate: null, time: null, project: null, familyId: null, ownerId: "me", ...o,
});

test("PNG 버퍼를 낸다 (매직 넘버 확인)", () => {
  const buf = renderWidgetPng({ ...base, tasks: [] });
  assert.ok(buf.length > 1000, "너무 작다");
  assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test("일정이 하나도 없어도 깨지지 않는다", () => {
  assert.ok(renderWidgetPng({ ...base, tasks: [] }).length > 1000);
});

test("어두운 테마도 낸다", () => {
  assert.ok(renderWidgetPng({ ...base, tasks: [], dark: true }).length > 1000);
});

test("한글 제목이 있어도 낸다", () => {
  const tasks = [T({ id: "1", title: "어린이집 상담", date: "2026-09-21", project: "가족 일정" })];
  assert.ok(renderWidgetPng({ ...base, tasks }).length > 1000);
});

test("한 칸에 일정이 많아도 낸다", () => {
  const tasks = Array.from({ length: 9 }, (_, i) =>
    T({ id: String(i), title: `일정 ${i}`, date: "2026-09-23" }));
  assert.ok(renderWidgetPng({ ...base, tasks }).length > 1000);
});

test("6주짜리 달도 낸다 — 2026-05", () => {
  const buf = renderWidgetPng({ ...base, month: 5, todayIso: "2026-05-15", tasks: [] });
  assert.ok(buf.length > 1000);
});
```

> 테스트는 "깨지지 않는다"까지만 본다. **그림이 예쁜지는 Step 5에서 눈으로 본다** — 픽셀을 테스트로 박으면 디자인을 못 고친다.

- [ ] **Step 3: 실패를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: `Cannot find module '../../lib/widget-render.ts'`.

- [ ] **Step 4: 구현을 쓴다**

`lib/widget-render.ts`:

```ts
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { monthGrid, weekRowIndex, cellEntries, type WidgetTask } from "./widget-calendar.ts";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "PretendardJP-Regular.ttf"), "WidgetSans");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "PretendardJP-Bold.ttf"), "WidgetSansBold");
  fontsReady = true;
}

const PROJECT_COLORS: Record<string, string> = {
  "회사 업무": "#0a84ff",
  "개인 일정": "#f0730a",
  "가족 일정": "#2f7a3d",
  "가족일정": "#2f7a3d",
};
const PALETTE = ["#7c5cff", "#d63384", "#0aa5a0", "#b8860b", "#6b7280"];
function projectColor(name: string | null): string {
  if (!name) return "#6b7280";
  if (PROJECT_COLORS[name]) return PROJECT_COLORS[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type Theme = {
  paper: string; ink: string; muted: string; line: string;
  green: string; band: string; sun: string; onGreen: string;
};
const LIGHT: Theme = {
  paper: "#ffffff", ink: "#1c2b1c", muted: "#7d8875", line: "#dbe2d0",
  green: "#2f7a3d", band: "rgba(47,122,61,0.12)", sun: "#c44536", onGreen: "#ffffff",
};
const DARK: Theme = {
  paper: "#191d16", ink: "#eff3e8", muted: "#a4b19a", line: "#2d332a",
  green: "#6dbb7e", band: "rgba(109,187,126,0.16)", sun: "#e08276", onGreen: "#10140f",
};

export type RenderOpts = {
  year: number; month: number; todayIso: string;
  tasks: WidgetTask[]; width: number; height: number; dark: boolean;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_PER_CELL = 2;

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 주어진 폭에 맞게 뒤를 … 로 자른다. */
function ellipsize(ctx: SKRSContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}

export function renderWidgetPng(o: RenderOpts): Buffer {
  ensureFonts();
  const th = o.dark ? DARK : LIGHT;
  const W = o.width, H = o.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 바탕
  ctx.fillStyle = th.paper;
  roundRect(ctx, 0, 0, W, H, Math.round(W * 0.05));
  ctx.fill();

  const padX = Math.round(W * 0.04);
  const weeks = monthGrid(o.year, o.month);
  const bigRow = weekRowIndex(weeks, o.todayIso);

  // 머리: "9월" + 이번 주 건수
  const headH = Math.round(H * 0.09);
  ctx.fillStyle = th.ink;
  ctx.font = `${Math.round(headH * 0.72)}px WidgetSansBold`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`${o.month}월`, padX, headH * 0.75);

  if (bigRow >= 0) {
    const n = weeks[bigRow].reduce(
      (acc, c) => acc + cellEntries(o.tasks, c.iso, 99).shown.length, 0);
    ctx.fillStyle = th.muted;
    ctx.font = `${Math.round(headH * 0.46)}px WidgetSans`;
    ctx.textAlign = "right";
    ctx.fillText(`이번 주 ${n}건`, W - padX, headH * 0.75);
  }

  // 요일 머리
  const gridX = padX, gridW = W - padX * 2;
  const colW = gridW / 7;
  const dowY = headH * 1.35;
  ctx.font = `${Math.round(H * 0.035)}px WidgetSansBold`;
  ctx.textAlign = "center";
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i === 0 ? th.sun : th.muted;
    ctx.fillText(DOW[i], gridX + colW * (i + 0.5), dowY);
  }

  // 행 높이: 이번 주 행은 나머지의 2.2배
  const gridTop = dowY + H * 0.03;
  const gridH = H - gridTop - Math.round(H * 0.025);
  const BIG = 2.2;
  const units = weeks.length - (bigRow >= 0 ? 1 : 0) + (bigRow >= 0 ? BIG : 0);
  const unitH = gridH / units;

  let y = gridTop;
  for (let w = 0; w < weeks.length; w++) {
    const isBig = w === bigRow;
    const rowH = isBig ? unitH * BIG : unitH;

    if (isBig) {
      ctx.fillStyle = th.band;
      roundRect(ctx, gridX, y, gridW, rowH, Math.round(W * 0.028));
      ctx.fill();
    }

    for (let i = 0; i < 7; i++) {
      const cell = weeks[w][i];
      const cx = gridX + colW * (i + 0.5);
      const dayNum = Number(cell.iso.slice(8, 10));
      const isToday = cell.iso === o.todayIso;
      const numSize = Math.round(H * (isBig ? 0.040 : 0.038));
      const numY = y + numSize * 0.95;

      if (isToday) {
        ctx.fillStyle = th.green;
        ctx.beginPath();
        ctx.arc(cx, numY, numSize * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = th.onGreen;
        ctx.font = `${numSize}px WidgetSansBold`;
      } else {
        ctx.fillStyle = cell.other ? th.line : i === 0 ? th.sun : th.ink;
        ctx.font = `${numSize}px WidgetSans`;
      }
      ctx.textAlign = "center";
      ctx.fillText(String(dayNum), cx, numY);

      const { shown, overflow } = cellEntries(o.tasks, cell.iso, isBig ? MAX_PER_CELL : 99);

      if (isBig) {
        // 제목 칩
        const chipH = Math.round(rowH * 0.17);
        const chipW = colW * 0.88;
        let cy = numY + numSize * 0.95;
        ctx.font = `${Math.round(chipH * 0.66)}px WidgetSansBold`;
        for (const t of shown) {
          ctx.fillStyle = projectColor(t.project);
          roundRect(ctx, cx - chipW / 2, cy, chipW, chipH, chipH * 0.28);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          const label = t.time ? `${t.time} ${t.title}` : t.title;
          ctx.fillText(ellipsize(ctx, label, chipW * 0.88), cx, cy + chipH * 0.55);
          cy += chipH * 1.18;
        }
        if (overflow > 0) {
          ctx.fillStyle = th.muted;
          ctx.font = `${Math.round(chipH * 0.62)}px WidgetSans`;
          ctx.fillText(`＋${overflow}`, cx, cy + chipH * 0.5);
        }
      } else if (shown.length > 0) {
        // 색 점 (최대 3개)
        const dots = shown.slice(0, 3);
        const r = Math.max(1.5, H * 0.008);
        const gap = r * 2.6;
        const startX = cx - ((dots.length - 1) * gap) / 2;
        const dy = numY + numSize * 0.85;
        dots.forEach((t, k) => {
          ctx.fillStyle = projectColor(t.project);
          ctx.beginPath();
          ctx.arc(startX + gap * k, dy, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    y += rowH;
  }

  return canvas.toBuffer("image/png");
}
```

- [ ] **Step 5: 통과를 확인하고 그림을 눈으로 본다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: Task 1·2·3·5의 테스트 전부 PASS.

그다음 **실제 그림을 파일로 뽑아 연다**:

```bash
cd /c/Projects2/pig-farm-log && node --input-type=module -e "
import { renderWidgetPng } from './lib/widget-render.ts';
import fs from 'node:fs';
const T = o => ({ endDate:null, time:null, project:null, familyId:null, ownerId:'me', ...o });
const tasks = [
  T({id:'1',title:'어린이집 상담',date:'2026-09-21',project:'가족 일정'}),
  T({id:'2',title:'월말 마감 준비',date:'2026-09-22',project:'회사 업무'}),
  T({id:'3',title:'팀 회의',date:'2026-09-23',time:'14:00',project:'회사 업무'}),
  T({id:'4',title:'치과',date:'2026-09-23',time:'18:30',project:'개인 일정'}),
  T({id:'5',title:'독서모임',date:'2026-09-23',project:'개인 일정'}),
  T({id:'6',title:'출장',date:'2026-09-24',endDate:'2026-09-25',project:'회사 업무'}),
  T({id:'7',title:'처가 방문',date:'2026-09-26',project:'가족 일정'}),
  T({id:'8',title:'정기점검',date:'2026-09-08',project:'회사 업무'}),
];
const base = { year:2026, month:9, todayIso:'2026-09-23', tasks, width:660, height:520 };
fs.writeFileSync('widget-light.png', renderWidgetPng({...base, dark:false}));
fs.writeFileSync('widget-dark.png',  renderWidgetPng({...base, dark:true}));
fs.writeFileSync('widget-empty.png', renderWidgetPng({...base, tasks:[], dark:false}));
console.log('세 장 저장 완료');
"
start widget-light.png
```

**눈으로 확인할 것:**
- 한글 제목이 `□□□`가 아니다 ← 제일 중요
- 이번 주(20~26일) 행이 커져 있고 배경이 연초록이다
- 23일에 초록 원이 있고, 칩이 2개 + `＋1`이 보인다
- 어두운 판(`widget-dark.png`)도 글씨가 읽힌다
- 빈 판(`widget-empty.png`)이 안 깨진다

모양이 마음에 안 들면 **여기서 고친다.** STEP 2·3은 이 그림을 띄우기만 하므로, 지금이 고치기 제일 싸다.

- [ ] **Step 6: 임시 PNG를 지우고 커밋한다**

```bash
cd /c/Projects2/pig-farm-log && rm -f widget-light.png widget-dark.png widget-empty.png
git add lib/widget-render.ts tests/unit/widget-render.test.ts package.json package-lock.json next.config.js assets/fonts
git commit -m "feat(위젯): 달력 PNG 렌더러 — 이번 주 행만 키우기

이번 주 행은 나머지의 2.2배 높이로 제목 칩을 칸 안에 넣는다.
나머지 주는 프로젝트 색 점 최대 3개. 한 칸 2건 넘으면 ＋N.
한글 글꼴을 assets/fonts 에서 등록한다 — 빠지면 제목이 □□□ 가 된다.
canvas 는 외부 패키지로, 글꼴은 outputFileTracingIncludes 로 함수에 싣는다."
```

---

### Task 6: `/api/widget` 라우트

**Files:**
- Create: `C:\Projects2\pig-farm-log\lib\widget-params.ts`
- Create: `C:\Projects2\pig-farm-log\app\api\widget\route.ts`
- Test: `C:\Projects2\pig-farm-log\tests\unit\widget-params.test.ts`

**Interfaces:**
- Consumes: `renderWidgetPng` (Task 5), `canSee` (Task 3), `widget_tokens` (Task 4),
  기존 `supabaseAdmin()` (`lib/supabase-admin.ts`), `safeError()` (`lib/redact.ts`)
- Produces: `GET /api/widget?token=…&w=&h=&theme=&t=` → `image/png` 또는 401/500
- Produces: `function parseWidgetParams(sp: URLSearchParams): { width: number; height: number; dark: boolean }` — **`lib/widget-params.ts`에 둔다**

> **왜 파싱을 라우트가 아니라 `lib/`에 두나:** 이 저장소의 라우트는 `@/lib/…` 별칭으로 import하는데
> `node --test`는 그 별칭을 풀지 못한다. 라우트 파일을 테스트가 import하면 **모듈 로딩부터 실패한다.**
> 그래서 테스트할 값은 `lib/`에 두고 상대경로로 부른다. 라우트는 얇게 유지한다.

- [ ] **Step 1: 파라미터 파싱 테스트를 쓴다**

`tests/unit/widget-params.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWidgetParams } from "../../lib/widget-params.ts";

const P = (q: string) => parseWidgetParams(new URLSearchParams(q));

test("기본값은 320x250 밝은 테마", () => {
  assert.deepEqual(P(""), { width: 320, height: 250, dark: false });
});

test("theme=dark 면 어둡다", () => {
  assert.equal(P("theme=dark").dark, true);
});

test("크기를 받는다", () => {
  assert.deepEqual(P("w=400&h=300"), { width: 400, height: 300, dark: false });
});

test("터무니없는 크기는 잘라낸다", () => {
  assert.equal(P("w=99999").width, 1200);
  assert.equal(P("h=1").height, 120);
});

test("숫자가 아니면 기본값", () => {
  assert.deepEqual(P("w=abc&h="), { width: 320, height: 250, dark: false });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit
```

기대: `Cannot find module '../../lib/widget-params.ts'`.

- [ ] **Step 3: 파싱을 쓴다**

`lib/widget-params.ts`:

```ts
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 위젯이 자기 실제 크기와 테마를 알려준다. 터무니없는 값은 잘라낸다. */
export function parseWidgetParams(sp: URLSearchParams) {
  const num = (k: string, dflt: number, lo: number, hi: number) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v > 0 ? clamp(Math.round(v), lo, hi) : dflt;
  };
  return {
    width: num("w", 320, 120, 1200),
    height: num("h", 250, 120, 1200),
    dark: sp.get("theme") === "dark",
  };
}
```

- [ ] **Step 4: 라우트를 쓴다**

`app/api/widget/route.ts` — **import는 이 저장소 관례대로 `@/lib/…` 별칭을 쓴다**:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { safeError } from "@/lib/redact";
import { renderWidgetPng } from "@/lib/widget-render";
import { canSee } from "@/lib/widget-visibility";
import { parseWidgetParams } from "@/lib/widget-params";
import { todayKST } from "@/lib/date";
import type { WidgetTask } from "@/lib/widget-calendar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const token = (sp.get("token") || "").trim();
    if (!token) return new Response("no token", { status: 401 });

    const sb = supabaseAdmin();
    if (!sb) return new Response("server not configured", { status: 500 });

    const { data: row } = await sb
      .from("widget_tokens").select("user_id").eq("token", token).maybeSingle();
    if (!row) return new Response("unknown token", { status: 401 });

    const userId: string = row.user_id;
    // supabase 쿼리는 await 해야 요청이 나간다 (void 로 두면 아무것도 안 보낸다).
    await sb.from("widget_tokens")
      .update({ last_used_at: new Date().toISOString() }).eq("token", token);

    const { data: fams } = await sb
      .from("family_members").select("family_id").eq("user_id", userId);
    const familyIds: string[] = (fams || []).map(f => f.family_id);

    // "오늘"은 반드시 KST. Vercel 함수는 UTC라 new Date()로 잡으면 한국 00~09시에 어제가 된다.
    const todayIso = todayKST();
    const year = Number(todayIso.slice(0, 4)), month = Number(todayIso.slice(5, 7));
    // 이번 달 격자가 걸치는 범위를 넉넉히 덮는다 (앞뒤 달 칸 포함). 달력 산술만 하므로 시간대 무관.
    const from = new Date(year, month - 1, 1); from.setDate(from.getDate() - 7);
    const to = new Date(year, month, 0);       to.setDate(to.getDate() + 7);
    const isoOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // 완료한 일은 위젯에 띄우지 않는다 (한눈에 보는 화면이라 끝난 일은 소음이다).
    let q = sb.from("work_tasks")
      .select("id,title,task_date,end_date,task_time,project,family_id,user_id")
      .eq("done", false)
      .lte("task_date", isoOf(to));
    if (familyIds.length > 0) {
      q = q.or(`user_id.eq.${userId},family_id.in.(${familyIds.join(",")})`);
    } else {
      q = q.eq("user_id", userId);
    }
    const { data: rows, error } = await q;
    if (error) return new Response("query failed", { status: 500 });

    const fromIso = isoOf(from);
    const tasks: WidgetTask[] = (rows || [])
      .map(r => ({
        id: r.id,
        title: r.title,
        date: r.task_date,
        endDate: r.end_date ?? null,
        time: r.task_time ? String(r.task_time).slice(0, 5) : null,
        project: r.project ?? null,
        familyId: r.family_id ?? null,
        ownerId: r.user_id,
      }))
      // SQL 조건과 별개로 한 번 더 거른다 — 이 판정의 정본은 canSee 다.
      .filter(t => canSee(t, userId, familyIds))
      // 기간 일정이 격자에 걸치는지로 최종 판정
      .filter(t => (t.endDate || t.date) >= fromIso);

    const { width, height, dark } = parseWidgetParams(sp);
    const png = renderWidgetPng({
      year, month, todayIso, tasks, width, height, dark,
    });

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    // 토큰·키가 본문에 섞여 나가지 않게 한다 (전례: service_role 키가 500 본문에 실려 나감).
    console.error("[widget]", safeError(e));
    return new Response("render failed", { status: 500 });
  }
}
```

컬럼명은 `supabase-setup.sql`에서 확인한 실제 이름이다:
`task_date` · `end_date` · `task_time` · `family_id` · `user_id` · `done`.

- [ ] **Step 5: 통과를 확인한다**

```bash
cd /c/Projects2/pig-farm-log && npm run test:unit && npx tsc --noEmit
```

기대: 테스트 전부 PASS, 타입 오류 0.

- [ ] **Step 6: 로컬에서 진짜로 불러본다**

```bash
cd /c/Projects2/pig-farm-log && npm run dev
```

다른 창에서 — 토큰 없이:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/widget"
```
기대: `401`

시험용 토큰으로 — SQL Editor는 `auth.uid()`가 없으므로 지수님 계정 행을 **직접** 넣고, 끝나면 지운다:

```sql
insert into public.widget_tokens(token, user_id)
select 'local-test-' || encode(extensions.gen_random_bytes(12), 'hex'), id
from auth.users where email = '<지수님 로그인 이메일>' returning token;
-- 확인이 끝나면: delete from public.widget_tokens where token like 'local-test-%';
```

```bash
curl -s "http://localhost:3000/api/widget?token=<토큰>&w=660&h=520" -o real.png && start real.png
```
기대: **지수님 실제 일정이 든 달력 그림**이 열린다.

- [ ] **Step 7: 커밋하고 배포한다**

```bash
cd /c/Projects2/pig-farm-log && rm -f real.png
git add app/api/widget/route.ts lib/widget-params.ts tests/unit/widget-params.test.ts
git commit -m "feat(위젯): /api/widget 라우트 — 토큰으로 달력 PNG

SQL로 한 번 거르고 canSee 로 다시 거른다. 판정의 정본은 canSee 다.
오늘은 todayKST — Vercel UTC에서 한국 아침에 어제가 그려지지 않게.
에러 본문에 토큰·키가 섞이지 않게 safeError 를 경유한다."
```

push → PR → 머지 (main 직접 push 금지). Vercel이 배포하면
`https://masan-farm.vercel.app/api/widget?token=…` 이 살아난다.

---

### Task 7: 앱의 「위젯 연결」 카드

**Files:**
- Modify: `C:\projects\my-work-desk\settings.js`
- Modify: `C:\projects\my-work-desk\index.html`
- Modify: `C:\projects\my-work-desk\app.js`
- Modify: `C:\projects\my-work-desk\styles.css`

**Interfaces:**
- Consumes: RPC `issue_widget_token()`·`revoke_widget_token()` (Task 4), 배포된 `/api/widget` (Task 6)
- Produces: 설정에서 위젯 주소를 만들고·복사하고·폐기할 수 있다

- [ ] **Step 1: 실제 파일 구조를 먼저 읽는다**

```bash
cd /c/projects/my-work-desk
grep -n "^export\|^async function\|^function" settings.js | head -30
grep -n "settingsDialog\|settings-body" index.html | head -10
```

기존 설정 카드 마크업과 같은 모양으로 붙인다. **새 패턴을 만들지 않는다.**

- [ ] **Step 2: 마크업을 넣는다**

`index.html`의 `#settingsDialog` 안, 「알림」 섹션 바로 아래에. 설정 창은 카드가 아니라
`settings-section` + `h3` + `settings-row` + `tool`/`text-button` + `hint` 로 짜여 있다 — 그대로 따른다:

```html
      <div class="settings-section">
        <h3>홈화면 위젯</h3>
        <div class="settings-row" id="widgetNone"><span>이번 달 달력을 홈화면에</span><button id="widgetIssue" type="button" class="tool">주소 만들기</button></div>
        <div id="widgetHave" hidden>
          <code class="widget-url" id="widgetUrl"></code>
          <div class="settings-row"><button id="widgetCopy" type="button" class="tool">복사</button><span><button id="widgetReissue" type="button" class="text-button">새로 만들기</button><button id="widgetRevoke" type="button" class="text-button">폐기</button></span></div>
        </div>
        <p class="hint">이 주소를 아는 사람은 내 달력을 볼 수 있습니다. 새로 만들면 예전 주소는 즉시 막힙니다.</p>
      </div>
```

- [ ] **Step 3: 동작을 붙인다**

`settings.js` 위쪽 import를 `import { normalizeWatchlist, rpcErrorMessage } from './lib.js';` 로 바꾸고, 파일 끝에:

```js
const WIDGET_API = 'https://masan-farm.vercel.app/api/widget';

function widgetUrlFor(token) {
  return `${WIDGET_API}?token=${encodeURIComponent(token)}`;
}

function showWidgetToken(token) {
  const none = document.getElementById('widgetNone');
  const have = document.getElementById('widgetHave');
  const out = document.getElementById('widgetUrl');
  if (!none || !have || !out) return;
  if (token) {
    out.textContent = widgetUrlFor(token);
    none.hidden = true;
    have.hidden = false;
  } else {
    out.textContent = '';
    none.hidden = false;
    have.hidden = true;
  }
}

export async function loadWidgetToken() {
  const { data } = await sb.from('widget_tokens').select('token').maybeSingle();
  showWidgetToken(data?.token || null);
}

async function issueWidgetToken() {
  const { data, error } = await sb.rpc('issue_widget_token');
  if (error) { alert(rpcErrorMessage(error)); return; }
  showWidgetToken(data);
}

async function revokeWidgetToken() {
  const { error } = await sb.rpc('revoke_widget_token');
  if (error) { alert(rpcErrorMessage(error)); return; }
  showWidgetToken(null);
}

export function bindWidgetCard() {
  document.getElementById('widgetIssue')?.addEventListener('click', issueWidgetToken);
  document.getElementById('widgetReissue')?.addEventListener('click', issueWidgetToken);
  document.getElementById('widgetRevoke')?.addEventListener('click', revokeWidgetToken);
  document.getElementById('widgetCopy')?.addEventListener('click', async () => {
    const url = document.getElementById('widgetUrl')?.textContent || '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const b = document.getElementById('widgetCopy');
      const old = b.textContent;
      b.textContent = '복사됨';
      setTimeout(() => { b.textContent = old; }, 1500);
    } catch {
      alert('복사하지 못했습니다. 주소를 길게 눌러 직접 복사해 주세요.');
    }
  });
}
```

`app.js`에서 두 자리를 잇는다 (`./settings.js` import에 `loadWidgetToken, bindWidgetCard` 추가):

```js
// app.js:185 — 설정을 여는 자리. 열 때마다 현재 토큰을 다시 읽는다.
$('#profileBtn').onclick = () => { refreshPushLabel(); openSettingsDialog(); loadWidgetToken(); };
```

그리고 다른 버튼 바인딩들이 모인 초기화 부근에서 `bindWidgetCard();` 를 한 번 부른다.

- [ ] **Step 4: 스타일을 넣는다**

`styles.css`에 (토큰 `--soft`·`--line`·`--muted`는 이미 있다):

```css
.widget-url{display:block;word-break:break-all;font-size:11px;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--muted);margin:6px 0}
```

- [ ] **Step 5: 브라우저에서 확인한다**

```bash
cd /c/projects/my-work-desk && npx serve -l 5173 .
```

`http://localhost:5173` → 로그인 → 설정 → 「홈화면 위젯」:

- [주소 만들기] → 주소가 뜬다
- [복사] → 「복사됨」으로 바뀐다
- 그 주소를 새 탭에 붙여넣으면 **달력 그림이 뜬다**
- [새로 만들기] → 주소가 바뀌고, **예전 주소 탭을 새로고침하면 401**
- [폐기] → 버튼이 다시 [주소 만들기]로 돌아간다
- 폰 크기로 줄여도 카드가 안 깨진다

- [ ] **Step 6: 커밋한다**

```bash
cd /c/projects/my-work-desk
git add index.html settings.js app.js styles.css
git commit -m "feat(위젯): 설정에 홈화면 위젯 주소 카드

만들기·복사·새로 만들기·폐기. 주소를 아는 사람은 달력을 볼 수 있다는
경고를 같이 둔다. 새로 만들면 옛 주소는 즉시 막힌다."
```

---

### Task 8: `?d=` 딥링크

**Files:**
- Modify: `C:\projects\my-work-desk\app.js`
- Test: `C:\projects\my-work-desk\tests\lib.test.mjs`
- Modify: `C:\projects\my-work-desk\lib.js`

**Interfaces:**
- Consumes: 기존 `openDayDialog(dateIso)` (ui.js), `parseIso` (lib.js)
- Produces: `function dateFromQuery(search: string): string | null` — 유효한 `?d=YYYY-MM-DD`만 통과

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lib.test.mjs`에 덧붙인다:

```js
test('dateFromQuery: 제대로 된 d만 통과시킨다', () => {
  assert.equal(dateFromQuery('?d=2026-09-23'), '2026-09-23');
  assert.equal(dateFromQuery('?a=1&d=2026-01-05&b=2'), '2026-01-05');
  assert.equal(dateFromQuery(''), null);
  assert.equal(dateFromQuery('?d='), null);
  assert.equal(dateFromQuery('?d=오늘'), null);
  assert.equal(dateFromQuery('?d=2026-13-01'), null);   // 13월은 없다
  assert.equal(dateFromQuery('?d=2026-02-30'), null);   // 2월 30일은 없다
  assert.equal(dateFromQuery('?d=2026-9-3'), null);     // 0 채우기 필수
});
```

파일 위쪽 import에 `dateFromQuery`를 더한다.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/projects/my-work-desk && npm test
```

기대: `dateFromQuery is not defined`.

- [ ] **Step 3: 구현을 쓴다** (`lib.js` 끝에)

```js
// 위젯이 ?d=2026-09-23 처럼 날짜를 실어 보낸다. 달력에 없는 날짜는 통과시키지 않는다.
export function dateFromQuery(search) {
  const raw = new URLSearchParams(search || '').get('d');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = parseIso(raw);
  return d && iso(d) === raw ? raw : null;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /c/projects/my-work-desk && npm test
```

기대: 전부 PASS.

- [ ] **Step 5: 앱에 연결한다**

`app.js`의 초기 렌더가 끝난 자리(`state.selectedDate = iso(today);` 근처, 데이터가 들어온 뒤)에서:

```js
  // 위젯에서 넘어온 날짜가 있으면 그 날 창을 띄운다.
  const fromWidget = dateFromQuery(location.search);
  if (fromWidget) {
    state.selectedDate = fromWidget;
    openDayDialog(fromWidget);
    history.replaceState(null, '', location.pathname);  // 새로고침해도 다시 안 뜬다
  }
```

`dateFromQuery`를 `./lib.js`에서 import한다.

- [ ] **Step 6: 브라우저에서 확인한다**

```bash
cd /c/projects/my-work-desk && npx serve -l 5173 .
```

- `http://localhost:5173/?d=2026-09-23` → **23일 창이 바로 뜬다**
- 주소창에서 `?d=…`가 사라져 있다
- `?d=엉망` → 창이 안 뜨고 평소대로 뜬다
- `?d=` 없이 → 평소대로 뜬다

- [ ] **Step 7: 커밋한다**

```bash
cd /c/projects/my-work-desk
git add lib.js app.js tests/lib.test.mjs
git commit -m "feat(위젯): ?d=날짜 로 들어오면 그 날 창을 띄운다

달력에 없는 날짜(13월·2월 30일)는 통과시키지 않는다.
띄운 뒤 주소에서 지워 새로고침에 다시 뜨지 않게 한다."
```

---

## STEP 1 완료 판정

전부 되면 **위젯 없이도 브라우저에서 내 달력 그림이 보인다.**

- [ ] `pig-farm-log`: `npm run test:unit` 전부 PASS, `npx tsc --noEmit` 오류 0
- [ ] `my-work-desk`: `npm test` 전부 PASS
- [ ] 밝은 판·어두운 판·빈 판 PNG를 눈으로 확인 (한글이 `□□□`가 아니다)
- [ ] 토큰 없이 부르면 401, 폐기한 토큰도 401, **본문에 토큰·키 없음**
- [ ] 앱 설정에서 주소를 만들고 폐기할 수 있다
- [ ] `?d=2026-09-23`으로 열면 그 날 창이 뜬다
- [ ] reviewer 서브에이전트 APPROVE
- [ ] 두 저장소 모두 PR로 머지 (main 직접 push 금지)

## 다음

STEP 2(아이폰 Scriptable)·STEP 3(안드로이드 APK)은 **이 그림을 확정한 뒤** 각자 계획을 받는다.
그림이 마음에 안 들면 Task 5로 돌아가는 게 가장 싸다 — 위젯 쪽은 이 그림을 띄우기만 하므로.
