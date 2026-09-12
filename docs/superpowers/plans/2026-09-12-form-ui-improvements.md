# 폼/UI 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정에 기간·하루종일·알림 시점을 붙이고, 프로젝트를 색상 있는 고정 3개 + 사용자 프로젝트 구조로 바꾸며, 반복 "없음"일 때 횟수칸을 숨긴다.

**Architecture:** 기존 ES 모듈 구조 그대로. 날짜/색상/정렬 판단은 전부 `lib.js` 순수 함수로 넣고 `node --test`로 고정한 뒤, `tasks.js`(읽기/쓰기), `projects.js`(고정 프로젝트), `ui.js`(폼·표시)가 그 함수를 쓴다. DB는 `work_tasks`에 컬럼 3개 추가뿐.

**Tech Stack:** Vanilla JS ES modules(빌드 없음), Supabase JS v2(CDN UMD, publishable key), Node 24 `node:test`, Python `http.server`, Vercel 정적 배포.

## Global Constraints

- service_role 키를 코드·문서·대화에 절대 넣지 않는다. 브라우저는 publishable key만.
- `work_tasks`, `work_projects` 외 테이블은 건드리지 않는다. 프로젝트 이름 변경·사용자 색 선택·알림 실제 발송·가족 공유는 범위 밖.
- 새 컬럼: `end_date date null` (`check (end_date is null or end_date >= task_date)`), `remind_1h boolean not null default false`, `remind_1d boolean not null default false`. **하루종일 = `task_time null`** (컬럼 없음).
- 고정 프로젝트 `FIXED_PROJECTS = ['회사 업무', '개인 일정', '가족 일정']`: 로그인 시 자동 생성, 칩에 × 없음, 삭제 요청은 `'기본 프로젝트는 삭제할 수 없습니다.'` 에러. 기존 사용자 프로젝트("투자 · 자산" 등)는 그대로.
- 색상은 저장하지 않는다. `회사 업무 #0a84ff`, `개인 일정 #248a5b`, `가족 일정 #f0730a`, 나머지는 이름 해시로 `['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280']` 중 하나, 프로젝트 없음(`미분류`)은 `#6b7280`.
- 마감일 `dueDate(t) = t.endDate ?? t.date`. 오늘 목록 = `t.date ≤ 오늘 ≤ dueDate`; 이번 주 마감 = 미완료 + `오늘 ≤ dueDate ≤ 오늘+7`; 마감 임박 = 미완료 + `dueDate ≤ 오늘+3`; 캘린더 = `t.date ≤ 날짜 ≤ dueDate` 모든 칸.
- 배지 문구: 지남 / 진행중 / 오늘 / N일. "반복", "알림"(`title="1시간 전 · 하루 전"` 중 켜진 것만).
- 종료일 < 시작일이면 `alert('종료일은 시작일보다 앞설 수 없습니다.')` 후 저장하지 않는다.
- 반복 + 기간: 각 회차 `end_date = 회차 시작일 + (원래 종료일 − 원래 시작일)`.
- "이후 모두": 제목·시간·우선순위·프로젝트·메모·`remind_1h`·`remind_1d`는 시리즈에, `task_date`·`end_date`는 해당 회차에만.
- 프로젝트 입력은 `<select id="project">`, 기본 선택 "개인 일정". 목록에 없는 값(옛 이름, null→"미분류")은 수정 시 임시 옵션.
- 횟수칸 숨김은 CSS `:has()`만으로.
- 시간 `step="300"` 유지.
- 배포 순서: SQL 먼저 → 코드 push. push는 사용자 지시 후.
- 커밋 메시지 끝 두 줄:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01G9J7WjVZ9wcXL5GQctGjiN
  ```
- 작업 폴더 `C:\Projects2\my-work-desk-github`, 브랜치 `feat/form-ui` (main에서 분기).

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `supabase-setup.sql` | 추가 | 컬럼 3개 + check |
| `lib.js` | 추가/수정 | `FIXED_PROJECTS`, `PROJECT_DEFAULTS`, 색상, `sortProjects`, `dueDate`, `spansDay`, `daysBetween`, `dueState`, `shiftEndDate`, `fmtMd`, `splitSeriesEdit`(end_date 분리) |
| `tests/lib.test.mjs` | 추가 | 위 함수 테스트 |
| `projects.js` | 수정 | `ensureFixedProjects`, 정렬, 고정 삭제 거부 |
| `tasks.js` | 수정 | 새 필드 읽기/쓰기, 종료일 검증, 반복 시 종료일 이동, 시리즈 필드 |
| `ui.js` | 수정 | 폼(select 옵션, 하루종일 토글, 채우기/초기화), 카드·캘린더·칩 표시 규칙 |
| `app.js` | 수정 | `ensureFixedProjects` 호출, 하루종일 change 바인딩, 삭제 에러 문구 |
| `index.html` | 수정 | 폼 마크업 |
| `styles.css` | 추가 | 필드 라벨, 체크 필드, 횟수 숨김, 색 점, 배지 |
| `docs/superpowers/specs/2026-09-12-form-ui-improvements-design.md` | 1줄 수정 | 진행중 판정 `t.date ≤ 오늘` |

---

### Task 1: 스키마 SQL

**Files:**
- Modify: `supabase-setup.sql` (끝에 추가)

**Interfaces:**
- Produces: `work_tasks.end_date`, `work_tasks.remind_1h`, `work_tasks.remind_1d`, 제약 `work_tasks_end_after_start`.

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feat/form-ui main
```

- [ ] **Step 2: SQL 추가**

`supabase-setup.sql` 끝에 붙인다:

```sql

-- ---------- 기간 · 알림 시점 ----------
alter table public.work_tasks add column if not exists end_date date;
alter table public.work_tasks add column if not exists remind_1h boolean not null default false;
alter table public.work_tasks add column if not exists remind_1d boolean not null default false;
alter table public.work_tasks drop constraint if exists work_tasks_end_after_start;
alter table public.work_tasks add constraint work_tasks_end_after_start
  check (end_date is null or end_date >= task_date);
```

- [ ] **Step 3: 두 번 실행해도 안전한지 눈으로 확인** (`if not exists`, `drop … if exists` 후 `add`).

- [ ] **Step 4: Commit**

```bash
git add supabase-setup.sql
git commit -m "feat(db): add end_date and reminder flags to work_tasks"
```

- [ ] **Step 5: 컨트롤러가 Supabase SQL Editor에서 실행** (Task 6 전까지). 마지막 블록만 한 줄로 타이핑해서 Run. 실행 후 앱 콘솔에서 `sb.from('work_tasks').select('end_date,remind_1h,remind_1d').limit(1)`이 에러 없이 돌아오는지 확인.

---

### Task 2: lib.js 순수 함수 + 테스트

**Files:**
- Modify: `lib.js`, `tests/lib.test.mjs`, `docs/superpowers/specs/2026-09-12-form-ui-improvements-design.md`

**Interfaces:**
- Produces:
  - `FIXED_PROJECTS: string[]`, `PROJECT_DEFAULTS: string[]`(=고정 3개 복사), `PROJECT_COLORS`, `PALETTE`, `UNSORTED_COLOR`
  - `projectColor(name: string|null) → '#rrggbb'`
  - `sortProjects(names: string[]) → string[]` (고정 순서 먼저, 나머지 원래 순서)
  - `dueDate(t: {date, endDate?}) → 'YYYY-MM-DD'`
  - `spansDay(t, dayIso) → boolean`
  - `daysBetween(aIso, bIso) → number` (b − a, 일)
  - `dueState(t, todayIso) → 'past' | 'today' | 'ongoing' | 'soon:N' | ''`
  - `shiftEndDate(startIso, endIso|null, newStartIso) → 'YYYY-MM-DD' | null`
  - `fmtMd(iso) → 'M/D'`
  - `splitSeriesEdit(base) → { seriesFields, task_date, end_date }`
- 기존 `task` 객체(`state.tasks[]`)에 `endDate: string|null`, `remind1h: boolean`, `remind1d: boolean`가 추가된다고 가정한다(Task 4에서 채움).

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib.test.mjs`의 import 줄을 다음으로 바꾼다:

```js
import {
  iso, parseIso, occurrenceDates, repeatLabel, esc, sortTasks, mergeProjectNames, splitSeriesEdit,
  FIXED_PROJECTS, PROJECT_DEFAULTS, projectColor, sortProjects, dueDate, spansDay, daysBetween,
  dueState, shiftEndDate, fmtMd
} from '../lib.js';
```

기존 `splitSeriesEdit` 테스트를 다음으로 교체한다:

```js
test('splitSeriesEdit: task_date 와 end_date 만 분리하고 나머지는 그대로', () => {
  const base = { title: 'A', task_date: '2026-09-12', end_date: '2026-09-14', priority: 'high', project: null, task_time: '09:00', remind_1h: true, remind_1d: false, note: 'n', updated_at: 'u' };
  const { seriesFields, task_date, end_date } = splitSeriesEdit(base);
  assert.equal(task_date, '2026-09-12');
  assert.equal(end_date, '2026-09-14');
  assert.deepEqual(seriesFields, { title: 'A', priority: 'high', project: null, task_time: '09:00', remind_1h: true, remind_1d: false, note: 'n', updated_at: 'u' });
  assert.equal('task_date' in seriesFields, false);
  assert.equal('end_date' in seriesFields, false);
});
```

파일 끝에 추가한다:

```js
test('FIXED_PROJECTS / PROJECT_DEFAULTS', () => {
  assert.deepEqual(FIXED_PROJECTS, ['회사 업무', '개인 일정', '가족 일정']);
  assert.deepEqual(PROJECT_DEFAULTS, FIXED_PROJECTS);
  assert.notEqual(PROJECT_DEFAULTS, FIXED_PROJECTS); // 복사본
});

test('projectColor: 고정 3색, 결정적, 미분류는 회색', () => {
  assert.equal(projectColor('회사 업무'), '#0a84ff');
  assert.equal(projectColor('개인 일정'), '#248a5b');
  assert.equal(projectColor('가족 일정'), '#f0730a');
  assert.equal(projectColor(null), '#6b7280');
  assert.equal(projectColor(''), '#6b7280');
  const a = projectColor('투자 · 자산');
  assert.equal(projectColor('투자 · 자산'), a);
  assert.match(a, /^#[0-9a-f]{6}$/);
  assert.ok(['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280'].includes(a));
});

test('sortProjects: 고정 3개가 정해진 순서로 앞, 나머지는 원래 순서', () => {
  assert.deepEqual(sortProjects(['Work Station', '가족 일정', '투자 · 자산', '개인 일정', '회사 업무']),
    ['회사 업무', '개인 일정', '가족 일정', 'Work Station', '투자 · 자산']);
  assert.deepEqual(sortProjects(['개인 일정']), ['개인 일정']);
  assert.deepEqual(sortProjects([]), []);
});

test('dueDate / spansDay', () => {
  const single = { date: '2026-09-14', endDate: null };
  const range = { date: '2026-09-14', endDate: '2026-09-16' };
  assert.equal(dueDate(single), '2026-09-14');
  assert.equal(dueDate(range), '2026-09-16');
  assert.equal(spansDay(single, '2026-09-14'), true);
  assert.equal(spansDay(single, '2026-09-15'), false);
  assert.equal(spansDay(range, '2026-09-13'), false);
  assert.equal(spansDay(range, '2026-09-14'), true);
  assert.equal(spansDay(range, '2026-09-15'), true);
  assert.equal(spansDay(range, '2026-09-16'), true);
  assert.equal(spansDay(range, '2026-09-17'), false);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-09-12', '2026-09-15'), 3);
  assert.equal(daysBetween('2026-09-15', '2026-09-12'), -3);
  assert.equal(daysBetween('2026-09-12', '2026-09-12'), 0);
});

test('dueState: 지남/오늘/진행중/N일/없음', () => {
  const today = '2026-09-12';
  assert.equal(dueState({ date: '2026-09-10', endDate: null }, today), 'past');
  assert.equal(dueState({ date: '2026-09-12', endDate: null }, today), 'today');
  assert.equal(dueState({ date: '2026-09-10', endDate: '2026-09-12' }, today), 'today');
  assert.equal(dueState({ date: '2026-09-10', endDate: '2026-09-14' }, today), 'ongoing');
  assert.equal(dueState({ date: '2026-09-12', endDate: '2026-09-14' }, today), 'ongoing');
  assert.equal(dueState({ date: '2026-09-14', endDate: null }, today), 'soon:2');
  assert.equal(dueState({ date: '2026-09-15', endDate: '2026-09-15' }, today), 'soon:3');
  assert.equal(dueState({ date: '2026-09-16', endDate: null }, today), '');
});

test('shiftEndDate: 기간 길이 유지, 종료일 없으면 null', () => {
  assert.equal(shiftEndDate('2026-09-14', '2026-09-16', '2026-09-21'), '2026-09-23');
  assert.equal(shiftEndDate('2026-09-14', null, '2026-09-21'), null);
  assert.equal(shiftEndDate('2026-09-14', '2026-09-14', '2026-10-01'), '2026-10-01');
});

test('fmtMd', () => {
  assert.equal(fmtMd('2026-09-04'), '9/4');
  assert.equal(fmtMd('2026-12-25'), '12/25');
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm test
```
Expected: `projectColor`/`dueDate` 등 export 없음으로 여러 건 실패(SyntaxError: The requested module does not provide an export …).

- [ ] **Step 3: lib.js 수정**

`lib.js` 3번째 줄 `export const PROJECT_DEFAULTS = [...]`를 다음으로 바꾼다:

```js
export const FIXED_PROJECTS = ['회사 업무', '개인 일정', '가족 일정'];
export const PROJECT_DEFAULTS = [...FIXED_PROJECTS];

// 프로젝트 색은 저장하지 않고 이름에서 정한다. 고정 3개는 지정색, 나머지는 이름 해시로 팔레트에서.
export const PROJECT_COLORS = {
  '회사 업무': '#0a84ff',
  '개인 일정': '#248a5b',
  '가족 일정': '#f0730a'
};
export const PALETTE = ['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280'];
export const UNSORTED_COLOR = '#6b7280';

export function projectColor(name) {
  if (!name) return UNSORTED_COLOR;
  if (PROJECT_COLORS[name]) return PROJECT_COLORS[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// 고정 프로젝트가 정해진 순서로 앞, 나머지는 들어온 순서.
export function sortProjects(names) {
  const fixed = FIXED_PROJECTS.filter(n => names.includes(n));
  const rest = names.filter(n => !FIXED_PROJECTS.includes(n));
  return [...fixed, ...rest];
}
```

`splitSeriesEdit`를 다음으로 교체한다:

```js
// "이후 모두" 수정: 시작일·종료일은 편집 중인 회차에만, 나머지 필드는 시리즈 전체에 적용한다.
export function splitSeriesEdit(base) {
  const { task_date, end_date, ...seriesFields } = base;
  return { seriesFields, task_date, end_date };
}
```

파일 끝에 추가한다:

```js
// ---- 기간 일정 ----
// 마감일: 종료일이 있으면 종료일, 없으면 시작일.
export function dueDate(t) { return t.endDate || t.date; }
export function spansDay(t, dayIso) { return t.date <= dayIso && dayIso <= dueDate(t); }
export function daysBetween(aIso, bIso) { return Math.round((parseIso(bIso) - parseIso(aIso)) / 86400000); }

// 배지 판정. 'past' 지남 · 'today' 오늘 마감 · 'ongoing' 시작했고 마감 전 · 'soon:N' N일 뒤 마감(≤3) · '' 그 외
export function dueState(t, todayIso) {
  const diff = daysBetween(todayIso, dueDate(t));
  if (diff < 0) return 'past';
  if (diff === 0) return 'today';
  if (t.date <= todayIso) return 'ongoing';
  if (diff <= 3) return `soon:${diff}`;
  return '';
}

// 반복 회차마다 같은 길이의 기간을 유지한다.
export function shiftEndDate(startIso, endIso, newStartIso) {
  if (!endIso) return null;
  return iso(addDays(parseIso(newStartIso), daysBetween(startIso, endIso)));
}

export function fmtMd(isoStr) {
  const [, m, d] = isoStr.split('-').map(Number);
  return `${m}/${d}`;
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test
```
Expected: `# pass 17`, `# fail 0`.

- [ ] **Step 5: 스펙 문구 정정**

`docs/superpowers/specs/2026-09-12-form-ui-improvements-design.md`의 표에서
`diff<0 "지남", `t.date < 오늘 ≤ dueDate` 이고 diff>0 "진행중", diff=0 "오늘", diff≤3 "N일"` 을
`diff<0 "지남", diff=0 "오늘", `t.date ≤ 오늘` 이고 diff>0 "진행중", diff≤3 "N일"` 로 바꾼다. (오늘 시작하는 기간 일정도 "진행중"으로 보이는 편이 "2일"보다 낫다.)

- [ ] **Step 6: Commit**

```bash
git add lib.js tests/lib.test.mjs docs/superpowers/specs/2026-09-12-form-ui-improvements-design.md
git commit -m "feat(lib): project colors, fixed projects, date-range helpers"
```

---

### Task 3: 고정 프로젝트 + 칩 색상

**Files:**
- Modify: `projects.js`, `app.js`, `ui.js`(`renderProjects`만), `styles.css`

**Interfaces:**
- Consumes: `FIXED_PROJECTS`, `sortProjects`, `projectColor`, `esc` from `lib.js`; `state.projects`, `state.projectsReady`, `state.user`.
- Produces (`projects.js`): `ensureFixedProjects() → error|null`; `loadProjects()`가 `state.projects`를 `sortProjects` 순으로 채움; `deleteProject(name)`이 고정 이름이면 `Error`.
- `ui.js`의 `#projects` datalist 채우기는 이 Task에서 제거한다(Task 4에서 select로 대체). 그 사이 `index.html`의 `<datalist id="projects">`는 남아 있어도 무해하다.

- [ ] **Step 1: projects.js 수정**

import 줄을 바꾼다:

```js
import { PROJECT_DEFAULTS, FIXED_PROJECTS, mergeProjectNames, sortProjects } from './lib.js';
```

`loadProjects` 안의 `state.projects = data.map(p => p.name);` 을

```js
  state.projects = sortProjects(data.map(p => p.name));
```

로 바꾼다. `migrateLocalProjects` 바로 뒤에 추가한다:

```js
// 고정 프로젝트(회사 업무·개인 일정·가족 일정)가 없으면 만든다. 이미 있으면 건드리지 않는다.
// 호출 전제: loadProjects() 성공, migrateLocalProjects() 이후 (이관 판정을 방해하지 않게).
export async function ensureFixedProjects() {
  if (!state.projectsReady) return null;
  const missing = FIXED_PROJECTS.filter(n => !state.projects.includes(n));
  if (!missing.length) return null;
  const { error } = await sb.from('work_projects').upsert(
    missing.map(name => ({ user_id: state.user.id, name, sort_order: FIXED_PROJECTS.indexOf(name) })),
    { onConflict: 'user_id,name', ignoreDuplicates: true }
  );
  if (error) return error;
  return loadProjects();
}
```

`deleteProject`를 다음으로 교체한다:

```js
export async function deleteProject(name) {
  if (FIXED_PROJECTS.includes(name)) return new Error('기본 프로젝트는 삭제할 수 없습니다.');
  const { error } = await sb.from('work_projects').delete().eq('name', name);
  if (error) return error;
  return loadProjects();
}
```

- [ ] **Step 2: app.js 수정**

import 줄:

```js
import { loadProjects, addProject, deleteProject, migrateLocalProjects, ensureFixedProjects } from './projects.js';
```

`handleTaskAction`의 delete-project 분기에서 `if (err) return alert('프로젝트를 삭제하지 못했습니다.');` 를

```js
    if (err) return alert(err.message || '프로젝트를 삭제하지 못했습니다.');
```

로 바꾼다. `start()`에서 `renderProjects();` 바로 앞에 추가한다:

```js
  const fixErr = await ensureFixedProjects();
  if (fixErr) setProjectStatus('기본 프로젝트를 만들지 못했습니다. 새로고침 후 다시 시도해 주세요.');
```

(순서: `loadProjects` → `load` → `migrateLocalProjects` → `ensureFixedProjects` → `renderProjects`.)

- [ ] **Step 3: ui.js renderProjects 수정**

import 줄에 `projectColor`, `FIXED_PROJECTS`를 추가한다:

```js
import { iso, addDays, esc, pri, sortTasks, projectColor, FIXED_PROJECTS } from './lib.js';
```

`renderProjects`를 다음으로 교체한다:

```js
export function renderProjects() {
  const favorites = state.projects;
  const dot = (p) => `<i class="dot-color" style="background:${projectColor(p)}"></i>`;
  $('#projectChips').innerHTML = favorites.map(p => {
    const fixed = FIXED_PROJECTS.includes(p);
    return `<span class="chip ${fixed ? 'fixed' : ''}">${dot(p)}${esc(p)}${fixed ? '' : ` <button data-action="delete-project" data-project="${esc(p)}">×</button>`}</span>`;
  }).join('');

  const ongoing = state.tasks.filter(t => !t.done);
  const groups = {};
  ongoing.forEach(t => { const p = t.project || '미분류'; (groups[p] ??= []).push(t); });
  $('#projectsView').innerHTML = Object.entries(groups).map(([p, items]) => {
    const all = state.tasks.filter(t => (t.project || '미분류') === p);
    const pct = Math.round((all.length - items.length) / all.length * 100);
    const color = projectColor(p === '미분류' ? null : p);
    return `<div class="project"><div class="project-line"><span>${dot(p === '미분류' ? null : p)}${esc(p)}</span><span class="hint">${items.length}건 남음</span></div><div class="bar"><i style="width:${pct}%;background:${color}"></i></div></div>`;
  }).join('') || '<div class="empty">프로젝트별 업무를 등록해 보세요.</div>';
}
```

- [ ] **Step 4: styles.css 추가**

5번째 줄 끝(`.badge.repeat{…}` 뒤)에 이어 붙인다:

```css
.dot-color{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}.chip.fixed{padding-right:12px}
```

- [ ] **Step 5: 확인**

```bash
for f in projects.js app.js ui.js; do node --check "$f" || echo "FAIL $f"; done
npm test
```
Expected: FAIL 없음, `# pass 17`.

- [ ] **Step 6: Commit**

```bash
git add projects.js app.js ui.js styles.css
git commit -m "feat: fixed projects with colors, undeletable"
```

---

### Task 4: 폼 — 기간·하루종일·알림·프로젝트 select·횟수 숨김 + 저장/읽기

**Files:**
- Modify: `index.html`, `styles.css`, `tasks.js`, `ui.js`(폼 함수), `app.js`(바인딩)

**Interfaces:**
- Consumes: `shiftEndDate`, `splitSeriesEdit`(end_date 포함), `FIXED_PROJECTS` from `lib.js`.
- Produces: `state.tasks[]` 항목에 `endDate`, `remind1h`, `remind1d`; `ui.js`에 `renderProjectOptions(selected: string|null|undefined)`, `setAllDay(on: boolean)` export.
- 표시 규칙(카드·캘린더·오늘 목록)은 Task 5. 이 Task가 끝나면 새 필드가 저장·복원되지만 카드에는 아직 안 보인다.

- [ ] **Step 1: index.html 폼 교체**

`<form id="addForm" class="form">` … `</form>`과 그 뒤의 `<datalist id="projects"></datalist>` 줄을 다음으로 통째로 교체한다:

```html
        <form id="addForm" class="form">
          <input id="title" required maxlength="200" placeholder="할 일 또는 일정 제목">
          <div class="form-row">
            <label class="field"><span>시작일</span><input id="date" type="date" required></label>
            <label class="field"><span>종료일 (선택)</span><input id="endDate" type="date"></label>
          </div>
          <div class="form-row">
            <input id="time" type="time" step="300">
            <label class="check-field"><input id="allDay" type="checkbox"> 하루종일</label>
          </div>
          <div class="form-row">
            <select id="priority"><option value="high">중요</option><option value="middle" selected>보통</option><option value="low">여유</option></select>
            <select id="project" aria-label="프로젝트"></select>
          </div>
          <div class="form-row">
            <select id="repeat"><option value="none" selected>반복 없음</option><option value="daily">매일 반복</option><option value="weekly">매주 반복</option><option value="monthly">매월 반복</option></select>
            <input id="repeatCount" type="number" min="1" max="24" value="1" title="반복 횟수">
          </div>
          <div class="check-row">
            <span class="hint">알림</span>
            <label class="check-field"><input id="remind1h" type="checkbox"> 1시간 전</label>
            <label class="check-field"><input id="remind1d" type="checkbox"> 하루 전</label>
          </div>
          <textarea id="note" maxlength="1000" placeholder="메모 (선택)"></textarea>
          <button id="submitTask" class="primary">추가하기</button>
        </form>
```

- [ ] **Step 2: styles.css 추가**

Task 3에서 붙인 `.chip.fixed{…}` 뒤에 이어 붙인다:

```css
.field{display:grid;gap:4px;min-width:0}.field>span{font-size:12px;color:var(--muted)}.check-field{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#f9fafb;font-size:14px;cursor:pointer}html.dark .check-field{background:#11151d}.form .check-field input{width:18px;height:18px;min-height:0;padding:0;margin:0;accent-color:var(--blue)}.check-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.check-row .check-field{flex:1}.form-row:has(#repeat option[value=none]:checked){grid-template-columns:1fr}.form-row:has(#repeat option[value=none]:checked) #repeatCount{display:none}
```

- [ ] **Step 3: ui.js 폼 함수**

import 줄에 `FIXED_PROJECTS`가 이미 있는지 확인(Task 3). `resetForm`과 `fillEditForm` 사이에 추가한다:

```js
// 프로젝트 select 옵션. selected 가 목록에 없으면 임시 옵션으로 넣는다(옛 이름, null → 미분류).
export function renderProjectOptions(selected) {
  const sel = $('#project');
  const names = [...state.projects];
  const value = selected === undefined ? (names.includes('개인 일정') ? '개인 일정' : (names[0] || '')) : (selected || '');
  if (selected && !names.includes(selected)) names.push(selected);
  const opts = names.map(p => `<option value="${esc(p)}">${esc(p)}</option>`);
  if (selected === null) opts.unshift('<option value="">미분류</option>');
  sel.innerHTML = opts.join('');
  sel.value = value;
}

// 하루종일: 시간칸을 비우고 잠근다. "1시간 전" 알림도 의미가 없으니 끈다.
export function setAllDay(on) {
  $('#allDay').checked = on;
  $('#time').disabled = on;
  if (on) $('#time').value = '';
  $('#remind1h').disabled = on;
  if (on) $('#remind1h').checked = false;
}
```

`resetForm`을 다음으로 교체한다:

```js
export function resetForm() {
  state.editId = null;
  $('#formTitle').textContent = '업무 · 일정 추가';
  $('#submitTask').textContent = '추가하기';
  $('#cancelEdit').hidden = true;
  $('#repeat').disabled = false;
  $('#repeatCount').disabled = false;
  $('#addForm').reset();
  $('#date').value = state.selectedDate || iso(today);
  $('#endDate').value = '';
  $('#repeatCount').value = 1;
  setAllDay(false);
  renderProjectOptions(undefined);
}
```

`fillEditForm`을 다음으로 교체한다:

```js
export function fillEditForm(t) {
  state.editId = t.id;
  $('#formTitle').textContent = '업무 · 일정 수정';
  $('#submitTask').textContent = '수정 저장';
  $('#cancelEdit').hidden = false;
  $('#title').value = t.title;
  $('#date').value = t.date;
  $('#endDate').value = t.endDate || '';
  $('#priority').value = t.priority;
  renderProjectOptions(t.project || null);
  setAllDay(!t.time);
  $('#time').value = t.time || '';
  $('#remind1h').checked = !!t.remind1h && !!t.time;
  $('#remind1d').checked = !!t.remind1d;
  $('#note').value = t.note || '';
  $('#repeat').value = 'none';
  $('#repeat').disabled = true;
  $('#repeatCount').disabled = true;
  $('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

`renderProjects`(Task 3 버전) 맨 아래, `$('#projectsView').innerHTML = …;` 뒤에 한 줄을 추가해 select를 목록과 동기화한다:

```js
  const cur = $('#project').value;
  renderProjectOptions(state.editId ? (cur || null) : (cur || undefined));
```

- [ ] **Step 4: tasks.js 수정**

import 줄:

```js
import { iso, addDays, sortTasks, occurrenceDates, splitSeriesEdit, shiftEndDate } from './lib.js';
```

`load()`의 매핑에 세 줄을 추가한다(`seriesId` 줄 뒤):

```js
    seriesId: x.series_id || null,
    endDate: x.end_date || null,
    remind1h: !!x.remind_1h,
    remind1d: !!x.remind_1d
```

`readForm`을 교체한다:

```js
function readForm() {
  const allDay = $('#allDay').checked;
  return {
    title: $('#title').value.trim(),
    task_date: $('#date').value,
    end_date: $('#endDate').value || null,
    priority: $('#priority').value,
    project: $('#project').value || null,
    task_time: allDay ? null : ($('#time').value || null),
    remind_1h: allDay ? false : $('#remind1h').checked,
    remind_1d: $('#remind1d').checked,
    note: $('#note').value.trim() || null,
    updated_at: new Date().toISOString()
  };
}
```

`saveTask`에서 `const base = readForm();` 바로 뒤에 검증을 넣는다:

```js
  if (base.end_date && base.end_date < base.task_date) return alert('종료일은 시작일보다 앞설 수 없습니다.');
```

'following' 분기를 다음으로 교체한다:

```js
    if (scope === 'following') {
      const { seriesFields, task_date, end_date } = splitSeriesEdit(base);
      const r1 = await sb.from('work_tasks').update(seriesFields)
        .eq('series_id', current.seriesId).gte('task_date', current.date);
      if (r1.error) return alert('수정하지 못했습니다.');
      if (task_date !== current.date || end_date !== current.endDate) {
        const r2 = await sb.from('work_tasks').update({ task_date, end_date }).eq('id', state.editId);
        if (r2.error) { await load(); return alert('날짜를 수정하지 못했습니다.'); }
      }
    }
```

insert `records` 매핑을 교체한다:

```js
  const records = occurrenceDates(base.task_date, repeat, count).map(date => ({
    user_id: state.user.id,
    title: base.title,
    task_date: date,
    end_date: shiftEndDate(base.task_date, base.end_date, date),
    priority: base.priority,
    project: base.project,
    task_time: base.task_time,
    remind_1h: base.remind_1h,
    remind_1d: base.remind_1d,
    note: base.note,
    series_id: seriesId
  }));
```

- [ ] **Step 5: app.js 바인딩**

import 줄에 `setAllDay`를 추가한다:

```js
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay } from './ui.js';
```

`$('#cancelEdit').onclick = resetForm;` 뒤에 추가한다:

```js
$('#allDay').addEventListener('change', e => setAllDay(e.target.checked));
```

- [ ] **Step 6: 확인**

```bash
for f in tasks.js ui.js app.js; do node --check "$f" || echo "FAIL $f"; done
npm test
grep -c 'datalist' index.html
```
Expected: FAIL 없음, `# pass 17`, datalist `0`.

로컬 확인: `python -m http.server 8080 --bind 127.0.0.1 & SRV=$!`, 브라우저로 `http://127.0.0.1:8080/` 열어 콘솔 에러 0(로그인 오버레이는 정상). 로그인 없이 확인 가능한 것: `document.getElementById('project').tagName === 'SELECT'`, `#endDate`·`#allDay`·`#remind1h`·`#remind1d` 존재, `#repeatCount`의 `getComputedStyle(...).display === 'none'`(반복 없음 상태). 끝나면 `kill $SRV`.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css tasks.js ui.js app.js
git commit -m "feat: date range, all-day, reminder flags, project select in task form"
```

---

### Task 5: 표시 규칙 — 카드·오늘/이번 주·캘린더·알림 버튼

**Files:**
- Modify: `ui.js`(`dueInfo`, `taskHTML`, `render`, `calendar`), `tasks.js`(`notifyDue`), `styles.css`

**Interfaces:**
- Consumes: `dueDate`, `spansDay`, `dueState`, `fmtMd`, `projectColor` from `lib.js`; `t.endDate/remind1h/remind1d`(Task 4).

- [ ] **Step 1: ui.js import 줄 교체**

```js
import { iso, addDays, esc, pri, sortTasks, projectColor, FIXED_PROJECTS, dueDate, spansDay, dueState, fmtMd } from './lib.js';
```

- [ ] **Step 2: dueInfo / taskHTML 교체**

```js
function dueInfo(t) {
  if (t.done) return '';
  const s = dueState(t, iso(today));
  if (s === 'past') return '<span class="due-badge overdue">지남</span>';
  if (s === 'today') return '<span class="due-badge today-due">오늘</span>';
  if (s === 'ongoing') return '<span class="due-badge ongoing">진행중</span>';
  if (s.startsWith('soon:')) return `<span class="due-badge soon">${s.slice(5)}일</span>`;
  return '';
}

function taskMeta(t) {
  const parts = [];
  if (t.endDate && t.endDate !== t.date) parts.push(`${fmtMd(t.date)} ~ ${fmtMd(t.endDate)}`);
  parts.push(t.time ? esc(t.time) : '하루종일');
  parts.push(esc(t.project || '미분류'));
  if (t.note) parts.push(esc(t.note));
  return parts.join(' · ');
}

function remindBadge(t) {
  const on = [t.remind1h && '1시간 전', t.remind1d && '하루 전'].filter(Boolean);
  return on.length ? `<span class="badge remind" title="${on.join(' · ')}">알림</span>` : '';
}

function taskHTML(t) {
  return `<div class="task ${t.done ? 'done' : ''}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${esc(t.id)}" style="accent-color:${projectColor(t.project)}">
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${taskMeta(t)}</div>
    </div>
    ${dueInfo(t)}
    ${t.seriesId ? '<span class="badge repeat">반복</span>' : ''}
    ${remindBadge(t)}
    <span class="badge ${t.priority}">${pri(t.priority)}</span>
    <button class="edit" data-action="edit-task" data-id="${esc(t.id)}">수정</button>
    <button class="delete" aria-label="삭제" data-action="remove-task" data-id="${esc(t.id)}">×</button>
  </div>`;
}
```

- [ ] **Step 3: render()의 세 필터 교체**

```js
  $('#todayTasks').innerHTML = shown.filter(t => spansDay(t, td)).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">오늘 등록된 업무가 없습니다.</div>';
  const until = iso(addDays(today, 7));
  $('#weekTasks').innerHTML = shown.filter(t => !t.done && dueDate(t) >= td && dueDate(t) <= until).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">이번 주 마감 업무가 없습니다.</div>';

  const dueSoon = open.filter(t => dueDate(t) <= iso(addDays(today, 3))).sort(sortTasks);
```

- [ ] **Step 4: calendar()의 칸 채우기 교체**

`const list = shown.filter(t => t.date === dayIso).slice(0, 2);` 와 그 다음 `html += …` 줄을 다음으로 바꾼다:

```js
    const list = shown.filter(t => spansDay(t, dayIso)).slice(0, 2);
    const dots = list.map(t => {
      const c = projectColor(t.project);
      return `<span class="dot" style="background:${c}22;color:${c}">${esc(t.title)}</span>`;
    }).join('');
    html += `<button class="day ${other ? 'other' : ''} ${dayIso === iso(today) ? 'today' : ''} ${dayIso === state.selectedDate ? 'selected' : ''}" data-date="${dayIso}"><b>${n}</b>${dots}</button>`;
```

- [ ] **Step 5: tasks.js notifyDue 마감일 기준**

import 줄에 `dueDate`를 추가하고:

```js
import { iso, addDays, sortTasks, occurrenceDates, splitSeriesEdit, shiftEndDate, dueDate } from './lib.js';
```

`notifyDue`의 필터를 바꾼다:

```js
  const due = state.tasks.filter(t => !t.done && dueDate(t) <= iso(addDays(today, 3))).sort(sortTasks);
```

- [ ] **Step 6: styles.css 추가**

Task 4에서 붙인 규칙 뒤에 이어 붙인다:

```css
.ongoing{background:#eef6ff;color:#075bb8}.badge.remind{background:#fff4e5;color:#b45309}html.dark .dot{filter:brightness(1.35)}
```

- [ ] **Step 7: 확인**

```bash
for f in ui.js tasks.js; do node --check "$f" || echo "FAIL $f"; done
npm test
```
Expected: FAIL 없음, `# pass 17`.

- [ ] **Step 8: Commit**

```bash
git add ui.js tasks.js styles.css
git commit -m "feat: show date ranges, all-day, reminder badge, project colors"
```

---

### Task 6: 배포 + 프로덕션 검증 + 문서

**전제:** Task 1 Step 5의 SQL이 적용되어 있어야 한다.

- [ ] **Step 1: 로컬 정적 서빙 확인**

```bash
python -m http.server 8080 --bind 127.0.0.1 & SRV=$!
sleep 1
for p in / /app.js /lib.js /ui.js /tasks.js /projects.js /styles.css; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8080$p"; done
kill $SRV
```
Expected: 전부 200.

- [ ] **Step 2: main 병합 + push (사용자 지시 후)**

```bash
git checkout main && git merge --ff-only feat/form-ui && git push origin main
```
1~2분 뒤 `curl -s https://my-work-desk.vercel.app/lib.js | grep -c projectColor` → `1` 이상.

- [ ] **Step 3: 프로덕션 화면 검증 (Claude in Chrome, 로그인 상태)**

각 항목을 화면·DOM에서 직접 확인하고 결과를 번호대로 기록한다. 하나라도 어긋나면 중단.

1. 콘솔 에러 0. 프로젝트 칩에 회사 업무·개인 일정·가족 일정이 앞에 있고 × 없음. 기존 "투자 · 자산" 등은 뒤에 × 있음. 각 칩 앞 색 점이 파랑·초록·주황.
2. 폼: `#project`가 select이고 기본 "개인 일정". 반복 "없음"에서 `#repeatCount`가 안 보임(`display: none`); "매주 반복"으로 바꾸면 보임.
3. "하루종일" 체크 → `#time` disabled·빈 값, `#remind1h` disabled·해제. 해제하면 풀림.
4. 기간 일정 생성: 제목 "출장검증", 시작일 = 오늘, 종료일 = 오늘+2, 하루종일, 알림 "하루 전" 체크, 프로젝트 "회사 업무". 결과: 오늘 목록에 뜸, 메타 `M/D ~ M/D · 하루종일 · 회사 업무`, 배지 "진행중"·"알림"(title "하루 전"), 체크박스 accent-color `#0a84ff`. 캘린더에 오늘·내일·모레 3칸 표시, 점 색 파랑 계열.
5. "가족검증" 개인 일정→가족 일정으로 하나, "개인검증" 개인 일정으로 하나 생성(하루짜리, 시간 10:00, 알림 "1시간 전"). 세 업무의 체크박스 `accent-color`가 서로 다름(스크린샷). "개인검증" 메타에 `10:00 · 개인 일정`, 배지 "알림"(title "1시간 전").
6. 종료일 < 시작일로 저장 시도 → alert "종료일은 시작일보다 앞설 수 없습니다.", 저장 안 됨.
7. "출장검증" 수정 → 폼에 종료일·하루종일 체크·"하루 전" 체크가 복원됨. 종료일을 오늘+4로 바꿔 저장 → 캘린더 5칸.
8. 반복 + 기간: "반복검증" 시작 오늘, 종료 오늘+1, 매주 2회 → 두 회차 모두 2칸씩(다음 주 것도 2칸).
9. 고정 프로젝트 삭제 시도(예: `deleteProject('가족 일정')`를 콘솔에서 `import('/projects.js')`로 호출) → `Error('기본 프로젝트는 삭제할 수 없습니다.')`, 목록 변화 없음.
10. 기존 업무(종료일 없음)가 이전과 같이 보임(있다면). 검증용 업무 4종 삭제(반복은 "이후 모두"), 상태 원복.

- [ ] **Step 4: SESSION_HANDOFF.md 갱신 + Commit**

"업무/일정 기능"에 추가:

```
- 기간 일정(시작일~종료일), 하루종일(task_time null), 알림 시점(remind_1h/remind_1d, 저장만)
- 고정 프로젝트 3개(회사 업무·개인 일정·가족 일정, 삭제 불가) + 프로젝트별 색상(이름 해시)
- 반복 "없음"이면 횟수칸 숨김(CSS :has)
```

"다음 스펙 후보"에서 1번(폼/UI 개선)을 지운다.

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: update handoff for form/UI improvements"
git push origin main
```
