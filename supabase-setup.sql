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
