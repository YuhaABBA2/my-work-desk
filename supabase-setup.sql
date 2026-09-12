-- Supabase SQL Editor에서 한 번만 실행하세요.
create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  task_date date not null,
  priority text not null default 'middle' check (priority in ('high','middle','low')),
  project text,
  task_time time,
  note text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_tasks enable row level security;

create policy "Users manage only their own work tasks"
on public.work_tasks for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists work_tasks_user_date_idx
on public.work_tasks (user_id, task_date);

-- ---------- 프로젝트 목록 (기기 간 동기화) ----------
create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.work_projects enable row level security;

drop policy if exists "Users manage only their own work projects" on public.work_projects;
create policy "Users manage only their own work projects"
on public.work_projects for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ---------- 반복 일정 묶음 ----------
alter table public.work_tasks add column if not exists series_id uuid;

create index if not exists work_tasks_user_series_idx
on public.work_tasks (user_id, series_id);

-- ---------- 기간 · 알림 시점 ----------
alter table public.work_tasks add column if not exists end_date date;
alter table public.work_tasks add column if not exists remind_1h boolean not null default false;
alter table public.work_tasks add column if not exists remind_1d boolean not null default false;
alter table public.work_tasks drop constraint if exists work_tasks_end_after_start;
alter table public.work_tasks add constraint work_tasks_end_after_start
  check (end_date is null or end_date >= task_date);

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

-- ---------- 가족 공유 보안 보강 (리뷰 반영) ----------
-- 1) RPC/도우미는 로그인 사용자만. Supabase 기본 권한이 anon 에도 EXECUTE 를 주므로 명시적으로 회수한다.
revoke execute on function public.my_family_ids() from anon;
revoke execute on function public.create_family(text, text) from anon;
revoke execute on function public.join_family(text, text) from anon;

-- 2) work_tasks.user_id 는 바꿀 수 없다 (작성자 고정). 컬럼 단위 UPDATE 권한으로 막는다.
revoke update on public.work_tasks from authenticated;
grant update (title, task_date, end_date, priority, project, task_time, remind_1h, remind_1d, note, done, series_id, family_id, updated_at)
  on public.work_tasks to authenticated;

-- 3) family_members 는 표시 이름만 고칠 수 있다 (family_id 갈아타기 금지).
revoke update on public.family_members from authenticated;
grant update (display_name) on public.family_members to authenticated;

-- 4) 가족을 나간 뒤에도 본인이 만든 업무는 계속 고칠 수 있어야 한다.
drop policy if exists work_tasks_update on public.work_tasks;
create policy work_tasks_update on public.work_tasks for update to authenticated
  using (user_id = (select auth.uid()) or family_id in (select public.my_family_ids()))
  with check (user_id = (select auth.uid()) or family_id is null or family_id in (select public.my_family_ids()));
