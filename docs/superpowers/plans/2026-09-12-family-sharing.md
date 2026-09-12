# 가족 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 초대 코드로 두 계정을 가족으로 묶고, "가족 일정" 프로젝트 업무를 양쪽이 함께 보고 고치게 하며, 시세·투자 패널은 관리자 계정 설정으로만 보이게 한다.

**Architecture:** DB에 `families`/`family_members`/`work_settings` 테이블과 `work_tasks.family_id`를 추가하고, `work_tasks` RLS를 "본인 또는 내 가족"으로 교체한다. 가족 만들기/참여는 `security definer` RPC(`create_family`, `join_family`)로 원자 처리. 클라이언트는 새 모듈 `family.js`/`settings.js`가 Supabase를 부르고, 순수 판단(`familyIdFor`, `authorLabel`, 코드 생성)은 `lib.js`에 두어 `npm test`로 고정한다.

**Tech Stack:** Vanilla JS ES modules(빌드 없음), Supabase JS v2(publishable key, `sb.rpc`), PostgreSQL RLS + plpgsql, Node 24 `node:test`, Vercel 정적 배포.

## Global Constraints

- service_role 키 절대 금지. 브라우저는 publishable key + RLS + `security definer` RPC만.
- 공유 대상은 **프로젝트명이 정확히 `'가족 일정'`인 업무**뿐. `family_id = (project === '가족 일정' && state.family) ? state.family.id : null`을 추가·수정·"이후 모두" 모두에 적용.
- 한 사람은 가족 하나. 가족 만든 계정 = 관리자(`families.owner_id`).
- 시세·투자 패널: `work_settings.show_market` 기본 `false`. 토글 버튼 표시 조건 `!state.family || state.family.isAdmin`. 구성원에겐 패널·토글 없음.
- 초대 코드: 6자, 알파벳 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 브라우저 `crypto.getRandomValues`로 생성, unique 충돌(`23505`) 시 최대 3회 재시도. DB check `^[A-Z0-9]{6}$`.
- 에러 문구: `코드를 찾을 수 없습니다.` / `이미 가족에 속해 있습니다.` / `코드는 6자리입니다.` / 그 외 `error.message`.
- 표시 이름 초기값 `user_metadata.full_name || user_metadata.name || 이메일 @ 앞 || '나'`, 30자.
- 로그인 순서: `loadProjects → loadFamily → loadSettings → load → migrateLocalProjects → ensureFixedProjects → renderProjects → renderFamily → applyMarketVisibility (+ 켜져 있으면 renderInvestment/loadMarket)`.
- 배포 순서: SQL 먼저 → 코드 push. 커밋 메시지 끝 두 줄:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01G9J7WjVZ9wcXL5GQctGjiN
  ```
- 작업 폴더 `C:\Projects2\my-work-desk-github`, 브랜치 `feat/family` (main에서 분기).

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `supabase-setup.sql` | 추가 | 테이블 3개, 함수 3개, 컬럼, 정책 |
| `lib.js` | 추가 | `CODE_ALPHABET`, `familyCodeFrom`, `isValidFamilyCode`, `familyIdFor`, `authorLabel`, `rpcErrorMessage` |
| `tests/lib.test.mjs` | 추가 | 위 함수 테스트 |
| `state.js` | 추가 | `state.family`, `state.settings` |
| `family.js` | 생성 | 가족 CRUD (Supabase) |
| `settings.js` | 생성 | `work_settings` 읽기/쓰기 |
| `tasks.js` | 수정 | 매핑 `userId`/`familyId`, 저장 시 `family_id` |
| `ui.js` | 수정 | 작성자 표시, `renderFamily`, `applyMarketVisibility`, `setFamilyStatus` |
| `app.js` | 수정 | 로그인 순서, 가족 카드·토글 이벤트 |
| `index.html` | 수정 | 가족 카드, 툴바 토글, 시세/투자 카드 `hidden` |
| `styles.css` | 추가 | 가족 카드 스타일 |

---

### Task 1: 스키마·함수·정책 SQL

**Files:**
- Modify: `supabase-setup.sql` (끝에 추가)

**Interfaces:**
- Produces: 테이블 `families`, `family_members`, `work_settings`; 컬럼 `work_tasks.family_id`; 함수 `my_family_ids()`, `create_family(p_code, p_name) → uuid`, `join_family(p_code, p_name) → uuid`; `work_tasks` 정책 4개.

- [ ] **Step 1: 브랜치**

```bash
git checkout -b feat/family main
```

- [ ] **Step 2: SQL 추가**

`supabase-setup.sql` 끝에 붙인다:

```sql

-- ---------- 가족 공유 ----------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create unique index if not exists family_members_user_idx on public.family_members(user_id);

create table if not exists public.work_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_market boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.work_tasks add column if not exists family_id uuid references public.families(id) on delete set null;
create index if not exists work_tasks_family_idx on public.work_tasks(family_id);

-- RLS 재귀를 피하는 도우미 (내가 속한 가족 id)
create or replace function public.my_family_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.family_members where user_id = auth.uid();
$$;
revoke all on function public.my_family_ids() from public;
grant execute on function public.my_family_ids() to authenticated;

-- 가족 만들기 / 참여: 원자 처리 + 기존 "가족 일정" 업무 소급
create or replace function public.create_family(p_code text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if exists (select 1 from family_members where user_id = auth.uid()) then
    raise exception 'ALREADY_MEMBER';
  end if;
  insert into families(code, owner_id) values (upper(p_code), auth.uid()) returning id into fid;
  insert into family_members(family_id, user_id, display_name) values (fid, auth.uid(), p_name);
  update work_tasks set family_id = fid where user_id = auth.uid() and project = '가족 일정' and family_id is null;
  return fid;
end $$;

create or replace function public.join_family(p_code text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if exists (select 1 from family_members where user_id = auth.uid()) then
    raise exception 'ALREADY_MEMBER';
  end if;
  select id into fid from families where code = upper(p_code);
  if fid is null then raise exception 'CODE_NOT_FOUND'; end if;
  insert into family_members(family_id, user_id, display_name) values (fid, auth.uid(), p_name);
  update work_tasks set family_id = fid where user_id = auth.uid() and project = '가족 일정' and family_id is null;
  return fid;
end $$;

revoke all on function public.create_family(text, text) from public;
revoke all on function public.join_family(text, text) from public;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text) to authenticated;

-- 정책
alter table public.families enable row level security;
drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated
  using (id in (select public.my_family_ids()));
drop policy if exists families_update on public.families;
create policy families_update on public.families for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.family_members enable row level security;
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members for select to authenticated
  using (family_id in (select public.my_family_ids()));
drop policy if exists family_members_update on public.family_members;
create policy family_members_update on public.family_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists family_members_delete on public.family_members;
create policy family_members_delete on public.family_members for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.work_settings enable row level security;
drop policy if exists work_settings_all on public.work_settings;
create policy work_settings_all on public.work_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- work_tasks: 본인 또는 내 가족
drop policy if exists "Users manage only their own work tasks" on public.work_tasks;
drop policy if exists work_tasks_select on public.work_tasks;
create policy work_tasks_select on public.work_tasks for select to authenticated
  using (user_id = (select auth.uid()) or family_id in (select public.my_family_ids()));
drop policy if exists work_tasks_insert on public.work_tasks;
create policy work_tasks_insert on public.work_tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and (family_id is null or family_id in (select public.my_family_ids())));
drop policy if exists work_tasks_update on public.work_tasks;
create policy work_tasks_update on public.work_tasks for update to authenticated
  using (user_id = (select auth.uid()) or family_id in (select public.my_family_ids()))
  with check (family_id is null or family_id in (select public.my_family_ids()));
drop policy if exists work_tasks_delete on public.work_tasks;
create policy work_tasks_delete on public.work_tasks for delete to authenticated
  using (user_id = (select auth.uid()) or family_id in (select public.my_family_ids()));
```

- [ ] **Step 3: 눈으로 확인** — 모든 `create policy` 앞에 `drop policy if exists`가 있고, 함수는 `create or replace`, 테이블/인덱스/컬럼은 `if not exists`. 다른 테이블(`pig_price` 등) 언급 없음.

- [ ] **Step 4: Commit**

```bash
git add supabase-setup.sql
git commit -m "feat(db): families, family_members, work_settings, shared work_tasks policies"
```

- [ ] **Step 5: 컨트롤러가 Supabase SQL Editor에서 실행** (Task 6 전까지). 실행 후 앱 콘솔에서 확인: `sb.from('work_settings').select('*')` 에러 없음, `sb.rpc('join_family', {p_code:'ZZZZZZ', p_name:'x'})`가 `CODE_NOT_FOUND` 에러를 돌려줌, 기존 `work_tasks` 조회가 그대로 됨.

---

### Task 2: lib.js 순수 함수 + state 필드

**Files:**
- Modify: `lib.js`, `tests/lib.test.mjs`, `state.js`

**Interfaces:**
- Produces (`lib.js`): `CODE_ALPHABET: string`(32자), `familyCodeFrom(bytes: ArrayLike<number>) → string`(6자), `isValidFamilyCode(code) → boolean`, `familyIdFor(project: string|null, family: {id}|null) → string|null`, `authorLabel(task: {familyId, userId}, myId, members: {userId,name}[]) → string`, `rpcErrorMessage(err) → string`
- Produces (`state.js`): `state.family: null | { id, code, ownerId, isAdmin, members }`, `state.settings: { showMarket: boolean }`

- [ ] **Step 1: 실패 테스트**

`tests/lib.test.mjs` import 목록에 추가한다: `CODE_ALPHABET, familyCodeFrom, isValidFamilyCode, familyIdFor, authorLabel, rpcErrorMessage`. 파일 끝에 추가:

```js
test('familyCodeFrom: 6자, 알파벳 내 문자만, 같은 바이트 → 같은 코드', () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(familyCodeFrom([0, 1, 2, 3, 4, 5]), 'ABCDEF');
  assert.equal(familyCodeFrom([255, 255, 255, 255, 255, 255]), '999999');
  assert.equal(familyCodeFrom(new Uint8Array([32, 33, 34, 35, 36, 37, 99, 100])), 'ABCDEF');
  const c = familyCodeFrom([7, 77, 177, 200, 13, 31]);
  assert.equal(c.length, 6);
  assert.ok([...c].every(ch => CODE_ALPHABET.includes(ch)));
  assert.ok(!/[01OI]/.test(CODE_ALPHABET));
});

test('isValidFamilyCode', () => {
  assert.equal(isValidFamilyCode('abc234'), true);
  assert.equal(isValidFamilyCode(' ABC234 '), true);
  assert.equal(isValidFamilyCode('ABC23'), false);
  assert.equal(isValidFamilyCode('ABC-234'), false);
  assert.equal(isValidFamilyCode(''), false);
  assert.equal(isValidFamilyCode(null), false);
});

test('familyIdFor: 가족 일정 + 가족 있음일 때만 id', () => {
  const fam = { id: 'f1' };
  assert.equal(familyIdFor('가족 일정', fam), 'f1');
  assert.equal(familyIdFor('가족 일정', null), null);
  assert.equal(familyIdFor('개인 일정', fam), null);
  assert.equal(familyIdFor(null, fam), null);
});

test('authorLabel: 내 것/가족 아님은 빈 문자열, 남의 가족 업무는 이름, 없으면 가족', () => {
  const members = [{ userId: 'me', name: '지수' }, { userId: 'w', name: '아내' }];
  assert.equal(authorLabel({ familyId: null, userId: 'w' }, 'me', members), '');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'me' }, 'me', members), '');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'w' }, 'me', members), '아내');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'gone' }, 'me', members), '가족');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'w' }, 'me', []), '가족');
});

test('rpcErrorMessage', () => {
  assert.equal(rpcErrorMessage({ message: 'CODE_NOT_FOUND' }), '코드를 찾을 수 없습니다.');
  assert.equal(rpcErrorMessage({ message: 'P0001: ALREADY_MEMBER' }), '이미 가족에 속해 있습니다.');
  assert.equal(rpcErrorMessage({ message: 'network down' }), 'network down');
  assert.equal(rpcErrorMessage(null), '요청을 처리하지 못했습니다.');
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test
```
Expected: export 없음 SyntaxError로 실패.

- [ ] **Step 3: lib.js 끝에 추가**

```js
// ---- 가족 공유 ----
// 초대 코드 알파벳: 혼동되는 0 O 1 I 를 뺀 32자. 바이트 하나가 문자 하나로 대응된다(32 = 256/8, 편향 없음).
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function familyCodeFrom(bytes) {
  return Array.from(bytes).slice(0, 6).map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isValidFamilyCode(code) {
  return /^[A-Z0-9]{6}$/.test(String(code || '').trim().toUpperCase());
}

// 저장 규칙: "가족 일정" 프로젝트이고 내가 가족에 속해 있을 때만 family_id 를 붙인다.
export function familyIdFor(project, family) {
  return project === '가족 일정' && family ? family.id : null;
}

// 가족 업무인데 내가 만든 게 아니면 작성자 이름. 목록에 없으면(나간 사람) "가족".
export function authorLabel(task, myId, members) {
  if (!task.familyId || task.userId === myId) return '';
  return members.find(m => m.userId === task.userId)?.name || '가족';
}

export function rpcErrorMessage(err) {
  const m = String(err?.message || '');
  if (m.includes('CODE_NOT_FOUND')) return '코드를 찾을 수 없습니다.';
  if (m.includes('ALREADY_MEMBER')) return '이미 가족에 속해 있습니다.';
  return m || '요청을 처리하지 못했습니다.';
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test
```
Expected: `# pass 22`, `# fail 0`.

- [ ] **Step 5: state.js**

`state` 객체의 `projectsReady: false` 줄 뒤에 추가한다(앞 줄 끝에 쉼표):

```js
  projectsReady: false, // work_projects 조회 성공 여부
  family: null,         // { id, code, ownerId, isAdmin, members: [{ userId, name }] } | null
  settings: { showMarket: false } // work_settings (계정별)
```

- [ ] **Step 6: Commit**

```bash
node --check state.js
git add lib.js tests/lib.test.mjs state.js
git commit -m "feat(lib): family code, family_id rule, author label"
```

---

### Task 3: family.js · settings.js 모듈

**Files:**
- Create: `family.js`, `settings.js`

**Interfaces:**
- Consumes: `sb`, `state`, `familyCodeFrom`.
- Produces (`family.js`): `defaultDisplayName(user) → string`, `loadFamily() → error|null`, `createFamily(name)`, `joinFamily(code, name)`, `leaveFamily()`, `regenerateCode()`, `renameMe(name)` — 모두 `error|null`, 성공 시 `state.family` 갱신.
- Produces (`settings.js`): `loadSettings() → error|null`, `setShowMarket(on) → error|null`.

- [ ] **Step 1: family.js**

```js
import { sb } from './supabase.js';
import { state } from './state.js';
import { familyCodeFrom } from './lib.js';

function newCode() { return familyCodeFrom(crypto.getRandomValues(new Uint8Array(6))); }

export function defaultDisplayName(user) {
  const md = user?.user_metadata || {};
  const n = md.full_name || md.name || String(user?.email || '').split('@')[0] || '나';
  return String(n).trim().slice(0, 30) || '나';
}

// 내 가족 + 구성원. 없으면 state.family = null.
export async function loadFamily() {
  const me = await sb.from('family_members').select('family_id').eq('user_id', state.user.id).maybeSingle();
  if (me.error) return me.error;
  if (!me.data) { state.family = null; return null; }
  const fid = me.data.family_id;
  const [fam, mem] = await Promise.all([
    sb.from('families').select('id,code,owner_id').eq('id', fid).single(),
    sb.from('family_members').select('user_id,display_name,joined_at').eq('family_id', fid).order('joined_at')
  ]);
  if (fam.error) return fam.error;
  if (mem.error) return mem.error;
  state.family = {
    id: fam.data.id,
    code: fam.data.code,
    ownerId: fam.data.owner_id,
    isAdmin: fam.data.owner_id === state.user.id,
    members: mem.data.map(m => ({ userId: m.user_id, name: m.display_name }))
  };
  return null;
}

// 코드가 겹치면(23505) 새 코드로 최대 3회.
async function withFreshCode(attempt) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    const error = await attempt(newCode());
    if (!error) return null;
    last = error;
    if (error.code !== '23505') return error;
  }
  return last;
}

export async function createFamily(name) {
  const err = await withFreshCode(async code => (await sb.rpc('create_family', { p_code: code, p_name: name })).error);
  return err || loadFamily();
}

export async function joinFamily(code, name) {
  const { error } = await sb.rpc('join_family', { p_code: String(code).trim().toUpperCase(), p_name: name });
  return error || loadFamily();
}

export async function leaveFamily() {
  const { error } = await sb.from('family_members').delete().eq('user_id', state.user.id);
  if (error) return error;
  state.family = null;
  return null;
}

export async function regenerateCode() {
  const err = await withFreshCode(async code => (await sb.from('families').update({ code }).eq('id', state.family.id)).error);
  return err || loadFamily();
}

export async function renameMe(name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return new Error('이름을 입력해 주세요.');
  const { error } = await sb.from('family_members').update({ display_name: name }).eq('user_id', state.user.id);
  return error || loadFamily();
}
```

- [ ] **Step 2: settings.js**

```js
import { sb } from './supabase.js';
import { state } from './state.js';

// 계정별 설정. 행이 없으면 기본값(시세·투자 숨김).
export async function loadSettings() {
  const { data, error } = await sb.from('work_settings').select('show_market').eq('user_id', state.user.id).maybeSingle();
  if (error) return error;
  state.settings = { showMarket: !!data?.show_market };
  return null;
}

export async function setShowMarket(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_market: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showMarket = !!on;
  return null;
}
```

- [ ] **Step 3: 확인 + Commit**

```bash
node --check family.js && node --check settings.js && npm test
git add family.js settings.js
git commit -m "feat: family and settings data modules"
```

---

### Task 4: 업무 저장/표시에 family_id·작성자 반영

**Files:**
- Modify: `tasks.js`, `ui.js`(`taskMeta`)

**Interfaces:**
- Consumes: `familyIdFor`, `authorLabel`, `state.family`, `state.user`.
- Produces: `state.tasks[]`에 `userId`, `familyId`; 저장 페이로드에 `family_id`.

- [ ] **Step 1: tasks.js**

import 줄:

```js
import { iso, addDays, sortTasks, occurrenceDates, splitSeriesEdit, shiftEndDate, dueDate, familyIdFor } from './lib.js';
```

`load()` 매핑의 `remind1d: !!x.remind_1d` 뒤에 추가:

```js
    remind1d: !!x.remind_1d,
    userId: x.user_id,
    familyId: x.family_id || null
```

`readForm()`의 `project: $('#project').value || null,` 다음 줄에 추가:

```js
    family_id: familyIdFor($('#project').value || null, state.family),
```

insert `records` 매핑에 `series_id: seriesId` 앞에 추가:

```js
    family_id: base.family_id,
```

('이후 모두' 분기는 `splitSeriesEdit`가 `family_id`를 `seriesFields`에 남기므로 변경 없음 — 프로젝트와 함께 시리즈 전체에 적용된다.)

- [ ] **Step 2: ui.js taskMeta**

import 줄에 `authorLabel`을 추가한다:

```js
import { iso, addDays, esc, pri, sortTasks, projectColor, FIXED_PROJECTS, dueDate, spansDay, dueState, fmtMd, authorLabel } from './lib.js';
```

`taskMeta`를 교체한다:

```js
function taskMeta(t) {
  const parts = [];
  if (t.endDate && t.endDate !== t.date) parts.push(`${fmtMd(t.date)} ~ ${fmtMd(t.endDate)}`);
  parts.push(t.time ? esc(t.time) : '하루종일');
  parts.push(esc(t.project || '미분류'));
  if (t.note) parts.push(esc(t.note));
  const author = authorLabel(t, state.user?.id, state.family?.members || []);
  if (author) parts.push(esc(author));
  return parts.join(' · ');
}
```

- [ ] **Step 3: 확인 + Commit**

```bash
node --check tasks.js && node --check ui.js && npm test
git add tasks.js ui.js
git commit -m "feat: tag family tasks with family_id and show author"
```

---

### Task 5: 가족 카드 · 시세/투자 토글 · 로그인 순서

**Files:**
- Modify: `index.html`, `styles.css`, `ui.js`, `app.js`

**Interfaces:**
- Consumes: `family.js`, `settings.js`, `isValidFamilyCode`, `rpcErrorMessage`.
- Produces (`ui.js`): `renderFamily()`, `applyMarketVisibility()`, `setFamilyStatus(msg)`.

- [ ] **Step 1: index.html**

툴바의 `<button id="notifyDue" …>` 뒤에 추가:

```html
      <button id="toggleMarket" class="tool" hidden>시세·투자 보기</button>
```

"프로젝트 관리" `</article>` 바로 뒤에 카드를 추가한다:

```html
      <article class="card">
        <div class="card-head"><div><h2>가족</h2><span class="hint">"가족 일정" 업무를 함께 봅니다.</span></div></div>
        <div id="familyStatus" class="status"></div>
        <div id="familyBody"></div>
      </article>
```

`<article class="card wide market-card">`와 `<article class="card wide investment-card">`에 `hidden`을 붙인다:

```html
      <article class="card wide market-card" hidden>
```
```html
      <article class="card wide investment-card" hidden>
```

- [ ] **Step 2: styles.css** — 5번째 줄 `.dot.more{…}` 뒤에 이어 붙인다:

```css
.members{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:6px}.members li{display:flex;align-items:center;gap:6px;font-size:14px}.code-line{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:13px;color:var(--muted)}.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;letter-spacing:3px;padding:6px 10px;border:1px dashed var(--line);border-radius:8px;color:var(--ink)}.family-actions{margin-bottom:10px}.family-actions .primary{width:100%}#joinCode{text-transform:uppercase}
```

- [ ] **Step 3: ui.js — renderFamily / applyMarketVisibility / setFamilyStatus**

`setProjectStatus` 뒤에 추가:

```js
export function setFamilyStatus(msg) {
  const el = $('#familyStatus');
  if (el) el.textContent = msg || '';
}

export function renderFamily() {
  const box = $('#familyBody');
  const f = state.family;
  if (!f) {
    box.innerHTML = `<p class="hint">가족을 만들거나 초대 코드를 입력하면 "가족 일정" 업무를 함께 볼 수 있습니다.</p>
      <div class="family-actions"><button id="createFamily" class="primary">가족 만들기</button></div>
      <div class="project-add"><input id="joinCode" maxlength="6" placeholder="초대 코드 6자리" autocapitalize="characters" autocomplete="off"><button id="joinFamily" class="tool">참여</button></div>`;
    return;
  }
  const me = f.members.find(m => m.userId === state.user.id);
  box.innerHTML = `<ul class="members">${f.members.map(m =>
    `<li><i class="dot-color" style="background:#f0730a"></i>${esc(m.name)}${m.userId === f.ownerId ? ' <span class="badge repeat">관리자</span>' : ''}${m.userId === state.user.id ? ' <span class="hint">(나)</span>' : ''}</li>`
  ).join('')}</ul>
    <div class="project-add"><input id="myName" maxlength="30" value="${esc(me?.name || '')}" placeholder="내 표시 이름"><button id="renameMe" class="tool">저장</button></div>
    ${f.isAdmin
      ? `<div class="code-line">초대 코드 <b class="code">${esc(f.code)}</b><button id="regenCode" class="text-button">재발급</button></div>`
      : `<button id="leaveFamily" class="text-button">가족 나가기</button>`}`;
}

// 시세·투자 패널은 계정 설정으로, 토글 버튼은 관리자(또는 가족 없음)에게만.
export function applyMarketVisibility() {
  const on = !!state.settings.showMarket;
  $('.market-card').hidden = !on;
  $('.investment-card').hidden = !on;
  const btn = $('#toggleMarket');
  btn.hidden = !(!state.family || state.family.isAdmin);
  btn.textContent = on ? '시세·투자 숨기기' : '시세·투자 보기';
}
```

- [ ] **Step 4: app.js**

import 줄 교체/추가:

```js
import { iso, isValidFamilyCode, rpcErrorMessage } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay, renderFamily, applyMarketVisibility, setFamilyStatus } from './ui.js';
import { loadFamily, createFamily, joinFamily, leaveFamily, regenerateCode, renameMe, defaultDisplayName } from './family.js';
import { loadSettings, setShowMarket } from './settings.js';
```

`onAddProject` 뒤에 추가:

```js
async function handleFamilyAction(e) {
  const id = e.target.id;
  if (!id) return;
  const name = defaultDisplayName(state.user);
  let err = null;
  if (id === 'createFamily') err = await createFamily(name);
  else if (id === 'joinFamily') {
    const code = $('#joinCode').value;
    if (!isValidFamilyCode(code)) return alert('코드는 6자리입니다.');
    err = await joinFamily(code, name);
  }
  else if (id === 'renameMe') err = await renameMe($('#myName').value);
  else if (id === 'regenCode') err = await regenerateCode();
  else if (id === 'leaveFamily') {
    if (!confirm('가족에서 나갈까요? 가족 일정이 더 이상 보이지 않습니다.')) return;
    err = await leaveFamily();
  }
  else return;
  if (err) return alert(rpcErrorMessage(err));
  await load();          // 가족 업무가 들어오거나 빠진다
  renderFamily();
  applyMarketVisibility();
}

async function onToggleMarket() {
  const err = await setShowMarket(!state.settings.showMarket);
  if (err) return alert(err.message || '설정을 저장하지 못했습니다.');
  applyMarketVisibility();
  if (state.settings.showMarket) { renderInvestment(); loadMarket(); }
}
```

`start()`의 `const projErr = await loadProjects();` … `loadMarket();` 부분을 다음으로 교체한다:

```js
  const projErr = await loadProjects();
  setProjectStatus(projErr ? '프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다.' : '');
  const famErr = await loadFamily();
  setFamilyStatus(famErr ? '가족 정보를 불러오지 못했습니다. SQL 마이그레이션을 확인해 주세요.' : '');
  await loadSettings();
  await load();
  const migErr = await migrateLocalProjects();
  if (migErr) setProjectStatus('프로젝트 목록을 옮기지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  const fixErr = await ensureFixedProjects();
  if (fixErr) setProjectStatus('기본 프로젝트를 만들지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  renderProjects();
  renderFamily();
  applyMarketVisibility();
  if (state.settings.showMarket) { renderInvestment(); loadMarket(); }
```

이벤트 바인딩(`$('#addProject').onclick = onAddProject;` 뒤). `#joinCode`는 `renderFamily()`가 나중에 만들므로 `#familyBody`에 위임한다:

```js
$('#familyBody').addEventListener('click', handleFamilyAction);
$('#familyBody').addEventListener('keydown', e => {
  if (e.target.id === 'joinCode' && e.key === 'Enter') { e.preventDefault(); $('#joinFamily')?.click(); }
});
$('#toggleMarket').onclick = onToggleMarket;
```

- [ ] **Step 5: 확인**

```bash
for f in app.js ui.js; do node --check "$f" || echo "FAIL $f"; done
npm test
grep -c 'id="familyBody"' index.html; grep -c 'market-card" hidden' index.html
```
Expected: FAIL 없음, `# pass 22`, 둘 다 `1`.

로컬: `python -m http.server 8080 --bind 127.0.0.1 & SRV=$!` → 브라우저로 `http://127.0.0.1:8080/` 콘솔 에러 0(로그인 오버레이 정상), `document.getElementById('familyBody')` 존재, `.market-card` `hidden` true. `kill $SRV`.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css ui.js app.js
git commit -m "feat: family card with invite code, admin-only market toggle"
```

---

### Task 6: 배포 + 2계정 프로덕션 검증 + 문서

**전제:** Task 1 Step 5의 SQL 적용.

- [ ] **Step 1: 로컬 정적 서빙 확인** (`/`, `/app.js`, `/family.js`, `/settings.js`, `/ui.js`, `/styles.css` → 200)

- [ ] **Step 2: main 병합 + push**

```bash
git checkout main && git merge --ff-only feat/family && git push origin main
```
`curl -s https://my-work-desk.vercel.app/family.js | grep -c join_family` → 1.

- [ ] **Step 3: 프로덕션 검증 (Claude in Chrome, 계정 2개)**

`woosungfsm@gmail.com`(관리자 역할)과 `bethebrave91@gmail.com`(구성원 역할)을 번갈아 로그인한다(로그아웃 → Google 계정 선택). 각 항목을 화면·DOM에서 확인하고 번호대로 기록. 어긋나면 중단.

1. woosungfsm: 콘솔 에러 0. 가족 카드에 [가족 만들기]/[코드 입력]. 툴바에 "시세·투자 보기" 버튼 있음, 시세/투자 카드 숨김.
2. woosungfsm: 가족 만들기 → 구성원 1명(이름, "관리자"), 초대 코드 6자리 표시. 코드를 기록.
3. woosungfsm: "가족검증-A" 업무를 프로젝트 "가족 일정"으로 생성, "개인검증-B"를 "개인 일정"으로 생성. DB에서 A의 `family_id`가 가족 id, B는 null.
4. "시세·투자 보기" 클릭 → 두 카드 표시, 버튼 문구 "숨기기". 새로고침 후에도 유지(설정 저장).
5. 로그아웃 → bethebrave91 로그인: 가족 카드에 코드 입력 → 참여 → 구성원 2명. 툴바에 시세·투자 버튼 **없음**, 카드 **없음**.
6. bethebrave91: 오늘 목록에 "가족검증-A" 보임, 메타에 작성자 이름. "개인검증-B" **안 보임**. 캘린더에도 A만.
7. bethebrave91: A 완료 체크 → 성공. A 제목 "가족검증-A2"로 수정 → 성공. 잘못된 코드 시나리오는 이미 가족이 있으니 건너뜀.
8. 로그아웃 → woosungfsm: A가 완료 상태 + 제목 A2로 보임. A2의 프로젝트를 "개인 일정"으로 바꿔 저장.
9. 로그아웃 → bethebrave91: A2 **안 보임**(family_id null). 가족 카드 [가족 나가기] → 확인 → 카드가 [만들기/코드 입력] 상태로.
10. 로그아웃 → woosungfsm: 구성원 1명. 검증 업무 A2·B 삭제. 가족은 유지.

- [ ] **Step 4: SESSION_HANDOFF.md + Commit + push**

"업무/일정 기능"에 추가:
```
- 가족 공유: 초대 코드로 계정을 묶고 "가족 일정" 프로젝트 업무만 공유(둘 다 수정·완료·삭제). 작성자 이름 표시
- 시세·투자 패널은 계정 설정(`work_settings.show_market`, 기본 꺼짐). 토글은 가족 관리자(또는 가족 없음)에게만
```
"운영 원칙"에 추가: `work_tasks` RLS는 "본인 또는 내 가족(family_id)". `create_family`/`join_family`는 security definer RPC.
"다음 스펙 후보"에서 가족 공유를 지우고 번호를 당긴다.

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: update handoff for family sharing"
git push origin main
```
