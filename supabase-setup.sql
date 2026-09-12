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
