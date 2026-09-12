# 업무 데이터 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 목록을 Supabase `work_projects`로 옮겨 기기 간 동기화하고, 반복 일정을 `series_id`로 묶어 "이 일정만 / 이후 모두" 수정·삭제를 지원한다.

**Architecture:** 정적 Vercel 배포 + Supabase Auth/publishable key 구조는 그대로. 20KB 단일 `app.js`를 ES 모듈 6개로 경계만 나누고(`lib.js` 순수 함수, `state.js` 공유 상태, `supabase.js`, `ui.js`, `tasks.js`, `projects.js`, `market.js`, `app.js` 진입점), DOM에 의존하지 않는 순수 로직은 `node --test`로 검증한다. Supabase 스키마는 `supabase-setup.sql`에 추가하고 사용자가 SQL Editor에서 직접 실행한다.

**Tech Stack:** Vanilla JS (ES modules, 빌드 없음), Supabase JS v2 (CDN UMD), Node 24 내장 `node:test`, Python `http.server`(로컬 확인용), Vercel 정적 배포.

## Global Constraints

- service_role 키를 코드·문서·대화에 절대 넣지 않는다. 브라우저는 publishable key(`sb_publishable_…`, 이미 `app.js`에 있음)만 쓴다.
- `work_tasks`, `work_projects` 외 다른 테이블(`pig_price` 등)은 건드리지 않는다.
- 반복 규칙은 매일/매주/매월 · 최대 24회 그대로. 종료일 반복, 요일 지정, 프로젝트 이름 변경, "이후 모두"로 날짜 이동은 범위 밖.
- `work_tasks.project`는 텍스트 이름 그대로 유지(FK 아님). 프로젝트 삭제 시 업무의 `project` 텍스트는 남긴다.
- 다크모드·완료 숨김 설정은 `localStorage` 유지.
- 완료 체크는 항상 개별 행. 시리즈 dialog를 띄우지 않는다.
- 배포 순서: SQL 먼저 실행 → 코드 push. 코드는 `work_projects` 조회 실패 시 "프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다"를 띄우고 업무 기능은 계속 동작해야 한다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01G9J7WjVZ9wcXL5GQctGjiN
  ```
- 작업 폴더: `C:\Projects2\my-work-desk-github` (브랜치 `main`, origin = `YuhaABBA2/my-work-desk`). push는 사용자가 지시할 때만.

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `supabase-setup.sql` | 수정 | `work_projects` 테이블 + `work_tasks.series_id` 추가 SQL |
| `package.json` | 생성 | `"type": "module"` (브라우저 `.js` 모듈과 Node 테스트가 같은 파일을 쓰기 위해) + `npm test` |
| `lib.js` | 생성 | DOM/Supabase 의존 없는 순수 함수: 날짜, escape, 반복 날짜 생성, 프로젝트 병합, 시리즈 수정 분리 |
| `state.js` | 생성 | 공유 가변 상태(`state`)와 `settings`(localStorage), `today` |
| `supabase.js` | 생성 | Supabase 클라이언트 `sb` 한 곳에서 생성 |
| `ui.js` | 생성 | DOM 그리기: `$`, `render`, `renderProjects`, `calendar`, 폼 채우기/초기화, 상태 문구, 시리즈 선택 dialog |
| `tasks.js` | 생성 | `work_tasks` CRUD, 반복 생성(series_id 발급), "이 일정만/이후 모두" 분기 |
| `projects.js` | 생성 | `work_projects` CRUD, localStorage 1회 이관 |
| `market.js` | 생성 | 축산 시세 자리표시자 + 투자 링크 (기능 변경 없이 이동만) |
| `app.js` | 재작성 | 진입점: import, 이벤트 바인딩, `start()` |
| `index.html` | 수정 | `type="module"`, `#projectStatus`, `<dialog id="seriesDialog">` |
| `styles.css` | 수정 | `.status`, `.series-dialog` 스타일 |
| `tests/lib.test.mjs` | 생성 | `lib.js` 단위 테스트 |

---

### Task 1: Supabase 스키마 SQL

**Files:**
- Modify: `supabase-setup.sql` (파일 끝에 추가)

**Interfaces:**
- Produces: 테이블 `public.work_projects(id, user_id, name, sort_order, created_at)`, 컬럼 `public.work_tasks.series_id uuid null`. 이후 Task 3·4의 쿼리가 이 이름을 그대로 쓴다.

- [ ] **Step 1: SQL 추가**

`supabase-setup.sql` 끝에 다음을 붙인다:

```sql

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
```

- [ ] **Step 2: 문법 눈으로 확인**

`create table if not exists` / `add column if not exists` / `drop policy if exists`라 두 번 실행해도 안전한지 확인한다. `pig_price` 등 다른 테이블 언급이 없는지 확인한다.

- [ ] **Step 3: Commit**

```bash
git add supabase-setup.sql
git commit -m "feat(db): add work_projects table and work_tasks.series_id"
```

- [ ] **Step 4: 사용자에게 실행 요청**

사용자에게 다음을 전달하고 답을 기다린다 (자동화 불가 — DDL은 publishable key로 실행할 수 없다):

> `supabase-setup.sql`에 추가된 마지막 블록(`-- ---------- 프로젝트 목록` 이후)을 Supabase Dashboard → SQL Editor에 붙여 넣고 실행해 주세요. 끝나면 알려주세요. Task 5 검증 전까지만 되어 있으면 됩니다.

---

### Task 2: ES 모듈 분리 (동작 변경 없음) + 순수 함수 테스트

**Files:**
- Create: `package.json`, `lib.js`, `state.js`, `supabase.js`, `ui.js`, `tasks.js`, `projects.js`, `market.js`, `tests/lib.test.mjs`
- Rewrite: `app.js`
- Modify: `index.html:100-101`

**Interfaces:**
- Produces (`lib.js`): `iso(Date)→'YYYY-MM-DD'`, `parseIso(str)→Date(local midnight)`, `addDays(Date,n)`, `addMonths(Date,n)`, `esc(s)`, `pri(p)`, `sortTasks(a,b)`, `occurrenceDates(startIso, repeat, count)→string[]`, `repeatLabel(repeat)→'매일'|'매주'|'매월'|''`, `PROJECT_DEFAULTS`
- Produces (`state.js`): `today: Date`, `state: {view, tasks, user, editId, selectedDate, projects: string[], projectsReady: boolean}`, `settings: {hideDone, dark}`
- Produces (`supabase.js`): `sb`
- Produces (`ui.js`): `$`, `render()`, `renderProjects()`, `calendar()`, `resetForm()`, `fillEditForm(task)`, `selectDate(dateIso)`, `setProjectStatus(msg)`
- Produces (`tasks.js`): `load()`, `saveTask(e)`, `toggleTask(id)`, `editTask(id)`, `removeTask(id)`, `notifyDue()`
- Produces (`projects.js`): `loadProjects()→error|null`, `addProject(name)→error|null`, `deleteProject(name)→error|null`
- Produces (`market.js`): `loadMarket()`, `renderInvestment()`, `renderStockLinks()`

이 Task에서 `projects.js`는 아직 localStorage 기반이다(Task 3에서 Supabase로 교체). 이 Task의 목적은 "파일만 나누고 화면 동작은 그대로"이다.

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "my-work-desk",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

Vercel Framework Preset이 "Other"이고 Build Command가 비어 있으므로(`DEPLOY.md` 3번) `package.json`이 있어도 빌드 없이 루트를 정적 서빙한다.

- [ ] **Step 2: lib.js 실패 테스트 작성**

`tests/lib.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, parseIso, occurrenceDates, repeatLabel, esc, sortTasks } from '../lib.js';

test('parseIso → iso 왕복', () => {
  assert.equal(iso(parseIso('2026-09-12')), '2026-09-12');
  assert.equal(iso(parseIso('2026-01-01')), '2026-01-01');
});

test('occurrenceDates: none은 시작일 하나', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'none', 5), ['2026-09-12']);
});

test('occurrenceDates: daily/weekly/monthly', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'daily', 3), ['2026-09-12', '2026-09-13', '2026-09-14']);
  assert.deepEqual(occurrenceDates('2026-09-12', 'weekly', 3), ['2026-09-12', '2026-09-19', '2026-09-26']);
  assert.deepEqual(occurrenceDates('2026-01-31', 'monthly', 3), ['2026-01-31', '2026-03-03', '2026-03-31']);
});

test('occurrenceDates: count 최소 1', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'daily', 0), ['2026-09-12']);
});

test('repeatLabel', () => {
  assert.equal(repeatLabel('daily'), '매일');
  assert.equal(repeatLabel('weekly'), '매주');
  assert.equal(repeatLabel('monthly'), '매월');
  assert.equal(repeatLabel('none'), '');
});

test('esc escapes html', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('sortTasks: 날짜 → 시간 순', () => {
  const a = { date: '2026-09-12', time: '09:00' };
  const b = { date: '2026-09-12', time: '' };
  const c = { date: '2026-09-11', time: '23:00' };
  assert.deepEqual([a, b, c].sort(sortTasks), [c, b, a]);
});
```

참고: 2026-01-31 + 1개월은 JS `setMonth`가 2월 31일을 3월 3일로 넘기는 기존 동작이다. 이번 범위에서 고치지 않고 현재 동작을 고정한다.

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```
Expected: `Cannot find module '.../lib.js'` 로 실패.

- [ ] **Step 4: lib.js 작성**

```js
// DOM·Supabase에 의존하지 않는 순수 함수. node --test 로 검증한다.

export const PROJECT_DEFAULTS = ['회사 업무', '개인 일정', '투자 · 자산', 'Work Station'];

export function iso(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

// 'YYYY-MM-DD' 를 로컬 자정 Date 로. new Date('YYYY-MM-DD') 는 UTC 자정이라 KST 서쪽 시간대에서 하루가 밀린다.
export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
export function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
export function pri(p) { return p === 'high' ? '중요' : p === 'middle' ? '보통' : '여유'; }
export function sortTasks(a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); }

export function repeatLabel(repeat) {
  return repeat === 'daily' ? '매일' : repeat === 'weekly' ? '매주' : repeat === 'monthly' ? '매월' : '';
}

export function occurrenceDates(startIso, repeat, count) {
  const start = parseIso(startIso);
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    if (repeat === 'daily') return iso(addDays(start, i));
    if (repeat === 'weekly') return iso(addDays(start, i * 7));
    if (repeat === 'monthly') return iso(addMonths(start, i));
    return startIso;
  });
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 6: state.js 작성**

```js
export const today = new Date();
today.setHours(0, 0, 0, 0);

export const state = {
  view: new Date(today.getFullYear(), today.getMonth(), 1),
  tasks: [],
  user: null,
  editId: null,
  selectedDate: null,
  projects: [],        // 프로젝트 이름 목록 (Task 3부터 Supabase)
  projectsReady: false // work_projects 조회 성공 여부
};

// 기기별 취향은 localStorage 유지
export const settings = {
  get hideDone() { return localStorage.getItem('hideDone') === '1'; },
  set hideDone(v) { localStorage.setItem('hideDone', v ? '1' : '0'); },
  get dark() { return localStorage.getItem('darkMode') === '1'; },
  set dark(v) { localStorage.setItem('darkMode', v ? '1' : '0'); }
};
```

- [ ] **Step 7: supabase.js 작성**

```js
// publishable key 만 사용한다. service_role 키는 절대 여기에 두지 않는다.
const supabaseUrl = 'https://skihcfyndumifhaxamas.supabase.co';
const supabaseKey = 'sb_publishable_6igMLFNC7cYgN2gCjwUvpg_mYcsFN4B';
export const sb = window.supabase.createClient(supabaseUrl, supabaseKey);
```

- [ ] **Step 8: ui.js 작성**

```js
import { iso, addDays, esc, pri, sortTasks } from './lib.js';
import { today, state, settings } from './state.js';

export const $ = (s) => document.querySelector(s);

function visibleTasks() { return settings.hideDone ? state.tasks.filter(t => !t.done) : state.tasks; }

function dueInfo(t) {
  if (t.done) return '';
  const diff = Math.round((new Date(t.date) - today) / 86400000);
  if (diff < 0) return '<span class="due-badge overdue">지남</span>';
  if (diff === 0) return '<span class="due-badge today-due">오늘</span>';
  if (diff <= 3) return `<span class="due-badge soon">${diff}일</span>`;
  return '';
}

function taskHTML(t) {
  return `<div class="task ${t.done ? 'done' : ''}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${esc(t.id)}">
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${t.time ? esc(t.time) + ' · ' : ''}${esc(t.project || '미분류')}${t.note ? ' · ' + esc(t.note) : ''}</div>
    </div>
    ${dueInfo(t)}
    <span class="badge ${t.priority}">${pri(t.priority)}</span>
    <button class="edit" data-action="edit-task" data-id="${esc(t.id)}">수정</button>
    <button class="delete" aria-label="삭제" data-action="remove-task" data-id="${esc(t.id)}">×</button>
  </div>`;
}

export function render() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#toggleDone').textContent = settings.hideDone ? '완료 보이기' : '완료 숨기기';
  $('#darkMode').textContent = settings.dark ? '라이트모드' : '다크모드';

  const td = iso(today);
  const open = state.tasks.filter(t => !t.done);
  const done = state.tasks.filter(t => t.done);
  const shown = visibleTasks();
  $('#openCount').textContent = open.length;
  $('#doneCount').textContent = done.length;
  $('#todayTasks').innerHTML = shown.filter(t => t.date === td).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">오늘 등록된 업무가 없습니다.</div>';
  const until = iso(addDays(today, 7));
  $('#weekTasks').innerHTML = shown.filter(t => !t.done && t.date >= td && t.date <= until).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">이번 주 마감 업무가 없습니다.</div>';

  const dueSoon = open.filter(t => t.date <= iso(addDays(today, 3))).sort(sortTasks);
  $('#dueAlerts').innerHTML = dueSoon.length ? `<div class="alert">마감 임박 ${dueSoon.length}건: ${esc(dueSoon.slice(0, 3).map(t => t.title).join(', '))}</div>` : '';

  renderProjects();
  calendar();
}

export function setProjectStatus(msg) {
  const el = $('#projectStatus');
  if (el) el.textContent = msg || '';
}

export function renderProjects() {
  const favorites = state.projects;
  const fromTasks = [...new Set(state.tasks.map(t => t.project || '미분류'))];
  const allProjects = [...new Set([...favorites, ...fromTasks])];
  $('#projects').innerHTML = allProjects.map(p => `<option value="${esc(p)}">`).join('');
  $('#projectChips').innerHTML = favorites.map(p => `<span class="chip">${esc(p)} <button data-action="delete-project" data-project="${esc(p)}">×</button></span>`).join('');

  const ongoing = state.tasks.filter(t => !t.done);
  const groups = {};
  ongoing.forEach(t => { const p = t.project || '미분류'; (groups[p] ??= []).push(t); });
  $('#projectsView').innerHTML = Object.entries(groups).map(([p, items]) => {
    const all = state.tasks.filter(t => (t.project || '미분류') === p);
    const pct = Math.round((all.length - items.length) / all.length * 100);
    return `<div class="project"><div class="project-line"><span>${esc(p)}</span><span class="hint">${items.length}건 남음</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('') || '<div class="empty">프로젝트별 업무를 등록해 보세요.</div>';
}

export function calendar() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prev = new Date(y, m, 0).getDate();
  $('#monthLabel').textContent = `${y}년 ${m + 1}월`;
  let html = '';
  const shown = visibleTasks();
  for (let i = 0; i < 42; i++) {
    let n, dt, other = false;
    if (i < first) { n = prev - first + i + 1; dt = new Date(y, m - 1, n); other = true; }
    else if (i >= first + days) { n = i - first - days + 1; dt = new Date(y, m + 1, n); other = true; }
    else { n = i - first + 1; dt = new Date(y, m, n); }
    const dayIso = iso(dt);
    const list = shown.filter(t => t.date === dayIso).slice(0, 2);
    html += `<button class="day ${other ? 'other' : ''} ${dayIso === iso(today) ? 'today' : ''} ${dayIso === state.selectedDate ? 'selected' : ''}" data-date="${dayIso}"><b>${n}</b>${list.map(t => `<span class="dot">${esc(t.title)}</span>`).join('')}</button>`;
  }
  $('#calendar').innerHTML = html;
}

export function resetForm() {
  state.editId = null;
  $('#formTitle').textContent = '업무 · 일정 추가';
  $('#submitTask').textContent = '추가하기';
  $('#cancelEdit').hidden = true;
  $('#repeat').disabled = false;
  $('#repeatCount').disabled = false;
  $('#addForm').reset();
  $('#date').value = state.selectedDate || iso(today);
  $('#repeatCount').value = 1;
}

export function fillEditForm(t) {
  state.editId = t.id;
  $('#formTitle').textContent = '업무 · 일정 수정';
  $('#submitTask').textContent = '수정 저장';
  $('#cancelEdit').hidden = false;
  $('#title').value = t.title;
  $('#date').value = t.date;
  $('#priority').value = t.priority;
  $('#project').value = t.project || '';
  $('#time').value = t.time || '';
  $('#note').value = t.note || '';
  $('#repeat').value = 'none';
  $('#repeat').disabled = true;
  $('#repeatCount').disabled = true;
  $('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function selectDate(date) {
  state.selectedDate = date;
  $('#date').value = date;
  calendar();
  $('#title').focus();
  $('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

- [ ] **Step 9: tasks.js 작성 (아직 시리즈 없음 — 기존 동작 그대로)**

```js
import { sb } from './supabase.js';
import { state, today } from './state.js';
import { iso, addDays, sortTasks, occurrenceDates, repeatLabel } from './lib.js';
import { $, render, resetForm, fillEditForm } from './ui.js';

export async function load() {
  const { data, error } = await sb.from('work_tasks').select('*').order('task_date').order('task_time');
  if (error) return alert('업무 목록을 불러오지 못했습니다. Supabase 설정을 확인해 주세요.');
  state.tasks = data.map(x => ({
    id: x.id,
    title: x.title,
    date: x.task_date,
    priority: x.priority,
    project: x.project,
    time: x.task_time?.slice(0, 5) || '',
    note: x.note,
    done: x.done
  }));
  render();
}

function readForm() {
  return {
    title: $('#title').value.trim(),
    task_date: $('#date').value,
    priority: $('#priority').value,
    project: $('#project').value.trim() || null,
    task_time: $('#time').value || null,
    note: $('#note').value.trim() || null,
    updated_at: new Date().toISOString()
  };
}

export async function saveTask(e) {
  e.preventDefault();
  const base = readForm();
  if (state.editId) {
    const { error } = await sb.from('work_tasks').update(base).eq('id', state.editId);
    if (error) return alert('수정하지 못했습니다.');
    await load();
    resetForm();
    return;
  }
  const repeat = $('#repeat').value;
  const count = repeat === 'none' ? 1 : Math.min(24, Math.max(1, Number($('#repeatCount').value || 1)));
  const records = occurrenceDates(base.task_date, repeat, count).map((date, i) => ({
    user_id: state.user.id,
    title: base.title,
    task_date: date,
    priority: base.priority,
    project: base.project,
    task_time: base.task_time,
    note: repeat === 'none' ? base.note : [base.note, `${repeatLabel(repeat)} 반복 ${i + 1}/${count}`].filter(Boolean).join(' · ')
  }));
  const { error } = await sb.from('work_tasks').insert(records);
  if (error) return alert('저장하지 못했습니다. Supabase 테이블 설정을 확인해 주세요.');
  await load();
  resetForm();
}

export async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  const { error } = await sb.from('work_tasks').update({ done: !t.done, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('저장하지 못했습니다.');
  t.done = !t.done;
  render();
}

export function editTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) fillEditForm(t);
}

export async function removeTask(id) {
  if (!confirm('이 업무를 삭제할까요?')) return;
  const { error } = await sb.from('work_tasks').delete().eq('id', id);
  if (error) return alert('삭제하지 못했습니다.');
  state.tasks = state.tasks.filter(t => t.id !== id);
  render();
}

export async function notifyDue() {
  const due = state.tasks.filter(t => !t.done && t.date <= iso(addDays(today, 3))).sort(sortTasks);
  if (!due.length) return alert('마감 임박 업무가 없습니다.');
  if (!('Notification' in window)) return alert('이 브라우저는 알림을 지원하지 않습니다.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return;
  new Notification('마감 임박 업무', { body: due.slice(0, 4).map(t => t.title).join(', ') });
}
```

- [ ] **Step 10: projects.js 작성 (이 Task에서는 localStorage 그대로)**

```js
import { state } from './state.js';
import { PROJECT_DEFAULTS } from './lib.js';

// Task 3 에서 Supabase work_projects 로 교체된다.
function read() {
  try {
    return JSON.parse(localStorage.getItem('deskProjects') || 'null') ?? PROJECT_DEFAULTS;
  } catch (_err) {
    return PROJECT_DEFAULTS;
  }
}
function write(v) { localStorage.setItem('deskProjects', JSON.stringify([...new Set(v.filter(Boolean))])); }

export async function loadProjects() {
  state.projects = read();
  state.projectsReady = true;
  return null;
}

export async function addProject(name) {
  name = name.trim();
  if (!name) return null;
  write([...read(), name]);
  return loadProjects();
}

export async function deleteProject(name) {
  write(read().filter(p => p !== name));
  return loadProjects();
}
```

- [ ] **Step 11: market.js 작성 (app.js 29-96, 172-190, 351-374 그대로 이동)**

```js
import { esc } from './lib.js';
import { $ } from './ui.js';

const INVESTMENT_SOURCES = [
  // app.js 29-84 의 배열을 그대로 붙인다 (9개 항목)
];

const STOCK_LINKS = [
  // app.js 86-96 의 배열을 그대로 붙인다 (9개 항목)
];

export function renderInvestment() {
  const grid = $('#investmentGrid');
  if (!grid) return;
  grid.innerHTML = INVESTMENT_SOURCES.map(item => `
    <a class="indicator-card" href="${item.url}" target="_blank" rel="noreferrer">
      <span class="indicator-purpose">${esc(item.purpose)}</span>
      <b>${esc(item.source)}</b>
      <span>${item.metrics.map(esc).join(' · ')}</span>
    </a>
  `).join('');
  renderStockLinks();
}

export function renderStockLinks() {
  const box = $('#stockLinks');
  if (!box) return;
  const query = ($('#stockQuery')?.value || '').trim() || '삼성전자';
  box.innerHTML = STOCK_LINKS.map(link => `<a href="${link.url(query)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>`).join('');
}

export async function loadMarket() {
  // app.js 351-368 의 본문을 그대로 붙인다
}

function marketCard(name, row) {
  // app.js 370-374 의 본문을 그대로 붙인다
}
```

두 배열과 두 함수 본문은 원본 `app.js`에서 복사한다(내용 변경 없음). 복사 후 `git show HEAD:app.js | sed -n '29,96p'` 와 diff 해서 동일한지 확인한다.

- [ ] **Step 12: app.js 재작성**

```js
import { sb } from './supabase.js';
import { state, settings, today } from './state.js';
import { iso } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus } from './ui.js';
import { load, saveTask, toggleTask, editTask, removeTask, notifyDue } from './tasks.js';
import { loadProjects, addProject, deleteProject } from './projects.js';
import { loadMarket, renderInvestment, renderStockLinks } from './market.js';

async function handleTaskAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === 'toggle-task' && e.type !== 'change') return;
  if (action !== 'toggle-task' && e.type !== 'click') return;
  if (action === 'toggle-task') await toggleTask(e.target.dataset.id);
  if (action === 'edit-task') editTask(e.target.dataset.id);
  if (action === 'remove-task') await removeTask(e.target.dataset.id);
  if (action === 'delete-project') {
    const err = await deleteProject(e.target.dataset.project);
    if (err) return alert('프로젝트를 삭제하지 못했습니다.');
    renderProjects();
  }
}

async function onAddProject() {
  const err = await addProject($('#newProject').value);
  if (err) return alert(err.message || '프로젝트를 추가하지 못했습니다.');
  $('#newProject').value = '';
  renderProjects();
}

async function start() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#todayLabel').textContent = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#date').value = iso(today);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  state.user = session.user;
  $('#userName').textContent = state.user.email || '로그인됨';
  $('#loginOverlay').hidden = true;
  $('#app').hidden = false;
  const projErr = await loadProjects();
  setProjectStatus(projErr ? '프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다.' : '');
  await load();
  renderInvestment();
  loadMarket();
}

$('#googleLogin').onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
  if (error) $('#notice').textContent = '로그인을 시작하지 못했습니다. Google 로그인이 활성화됐는지 확인해 주세요.';
};
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };
$('#addForm').addEventListener('submit', saveTask);
$('#todayTasks').addEventListener('click', handleTaskAction);
$('#todayTasks').addEventListener('change', handleTaskAction);
$('#weekTasks').addEventListener('click', handleTaskAction);
$('#weekTasks').addEventListener('change', handleTaskAction);
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('.day');
  if (day?.dataset.date) selectDate(day.dataset.date);
});
$('#projectChips').addEventListener('click', handleTaskAction);
$('#cancelEdit').onclick = resetForm;
$('#prev').onclick = () => { state.view.setMonth(state.view.getMonth() - 1); calendar(); };
$('#next').onclick = () => { state.view.setMonth(state.view.getMonth() + 1); calendar(); };
$('#thisMonth').onclick = () => { state.view = new Date(today.getFullYear(), today.getMonth(), 1); state.selectedDate = iso(today); $('#date').value = state.selectedDate; calendar(); };
$('#toggleDone').onclick = () => { settings.hideDone = !settings.hideDone; render(); };
$('#darkMode').onclick = () => { settings.dark = !settings.dark; render(); };
$('#notifyDue').onclick = notifyDue;
$('#addProject').onclick = onAddProject;
$('#refreshMarket').onclick = loadMarket;
$('#openMarketDashboard').onclick = () => window.open('https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y', '_blank', 'noopener');
$('#searchStock').onclick = renderStockLinks;
$('#stockQuery').addEventListener('keydown', e => { if (e.key === 'Enter') renderStockLinks(); });
sb.auth.onAuthStateChange((_event, session) => { if (session && !state.user) start(); });
start();
```

- [ ] **Step 13: index.html 수정**

`index.html:101` 의 `<script src="/app.js"></script>` 를 다음으로 바꾼다:

```html
  <script type="module" src="/app.js"></script>
```

`index.html:62` (`.project-add` div) 바로 앞에 상태 영역을 추가한다:

```html
        <div id="projectStatus" class="status"></div>
```

- [ ] **Step 14: styles.css에 .status 추가**

`styles.css` 5번째 줄 끝(`.market-status{...}` 규칙 바로 뒤)에 붙인다:

```css
.status{margin-bottom:10px;color:var(--muted);font-size:13px}.status:empty{display:none}
```

- [ ] **Step 15: 문법 확인 + 로컬 서빙 확인**

```bash
for f in app.js lib.js state.js supabase.js ui.js tasks.js projects.js market.js; do node --check "$f" || echo "FAIL $f"; done
npm test
```
Expected: FAIL 출력 없음, 테스트 `# pass 7`.

```bash
python -m http.server 8080 --bind 127.0.0.1 & SRV=$!
sleep 1
for p in / /app.js /lib.js /state.js /supabase.js /ui.js /tasks.js /projects.js /market.js /styles.css; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8080$p"; done
```
Expected: 전부 `200`.

브라우저(Claude in Chrome)로 `http://127.0.0.1:8080/` 열기 → 콘솔 에러 0개 확인. 로그인 오버레이가 보이면 정상(로컬 origin은 Supabase Redirect URL에 없어 로그인 자체는 프로덕션에서 확인). 확인 후 서버 종료 (`kill $SRV`).

- [ ] **Step 16: Commit**

```bash
git add package.json lib.js state.js supabase.js ui.js tasks.js projects.js market.js app.js index.html styles.css tests/lib.test.mjs
git commit -m "refactor: split app.js into ES modules with unit-tested lib"
```

---

### Task 3: 프로젝트를 Supabase `work_projects`로 이전

**Files:**
- Modify: `lib.js` (함수 1개 추가), `tests/lib.test.mjs` (테스트 추가), `projects.js` (전면 교체), `app.js` (`start()`에서 이관 호출)

**Interfaces:**
- Consumes: `sb`, `state.user.id`, `state.tasks[].project`, Task 1의 `work_projects`
- Produces (`lib.js`): `mergeProjectNames(local: string[], fromTasks: (string|null)[])→string[]`
- Produces (`projects.js`): `loadProjects()`, `addProject(name)`, `deleteProject(name)` — 시그니처는 Task 2와 동일(`error|null` 반환), `migrateLocalProjects()→error|null` 추가

- [ ] **Step 1: mergeProjectNames 실패 테스트**

`tests/lib.test.mjs` 의 import 줄에 `mergeProjectNames`를 추가하고 끝에 붙인다:

```js
test('mergeProjectNames: 로컬 우선, 업무에서 온 이름 추가, 중복·빈값 제거', () => {
  assert.deepEqual(
    mergeProjectNames(['회사 업무', '개인 일정'], ['개인 일정', null, '  ', '농장', '회사 업무']),
    ['회사 업무', '개인 일정', '농장']
  );
  assert.deepEqual(mergeProjectNames([], []), []);
  assert.deepEqual(mergeProjectNames([' 공백 '], []), ['공백']);
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test
```
Expected: `mergeProjectNames is not a function` 류로 1건 실패.

- [ ] **Step 3: lib.js에 추가**

```js
// 1회 이관용: 이 기기의 localStorage 목록 + 업무에 실제 쓰인 이름. 순서 유지, 공백 정리, 중복 제거.
export function mergeProjectNames(local, fromTasks) {
  return [...new Set([...local, ...fromTasks].map(s => String(s || '').trim()).filter(Boolean))];
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test
```
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: projects.js 전면 교체**

```js
import { sb } from './supabase.js';
import { state } from './state.js';
import { PROJECT_DEFAULTS, mergeProjectNames } from './lib.js';

const LOCAL_KEY = 'deskProjects';

export async function loadProjects() {
  const { data, error } = await sb.from('work_projects')
    .select('id,name,sort_order')
    .order('sort_order')
    .order('created_at');
  if (error) {
    state.projects = [];
    state.projectsReady = false;
    return error;
  }
  state.projects = data.map(p => p.name);
  state.projectsReady = true;
  return null;
}

// 첫 로그인 1회: work_projects 가 비어 있으면 localStorage 목록(없으면 기본 4개) + 업무에 쓰인 이름을 넣는다.
// 호출 전제: loadProjects() 성공, load() 로 state.tasks 채워짐.
export async function migrateLocalProjects() {
  if (!state.projectsReady) return null;
  let local;
  try {
    local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') ?? PROJECT_DEFAULTS;
  } catch (_err) {
    local = PROJECT_DEFAULTS;
  }
  if (state.projects.length === 0) {
    const names = mergeProjectNames(local, state.tasks.map(t => t.project));
    if (names.length) {
      const { error } = await sb.from('work_projects')
        .insert(names.map((name, i) => ({ user_id: state.user.id, name, sort_order: i })));
      if (error) return error;
      const reload = await loadProjects();
      if (reload) return reload;
    }
  }
  localStorage.removeItem(LOCAL_KEY);
  return null;
}

export async function addProject(name) {
  name = name.trim();
  if (!name) return null;
  const { error } = await sb.from('work_projects')
    .insert({ user_id: state.user.id, name, sort_order: state.projects.length });
  if (error) return error.code === '23505' ? new Error('이미 있는 프로젝트입니다.') : error;
  return loadProjects();
}

export async function deleteProject(name) {
  const { error } = await sb.from('work_projects').delete().eq('name', name);
  if (error) return error;
  return loadProjects();
}
```

`23505`는 PostgreSQL unique 위반 코드로, Supabase 에러 객체의 `code`에 그대로 온다. `delete().eq('name', …)`은 RLS로 본인 행에만 적용된다.

알려진 동작: 프로젝트를 모두 지운 상태로 다시 로그인하면 이관 로직이 기본 4개(+업무에 쓰인 이름)를 다시 넣는다. 스펙의 "0건이면 이관" 규칙에 따른 것이며 이번 범위에서 별도 처리하지 않는다.

- [ ] **Step 6: app.js start()에 이관 호출 추가**

`app.js`의 import 줄을 바꾸고:

```js
import { loadProjects, addProject, deleteProject, migrateLocalProjects } from './projects.js';
```

`start()` 안의 `await load();` 바로 뒤에 추가한다:

```js
  const migErr = await migrateLocalProjects();
  if (migErr) setProjectStatus('프로젝트 목록을 옮기지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  renderProjects();
```

`load()`가 `render()`를 호출해 `state.tasks`가 채워진 뒤 이관하므로 업무에 쓰인 이름이 포함된다.

- [ ] **Step 7: 문법 확인 + 테스트**

```bash
for f in app.js projects.js lib.js; do node --check "$f" || echo "FAIL $f"; done
npm test
```
Expected: FAIL 없음, `# pass 8`.

- [ ] **Step 8: Commit**

```bash
git add lib.js tests/lib.test.mjs projects.js app.js
git commit -m "feat: sync project list through Supabase work_projects"
```

---

### Task 4: 반복 시리즈 — series_id 발급, "이 일정만 / 이후 모두" 수정·삭제

**Files:**
- Modify: `lib.js` (함수 1개 추가), `tests/lib.test.mjs`, `tasks.js`, `ui.js` (dialog 함수 + 메타 표시), `index.html` (dialog 마크업), `styles.css`

**Interfaces:**
- Consumes: `work_tasks.series_id` (Task 1), `state.tasks[]`
- Produces (`lib.js`): `splitSeriesEdit(base)→{ seriesFields, task_date }` — `seriesFields`는 `base`에서 `task_date`를 뺀 객체
- Produces (`ui.js`): `askSeriesScope(mode: 'edit'|'delete')→Promise<'one'|'following'|null>`
- `state.tasks[]` 항목에 `seriesId: string|null` 필드 추가

- [ ] **Step 1: splitSeriesEdit 실패 테스트**

`tests/lib.test.mjs` import에 `splitSeriesEdit` 추가, 끝에 붙인다:

```js
test('splitSeriesEdit: task_date 만 분리하고 나머지는 그대로', () => {
  const base = { title: 'A', task_date: '2026-09-12', priority: 'high', project: null, task_time: '09:00', note: 'n', updated_at: 'u' };
  const { seriesFields, task_date } = splitSeriesEdit(base);
  assert.equal(task_date, '2026-09-12');
  assert.deepEqual(seriesFields, { title: 'A', priority: 'high', project: null, task_time: '09:00', note: 'n', updated_at: 'u' });
  assert.equal('task_date' in seriesFields, false);
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test
```
Expected: 1건 실패 (`splitSeriesEdit is not a function`).

- [ ] **Step 3: lib.js에 추가**

```js
// "이후 모두" 수정: 날짜는 편집 중인 일정에만, 나머지 필드는 시리즈 전체에 적용한다.
export function splitSeriesEdit(base) {
  const { task_date, ...seriesFields } = base;
  return { seriesFields, task_date };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test
```
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: index.html에 dialog 추가**

`index.html`의 `</main>` 바로 뒤(`<script>` 앞)에 넣는다:

```html
  <dialog id="seriesDialog" class="series-dialog">
    <form method="dialog">
      <h3 id="seriesDialogTitle">반복 일정 수정</h3>
      <p class="hint">같은 반복 묶음에 속한 일정이 더 있습니다.</p>
      <div class="dialog-actions">
        <button value="one" class="tool">이 일정만</button>
        <button value="following" class="primary">이후 모두</button>
        <button value="cancel" class="text-button">취소</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 6: styles.css에 dialog 스타일 추가**

Task 2 Step 14에서 붙인 `.status` 규칙 뒤에 이어 붙인다:

```css
.series-dialog{border:1px solid var(--line);border-radius:12px;padding:20px;width:min(360px,90vw);background:var(--paper);color:var(--ink);box-shadow:var(--shadow)}.series-dialog::backdrop{background:rgba(0,0,0,.35)}.series-dialog h3{margin:0 0 6px;font-size:17px}.series-dialog p{margin:0}.dialog-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.dialog-actions .primary{min-height:40px;padding:0 14px}.badge.repeat{background:#eef2ff;color:#4353b5}
```

- [ ] **Step 7: ui.js에 askSeriesScope 추가 + 반복 표시**

`ui.js` 끝에 추가:

```js
// 시리즈 일정 수정/삭제 범위. 취소·Esc 는 null.
export function askSeriesScope(mode) {
  const dlg = $('#seriesDialog');
  $('#seriesDialogTitle').textContent = mode === 'delete' ? '반복 일정 삭제' : '반복 일정 수정';
  return new Promise(resolve => {
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue;
      resolve(v === 'one' || v === 'following' ? v : null);
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}
```

`taskHTML`의 우선순위 배지 줄을 다음으로 바꾼다(반복 묶음이면 배지 하나 더):

```js
    ${t.seriesId ? '<span class="badge repeat">반복</span>' : ''}
    <span class="badge ${t.priority}">${pri(t.priority)}</span>
```

- [ ] **Step 8: tasks.js 수정**

import 줄을 바꾼다:

```js
import { iso, addDays, sortTasks, occurrenceDates, splitSeriesEdit } from './lib.js';
import { $, render, resetForm, fillEditForm, askSeriesScope } from './ui.js';
```

`load()`의 매핑에 `seriesId`를 추가한다:

```js
    done: x.done,
    seriesId: x.series_id || null
```

`saveTask`를 통째로 교체한다:

```js
export async function saveTask(e) {
  e.preventDefault();
  const base = readForm();

  if (state.editId) {
    const current = state.tasks.find(t => t.id === state.editId);
    let scope = 'one';
    if (current?.seriesId) {
      scope = await askSeriesScope('edit');
      if (!scope) return;
    }
    if (scope === 'following') {
      const { seriesFields, task_date } = splitSeriesEdit(base);
      const r1 = await sb.from('work_tasks').update(seriesFields)
        .eq('series_id', current.seriesId).gte('task_date', current.date);
      if (r1.error) return alert('수정하지 못했습니다.');
      if (task_date !== current.date) {
        const r2 = await sb.from('work_tasks').update({ task_date }).eq('id', state.editId);
        if (r2.error) return alert('날짜를 수정하지 못했습니다.');
      }
    } else {
      const { error } = await sb.from('work_tasks').update(base).eq('id', state.editId);
      if (error) return alert('수정하지 못했습니다.');
    }
    await load();
    resetForm();
    return;
  }

  const repeat = $('#repeat').value;
  const count = repeat === 'none' ? 1 : Math.min(24, Math.max(1, Number($('#repeatCount').value || 1)));
  // 반복이면 시리즈 ID 하나를 모든 행에 붙인다. 회차 표시는 메모 대신 series_id 배지로 대신한다.
  const seriesId = repeat === 'none' ? null : crypto.randomUUID();
  const records = occurrenceDates(base.task_date, repeat, count).map(date => ({
    user_id: state.user.id,
    title: base.title,
    task_date: date,
    priority: base.priority,
    project: base.project,
    task_time: base.task_time,
    note: base.note,
    series_id: seriesId
  }));
  const { error } = await sb.from('work_tasks').insert(records);
  if (error) return alert('저장하지 못했습니다. Supabase 테이블 설정을 확인해 주세요.');
  await load();
  resetForm();
}
```

`removeTask`를 통째로 교체한다:

```js
export async function removeTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  let query;
  if (t.seriesId) {
    const scope = await askSeriesScope('delete');
    if (!scope) return;
    query = scope === 'following'
      ? sb.from('work_tasks').delete().eq('series_id', t.seriesId).gte('task_date', t.date)
      : sb.from('work_tasks').delete().eq('id', id);
  } else {
    if (!confirm('이 업무를 삭제할까요?')) return;
    query = sb.from('work_tasks').delete().eq('id', id);
  }
  const { error } = await query;
  if (error) return alert('삭제하지 못했습니다.');
  await load();
}
```

`repeatLabel` import는 더 이상 쓰지 않으므로 tasks.js에서 제거한다(lib.js와 테스트에는 남긴다).

설계 결정: 기존에는 반복 생성 시 메모에 "매일 반복 2/3"를 붙였다. series_id가 생겼으므로 메모를 오염시키지 않고 "반복" 배지로 대신한다. 그래야 "이후 모두"로 메모를 바꿔도 회차 문구가 뒤섞이지 않는다. 이미 저장된 행의 메모는 그대로 둔다.

- [ ] **Step 9: 문법 확인 + 테스트**

```bash
for f in app.js ui.js tasks.js lib.js; do node --check "$f" || echo "FAIL $f"; done
npm test
```
Expected: FAIL 없음, `# pass 9`.

- [ ] **Step 10: Commit**

```bash
git add lib.js tests/lib.test.mjs ui.js tasks.js index.html styles.css
git commit -m "feat: group recurring tasks by series with this-only/following edits"
```

---

### Task 5: 실제 화면 검증 + 배포

**Files:** 없음 (검증만). 실패 시 해당 Task로 돌아가 고친다.

**전제:** Task 1 Step 4의 SQL이 Supabase에 적용되어 있어야 한다. 아니면 사용자에게 먼저 요청한다.

- [ ] **Step 1: 정적 서빙 + 콘솔 확인**

```bash
python -m http.server 8080 --bind 127.0.0.1 & SRV=$!
sleep 1
for p in / /app.js /lib.js /state.js /supabase.js /ui.js /tasks.js /projects.js /market.js /styles.css; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8080$p"; done
kill $SRV
```
Expected: 전부 200.

- [ ] **Step 2: push → Vercel 배포 확인**

사용자에게 push 허락을 받은 뒤:

```bash
git push origin main
```

1~2분 뒤 `https://my-work-desk.vercel.app/app.js`를 curl 해서 첫 줄이 `import { sb } from './supabase.js';` 인지 확인한다. 아니면 Vercel 대시보드에서 배포 상태를 확인하고 사용자에게 알린다.

- [ ] **Step 3: 브라우저 검증 (Claude in Chrome, 프로덕션 URL)**

`https://my-work-desk.vercel.app/` 에서 Google 로그인 후, 각 항목을 **화면에서 직접 읽어** 확인한다. 하나라도 어긋나면 중단하고 보고한다.

1. 콘솔 에러 0개. 프로젝트 카드에 "SQL 마이그레이션이 필요합니다" 문구가 **없음**.
2. 프로젝트 칩에 기존 목록(또는 기본 4개)이 보임. DevTools 콘솔에서 `localStorage.getItem('deskProjects')` → `null`.
3. 프로젝트 "검증-임시" 추가 → 칩에 보임 → 같은 이름 다시 추가 → "이미 있는 프로젝트입니다" alert.
4. `localStorage.clear()` 후 새로고침(로그인 유지되면 그대로, 아니면 재로그인) → "검증-임시" 칩이 **여전히** 보임 (= Supabase에서 옴). 이것이 "다른 기기" 확인을 대신한다.
5. 반복 3회 생성: 제목 "시리즈검증", 오늘 날짜, 매일 반복, 횟수 3. 오늘/이번 주 목록에 "반복" 배지가 붙은 3건 확인. 메모에 "매일 반복 1/3" 문구가 **없음**.
6. 2번째(내일) 항목 수정 → 제목 "시리즈검증-수정" → 저장 → dialog에 "반복 일정 수정" 제목 → "이후 모두" 클릭. 결과: 오늘 항목 제목 그대로, 내일·모레 제목 "시리즈검증-수정".
7. 2번째 항목 삭제 → dialog "반복 일정 삭제" → "이후 모두". 결과: 오늘 항목만 남음.
8. 남은 오늘 항목 수정 → dialog → "취소". 아무 변화 없음. 삭제 → dialog → "이 일정만". 항목 사라짐.
9. 단발 일정 하나 추가 → 수정 → dialog **없이** 바로 저장됨. 삭제 → `confirm` 만 뜸.
10. "검증-임시" 프로젝트 칩 × → 사라짐. 단발 일정 삭제로 정리.

- [ ] **Step 4: 결과 보고**

각 항목의 실제 관찰 결과를 번호대로 적어 사용자에게 보고한다. 통과하지 못한 항목은 어떤 화면이 나왔는지 그대로 적는다.

- [ ] **Step 5: SESSION_HANDOFF.md 갱신 + Commit**

`SESSION_HANDOFF.md`의 "주요 파일 구조" 섹션을 새 모듈 목록으로 바꾸고, "업무/일정 기능"에 다음을 추가한다:

```
- 프로젝트 목록은 Supabase `work_projects`로 동기화 (localStorage에서 1회 이관)
- 반복 일정은 `series_id`로 묶이며, 수정·삭제 시 "이 일정만 / 이후 모두" 선택
```

"다음에 하면 좋은 일"에서 "반복 일정의 개별 수정/전체 수정 옵션 추가"와 "프로젝트/카테고리도 Supabase 테이블로 분리해 기기 간 동기화"를 지운다.

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: update handoff for project sync and recurring series"
```
