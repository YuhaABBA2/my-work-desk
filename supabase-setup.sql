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
  show_notes boolean not null default false,
  market_symbols jsonb,
  updated_at timestamptz not null default now()
);
-- 2026-09-14: 아이디어 노트 켜기/끄기 (기존 설치용)
alter table public.work_settings add column if not exists show_notes boolean not null default false;
-- 2026-09-15: 투자 지표 관심 목록 (null = 기본 7종)
alter table public.work_settings add column if not exists market_symbols jsonb;

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

-- ---------- 푸시 알림 (Web Push) ----------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.notification_log (
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('1h', '1d')),
  sent_at timestamptz not null default now(),
  primary key (task_id, user_id, reminder_kind)
);
alter table public.notification_log enable row level security;
drop policy if exists notification_log_read on public.notification_log;
create policy notification_log_read on public.notification_log for select to authenticated
  using (user_id = (select auth.uid()));
-- 삽입은 service_role (크론) 만.

-- ---------- 응원 이모지 (가족 업무에만) ----------
-- 한 사용자가 한 업무에 여러 이모지를 붙일 수 있다. PK = (task, user, emoji).
create table if not exists public.task_reactions (
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id, emoji)
);
create index if not exists task_reactions_task_idx on public.task_reactions(task_id);
alter table public.task_reactions enable row level security;

-- SELECT: 그 업무를 볼 수 있는 가족 구성원 전체.
drop policy if exists task_reactions_select on public.task_reactions;
create policy task_reactions_select on public.task_reactions for select to authenticated
  using (
    exists (
      select 1 from public.work_tasks t
      where t.id = task_reactions.task_id
        and (t.user_id = (select auth.uid()) or t.family_id in (select public.my_family_ids()))
    )
  );

-- INSERT/DELETE: 나 자신의 반응만, 가족 공유 업무(family_id 있음)에만.
drop policy if exists task_reactions_insert on public.task_reactions;
create policy task_reactions_insert on public.task_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.work_tasks t
      where t.id = task_reactions.task_id
        and t.family_id in (select public.my_family_ids())
    )
  );

drop policy if exists task_reactions_delete on public.task_reactions;
create policy task_reactions_delete on public.task_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- 아이디어 노트 (제텔카스텐, 본인 전용) ----------
create table if not exists public.work_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists work_notes_user_title_idx
on public.work_notes (user_id, lower(btrim(title)));

alter table public.work_notes enable row level security;

drop policy if exists "Users manage only their own work notes" on public.work_notes;
create policy "Users manage only their own work notes"
on public.work_notes for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 2026-09-15: 노트 종류 + 첨부파일
alter table public.work_notes add column if not exists kind text not null default 'idea' check (kind in ('idea','memo','meeting'));
create table if not exists public.work_note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.work_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique,
  name text not null,
  mime text not null default '',
  size integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists work_note_files_note_idx on public.work_note_files(note_id);
alter table public.work_note_files enable row level security;
drop policy if exists work_note_files_all on public.work_note_files;
create policy work_note_files_all on public.work_note_files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 스토리지: 비공개 버킷, 10MB. 경로 첫 폴더 = 내 uid 인 객체만.
insert into storage.buckets (id, name, public, file_size_limit) values ('note-files', 'note-files', false, 10485760)
  on conflict (id) do update set public = false, file_size_limit = 10485760;
drop policy if exists note_files_select on storage.objects;
drop policy if exists note_files_insert on storage.objects;
drop policy if exists note_files_delete on storage.objects;
create policy note_files_select on storage.objects for select to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy note_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy note_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 홈화면 위젯 토큰 (2026-09-24) ----------
-- 위젯은 로그인 세션이 없다. 이 토큰이 든 주소 하나로만 신원을 확인한다.
-- 그래서 계정당 1개만 살려두고, 새로 발급하면 옛 것은 즉시 죽는다.
-- 읽는 쪽은 pig-farm-log /api/widget (service_role).
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

-- ---------- 업무 도우미 (2026-09-26) — 전부 빈 칸 추가, 기존 행·화면에 영향 없음 ----------
-- 미리 보기 기한: 기한 N일 전부터 "다가오는 기한" 에 띄운다 (계약 갱신 D-30 등)
alter table public.work_tasks add column if not exists lead_days integer
  check (lead_days is null or lead_days between 1 and 365);
-- 회신 대기: 회신을 기다리는 곳(예: 영업1지구). 채워지면 "회신 대기" 로 모이고 기한이 지나면 "재촉"
alter table public.work_tasks add column if not exists waiting_on text
  check (waiting_on is null or char_length(waiting_on) <= 60);
-- 준비 단계 묶음: 본 일정과 준비 단계 일정이 같은 값을 가진다 (본 일정 날짜를 옮기면 같이 옮긴다)
alter table public.work_tasks add column if not exists bundle_id uuid;
create index if not exists work_tasks_bundle_idx on public.work_tasks(bundle_id) where bundle_id is not null;
-- 준비 단계 템플릿(한 줄에 하나: "D-10 요청 메일") — 마지막에 쓴 것을 기억해 다음에 채운다
alter table public.work_settings add column if not exists prep_steps text
  check (prep_steps is null or char_length(prep_steps) <= 1000);
-- ⚠️ work_tasks 는 컬럼 단위 UPDATE 권한이다(user_id 고정, 위 "2)" 참고). 새 칸을 만들면 여기에 더해야
-- 수정 저장이 된다 — 빠뜨려 2026-09-25~26 모든 일정 수정이 "permission denied" 로 거절됐다.
-- bundle_id 는 앱이 만들 때만 넣고 고치지 않으므로 일부러 주지 않는다.
grant update (lead_days, waiting_on) on public.work_tasks to authenticated;
