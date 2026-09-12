# 업무 데이터 통합 설계 (프로젝트 동기화 + 반복 시리즈)

날짜: 2026-09-12
대상 저장소: `YuhaABBA2/my-work-desk` (정적 Vercel 배포, Supabase Auth + `work_tasks`)

## 배경 / 문제

- 업무(`work_tasks`)는 Supabase에 있어 기기 간 동기화되지만, **프로젝트 목록은 `localStorage`** 에만 있어 폰과 PC가 서로 다르다.
- 반복 일정은 N개의 독립 행으로 복사될 뿐 **묶음 정보가 없어** 하나를 고치면 나머지는 그대로다.
- 그 결과 "어디에 입력했더라 / 어디서 봐야 하지"가 제각각이 되어 입력과 조회 모두 불편하다.

## 목표

1. 프로젝트 목록을 Supabase로 옮겨 로그인한 계정 기준으로 모든 기기에서 동일하게 보이게 한다.
2. 반복 일정을 시리즈로 묶고, 수정·삭제 시 "이 일정만 / 이후 모두"를 선택할 수 있게 한다.
3. 정적 배포·publishable key·`work_tasks` 범위 RLS라는 기존 운영 원칙을 유지한다.

## 범위 밖

- 반복 규칙 확장(종료일까지 무한 반복, 요일 지정 등). 규칙은 매일/매주/매월·최대 24회 그대로.
- 프로젝트 이름 변경. (없으므로 `project`를 FK로 바꾸지 않는다.)
- "이후 모두"로 날짜를 옮기는 것(반복 간격 이동).
- 다른 앱(pig-farm-log 등)의 할 일을 모아 보는 허브 기능 — 별도 스펙.
- 축산 시세 수치화 — 별도 스펙.
- 다크모드·완료 숨김 설정은 기기별 취향이므로 `localStorage` 유지.

## 데이터 모델

### 새 테이블 `work_projects`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| user_id | uuid not null | `auth.users(id)` on delete cascade |
| name | text not null | `(user_id, name)` unique, 길이 1~50 |
| sort_order | int not null default 0 | 목록 순서 |
| created_at | timestamptz default now() | |

RLS: `work_tasks`와 동일 — `authenticated`에 대해 `auth.uid() = user_id`로 select/insert/update/delete.

### `work_tasks` 변경

- `series_id uuid null` 컬럼 추가. 단발 일정은 null.
- 인덱스 `work_tasks_user_series_idx (user_id, series_id)`.
- `project`는 텍스트 이름 그대로 유지. 프로젝트를 삭제해도 그 이름이 붙은 업무는 남는다(현재와 동일).

### SQL (`supabase-setup.sql`에 추가)

```sql
create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.work_projects enable row level security;
create policy "Users manage only their own work projects"
on public.work_projects for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table public.work_tasks add column if not exists series_id uuid;
create index if not exists work_tasks_user_series_idx
on public.work_tasks (user_id, series_id);
```

사용자가 Supabase SQL Editor에서 직접 실행한다. `pig_price` 등 다른 테이블은 건드리지 않는다.

## 동작

### 프로젝트

- 로그인 후 `work_projects`를 `sort_order, created_at` 순으로 읽어 셀렉트/목록에 사용.
- 추가: insert. 중복 이름은 unique 위반 → "이미 있는 프로젝트입니다" 표시.
- 삭제: delete. 업무의 `project` 텍스트는 그대로 둔다.
- **1회 이관**: 로그인 직후 `work_projects`가 0건이면
  1. 이 기기의 `localStorage.deskProjects` (없으면 기본 4개)
  2. 내 `work_tasks`의 distinct `project` 값
  을 합쳐 중복 제거 후 순서대로 insert하고, `localStorage.deskProjects`를 삭제한다.
  이미 행이 있는 기기/계정에서는 아무것도 하지 않고 localStorage 키만 지운다.

### 반복 시리즈

- **생성**: 반복 옵션으로 저장할 때 `crypto.randomUUID()`로 series_id 하나를 만들어 모든 행에 붙인다. 단발 저장은 null.
- **수정**: 편집 중인 일정에 series_id가 있으면 저장 버튼 클릭 시 `<dialog>`로 "이 일정만 / 이후 모두 / 취소"를 묻는다.
  - 이 일정만: 해당 id만 update (현재 동작).
  - 이후 모두: `update({title, task_time, priority, project, note, updated_at}).eq('series_id', s).gte('task_date', 원래 날짜)`. **날짜 변경분은 이 일정에만** 별도 update로 적용한다.
- **삭제**: 같은 dialog. 이후 모두 = `delete().eq('series_id', s).gte('task_date', 원래 날짜)`.
- **완료 체크**: 항상 개별. 묻지 않는다.
- series_id가 없는 일정은 dialog 없이 현재처럼 동작.

## 코드 구조

`app.js`(20KB 단일 파일)를 `<script type="module">`로 바꾸고 경계만 나눈다. 빌드 없음·정적 배포 유지.

| 파일 | 책임 |
|---|---|
| `supabase.js` | Supabase 클라이언트 생성(한 곳) |
| `app.js` | 진입점, `start()`, 이벤트 바인딩 |
| `tasks.js` | `work_tasks` CRUD, 시리즈 분기(이 일정만/이후 모두), 반복 날짜 생성 |
| `projects.js` | `work_projects` CRUD, 1회 이관 |
| `ui.js` | render/calendar/taskHTML 등 DOM 그리기, 시리즈 선택 dialog |
| `market.js` | 축산 시세·투자 링크 (기능 변경 없이 옮기기만; 스펙 2에서 교체) |

`index.html`에 시리즈 선택용 `<dialog id="seriesDialog">` 추가. `vercel.json` 캐시 설정은 새 `.js` 파일에도 동일 적용되는지 확인.

## 배포 순서와 에러 처리

1. SQL 먼저 실행 → 2. 코드 push(자동 배포).
- 순서가 어긋나 `work_projects` 조회가 실패하면 상태 영역에 "프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다"를 띄우고, 프로젝트 목록은 빈 상태로 두되 업무 기능은 계속 동작한다.
- Supabase 에러는 기존 패턴대로 상태 문구로 표시.
- "이후 모두"는 단일 update/delete 한 번이므로 부분 실패가 없다.

## 검증

자동 테스트 인프라가 없는 정적 앱이므로 실제 화면으로 확인한다.

1. `node --check` 각 모듈. 로컬 정적 서버에서 `/`, 모든 `.js`, `styles.css` 200, 콘솔 에러 0.
2. 실제 Google 로그인 후 프로젝트 추가 → 다른 브라우저 프로필로 로그인 → 같은 목록.
3. 반복 3회 생성 → 2번째를 "이후 모두"로 제목 변경 → 1번째 그대로, 2·3번째 변경.
4. 2번째를 "이후 모두" 삭제 → 1번째만 남음.
5. 기존 `localStorage.deskProjects`가 있는 브라우저에서 첫 로그인 → 1회 이관, 키 삭제, 재로그인 시 중복 없음.
6. 단발 일정 수정/삭제 시 dialog가 뜨지 않음.
7. 프로덕션 URL에서 2·3 재확인.
