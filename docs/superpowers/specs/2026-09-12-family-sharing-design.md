# 가족 공유 설계 (초대 코드 · 가족 일정 공유 · 관리자 전용 패널)

날짜: 2026-09-12
대상: `YuhaABBA2/my-work-desk` (정적 Vercel, Supabase Auth + `work_tasks`/`work_projects`, ES 모듈)
선행: `2026-09-12-form-ui-improvements-design.md` — 고정 프로젝트 "가족 일정" 존재. 프로덕션 반영 완료.

## 배경 / 요청

- 사용자와 배우자 두 사람이 같은 앱을 각자 Google 계정으로 쓰면서 **"가족 일정" 프로젝트의 업무만 공유**한다.
- 회사 업무·개인 일정·투자 등 나머지는 각자 것.
- 축산 시세·투자 지표 패널은 **사용자 계정(관리자)에게만** 보이고, 관리자가 켜고 끌 수 있다.

## 결정 사항 (브레인스토밍)

- 계정 묶기: **초대 코드**. 가족을 만든 계정이 관리자. 배우자는 로그인 후 코드 입력.
- 공유 범위: **둘 다 추가·수정·완료·삭제** 가능. 카드에 작성자 이름 표시.
- 시세·투자 패널: 계정별 설정 `show_market`, 기본 꺼짐. 토글은 **가족 관리자(또는 가족이 없는 사용자)에게만** 보임. 구성원에겐 패널·토글 모두 없음.

## 범위 밖

- 가족 2개 이상 소속, 가족 삭제, 구성원 강제 퇴출, 역할 변경.
- 가족 프로젝트 목록 공유(각자 자기 프로젝트 목록을 가짐. "가족 일정"은 양쪽 모두 고정 프로젝트로 존재).
- 알림 발송(다음 스펙). 공유 업무의 알림 시점 값은 저장돼 있으니 발송 스펙에서 "구성원 각자에게"로 다룬다.
- 실시간 갱신(Realtime). 상대가 바꾼 내용은 새로고침/다음 로드에 보인다.

## 데이터 모델

### 새 테이블

```sql
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
create unique index if not exists family_members_user_idx on public.family_members(user_id); -- 한 사람 한 가족

create table if not exists public.work_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_market boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.work_tasks add column if not exists family_id uuid references public.families(id) on delete set null;
create index if not exists work_tasks_family_idx on public.work_tasks(family_id);
```

### 도우미 함수 (RLS 재귀 방지)

```sql
create or replace function public.my_family_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select family_id from public.family_members where user_id = auth.uid();
$$;
revoke all on function public.my_family_ids() from public;
grant execute on function public.my_family_ids() to authenticated;
```

### RLS

| 테이블 | select | insert | update | delete |
|---|---|---|---|---|
| `families` | `id in (select my_family_ids())` — 코드로 찾기는 RPC가 담당 | 없음 (RPC) | `owner_id = auth.uid()` (코드 재발급) | 없음 |
| `family_members` | `family_id in (select my_family_ids())` | 없음 (RPC) | `user_id = auth.uid()` (표시 이름) | `user_id = auth.uid()` (나가기) |
| `work_settings` | for all: `user_id = auth.uid()` (using/with check 동일) | | | |
| `work_tasks` | `user_id = auth.uid() or family_id in (select my_family_ids())` | with check `user_id = auth.uid() and (family_id is null or family_id in (select my_family_ids()))` | using = select 조건; with check `family_id is null or family_id in (select my_family_ids())` (작성자 `user_id`는 그대로, 상대가 고칠 수 있음) | using = select 조건 |

`families`의 select가 내 가족으로 한정되므로 **가입 전에는 코드로 가족을 못 찾는다**. 그래서 가족 만들기/참여는 `security definer` RPC로 한다(원자성 + 기존 "가족 일정" 업무 소급 적용 포함):

```sql
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
```

코드 unique 충돌(23505)이면 클라이언트가 새 코드로 재시도(최대 3회). 코드는 브라우저에서 `crypto.getRandomValues`로 6자 생성. 허용 문자는 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`(혼동 문자 `0 O 1 I` 제외). DB check는 `^[A-Z0-9]{6}$`로 느슨하게 둔다.

## 동작

### 저장 규칙

`family_id = (project === '가족 일정' && state.family) ? state.family.id : null` — 추가·수정("이 일정만"/"이후 모두" 모두) 시 항상 이 규칙으로 계산해 `work_tasks.family_id`에 쓴다. 반복 생성 시 모든 회차에 같은 값. "이후 모두"에서는 시리즈 필드에 `family_id`를 포함한다(프로젝트 변경과 함께 움직여야 하므로).

### 로그인 후 순서

`loadProjects → load → migrateLocalProjects → ensureFixedProjects → loadFamily → loadSettings → renderProjects → renderFamily → applyMarketVisibility`

- `loadFamily()`: `family_members`에서 내 행 → 같은 `family_id`의 구성원 전체 + `families` 행. `state.family = { id, code, ownerId, isAdmin, members: [{ userId, name }] } | null`.
- `loadSettings()`: `work_settings` 내 행. 없으면 `{ showMarket: false }`.
- `load()`는 지금처럼 `select('*')` — RLS가 가족 업무까지 돌려준다. 매핑에 `userId: x.user_id`, `familyId: x.family_id` 추가.
- 가족 업무는 `load()` 결과에 섞여 들어오므로 오늘 목록·이번 주·캘린더·프로젝트 진행률에 자동 포함된다.

### 가족 카드 (`#familyCard`, 프로젝트 관리 카드 아래)

- 가족 없음: `[가족 만들기]` 버튼, `[코드 입력 ______] [참여]`.
- 가족 있음: "구성원" 목록(이름, 관리자에게 "관리자" 표시), `내 이름 [____] [저장]`, 관리자면 `초대 코드 ABC123 [재발급]`, 구성원이면 `[나가기]`(confirm).
- 표시 이름 초기값: `session.user.user_metadata.full_name || user_metadata.name || 이메일 @ 앞부분`, 30자 절단.
- 재발급: `families.update({ code })` — owner만 RLS 통과. 충돌 시 재시도.
- 나가기: `family_members.delete()` 내 행 → `state.family = null` → `load()` 다시(가족 업무가 목록에서 사라짐). 내가 만든 가족 업무는 DB에 남는다.

### 업무 카드

- `t.familyId && t.userId !== state.user.id` 이면 메타 끝에 `· <작성자 이름>` (구성원 목록에서 `userId`로 찾고, 없으면 "가족").
- 그 외 표시 규칙은 스펙 2와 동일(가족 일정 색 주황).

### 시세·투자 패널

- `state.settings.showMarket === true`일 때만 `.market-card`, `.investment-card` 표시(`hidden` 해제) + `loadMarket()`/`renderInvestment()` 호출. 기본 숨김.
- 툴바 토글 버튼 `#toggleMarket`: 문구 `시세·투자 보기` / `시세·투자 숨기기`. **표시 조건** `!state.family || state.family.isAdmin`. 클릭 시 `work_settings` upsert 후 `applyMarketVisibility()`.

### 에러 문구

| 상황 | 문구 |
|---|---|
| RPC `CODE_NOT_FOUND` | `코드를 찾을 수 없습니다.` |
| RPC `ALREADY_MEMBER` | `이미 가족에 속해 있습니다.` |
| 코드 형식 아님(클라이언트) | `코드는 6자리입니다.` |
| 그 외 Supabase 에러 | 기존 패턴 `alert(error.message)` |

## 코드 변경 위치

| 파일 | 변경 |
|---|---|
| `supabase-setup.sql` | 테이블 3개, 함수 3개, 컬럼, `work_tasks` 정책 교체(기존 1개 drop → select/insert/update/delete 4개) |
| `lib.js` | `CODE_ALPHABET`, `familyCodeFrom(bytes: Uint8Array) → string`(순수), `familyIdFor(project, family) → string|null`, `authorLabel(task, myId, members) → string`('' 또는 이름/"가족"), `rpcErrorMessage(err) → string` |
| `family.js` (신규) | `loadFamily`, `createFamily(name)`, `joinFamily(code, name)`, `leaveFamily`, `regenerateCode`, `renameMe(name)` — 각 `error|null` |
| `settings.js` (신규) | `loadSettings`, `setShowMarket(on)` |
| `state.js` | `state.family = null`, `state.settings = { showMarket: false }` |
| `tasks.js` | 매핑 `userId`/`familyId`; `readForm`에 `family_id: familyIdFor(project, state.family)`; 시리즈 필드에 포함 |
| `ui.js` | `renderFamily()`, `taskMeta`에 작성자, `applyMarketVisibility()` |
| `app.js` | 로그인 순서, 가족 카드 이벤트, 토글 |
| `index.html` | 가족 카드, `#toggleMarket` 버튼, 시세/투자 카드 `hidden` 초기값 |
| `styles.css` | 가족 카드·코드 표시 |
| `tests/lib.test.mjs` | 새 순수 함수 |

## 마이그레이션·검증

- SQL 먼저. `work_tasks`의 기존 정책 "Users manage only their own work tasks"를 drop하고 4개로 교체. 기존 행은 `family_id null` → 지금과 동일하게 보인다.
- 배포 직후 시세·투자는 기본 숨김. 관리자가 토글을 한 번 켜야 한다.
- 순수 함수 테스트: `familyCodeFrom`(길이 6, 알파벳 내 문자만, 같은 바이트→같은 코드), `familyIdFor`(가족 일정+가족 있음 → id, 그 외 null), `authorLabel`(내 것/가족 아님 → '', 남의 가족 업무 → 이름, 목록에 없으면 '가족'), `rpcErrorMessage`.
- 프로덕션 검증(계정 2개: `woosungfsm` 관리자, `bethebrave91` 구성원 역할 — 같은 Chrome에 두 계정 모두 로그인돼 있음):
  1. woosungfsm 가족 만들기 → 코드 표시, 구성원 1명(관리자).
  2. bethebrave91 코드 입력 → 양쪽 구성원 2명.
  3. woosungfsm이 "가족 일정" 업무 생성 → bethebrave91 오늘 목록·캘린더에 보이고 작성자 이름 표시.
  4. bethebrave91이 완료 체크·제목 수정 → woosungfsm 새로고침 후 반영.
  5. woosungfsm "개인 일정" 업무는 bethebrave91에게 안 보임.
  6. 시세·투자: woosungfsm에만 토글, 켜면 패널 표시; bethebrave91엔 토글·패널 없음.
  7. 가족 업무의 프로젝트를 개인 일정으로 바꾸면 상대에게서 사라짐.
  8. 정리: 검증 업무 삭제, bethebrave91 나가기, 가족은 유지(실사용 시작점).
