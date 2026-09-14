# 아이디어 노트 (제텔카스텐) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우리집 데스크에 본인 전용 "아이디어 노트" 카드 + 전체화면 노트 뷰를 붙인다. 본문의 `[[제목]]`이 링크이고, 편집 중 `@`로 검색해 링크를 박는다.

**Architecture:** 순수 함수(링크 파싱·검색·멘션 치환·렌더)는 `lib.js`에 두고 `tests/lib.test.mjs`로 못 박는다. Supabase 접근은 새 `notes.js`, 화면은 새 `notes-ui.js`(ui.js가 767줄이라 분리). 링크 표는 없다 — 노트 전체를 클라에 받아 본문을 훑어 연결·백링크를 계산한다.

**Tech Stack:** 순수 JS ES 모듈(빌드 없음), Supabase JS(전역 `window.supabase`), `node --test`. 스펙: `docs/superpowers/specs/2026-09-14-idea-notes-design.md`.

## Global Constraints

- 브라우저는 publishable key만. service_role 키 절대 금지. 새 표 SQL은 `supabase-setup.sql`에 추가하고 **사용자가 Supabase 대시보드에서 실행**한다.
- 새 표 이름은 `work_notes` 하나. 다른 표는 건드리지 않는다.
- 가족 공유 없음(본인 전용). 태그 없음. 노트→업무 전환 없음.
- 링크 문법은 `[[제목]]` 하나. 제목 비교는 대소문자 무시·앞뒤 공백 무시. 제목에 `]]` 금지.
- `@` 검색 트리거는 **줄 시작 또는 공백 뒤의 `@`** 만.
- 편집은 `<textarea>`(`[[제목]]` 글자 그대로). 칩은 읽기 모드에서만.
- 모든 사용자 노출 문구는 존댓말. HTML에 넣는 사용자 텍스트는 반드시 `esc()`.
- 기존 파일 스타일 유지: `$` 셀렉터(`ui.js`의 `export const $`), `data-action` 위임, `<dialog>.showModal()`.
- 각 Task 끝에 `npm test` 통과 + 커밋. 브랜치 `feat/idea-notes`(이미 있음, 스펙 커밋됨).

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib.js` (수정) | 순수 함수: `noteLinks` `noteBacklinks` `renameNoteLinks` `mentionQuery` `applyMention` `searchNotes` `renderNoteBody` `fmtMdDow` |
| `tests/lib.test.mjs` (수정) | 위 함수 테스트 |
| `supabase-setup.sql` (수정) | `work_notes` 표 + RLS |
| `state.js` (수정) | `state.notes`, `state.noteStack` |
| `notes.js` (새) | `loadNotes` `saveNote` `deleteNote` — Supabase 접근, 제목 변경 시 백링크 본문 치환 |
| `notes-ui.js` (새) | 대시보드 카드 렌더, 노트 뷰 다이얼로그(읽기/편집), `@` 팝업 |
| `index.html` (수정) | 카드 + `noteDialog` 골격, `notes-ui.js` 이벤트 배선은 `app.js` |
| `styles.css` (수정) | `.note-*` 스타일 |
| `app.js` (수정) | `start()`에서 `loadNotes()` + 카드 렌더, 클릭 배선 |

---

### Task 1: 순수 함수 — 링크 파싱·백링크·제목 변경 치환

**Files:**
- Modify: `lib.js` (파일 끝에 추가)
- Test: `tests/lib.test.mjs`

**Interfaces:**
- Produces:
  - `normTitle(s: string): string` — `trim().toLowerCase()`
  - `noteLinks(body: string): string[]` — `[[…]]` 안 제목(트림), 중복 제거(normTitle 기준), 순서 유지. 빈 `[[ ]]` 제외
  - `noteBacklinks(title: string, notes: {id,title,body}[]): note[]` — body에 `[[title]]`(normTitle 비교) 가진 노트. 자기 자신 제외
  - `renameNoteLinks(body: string, oldTitle: string, newTitle: string): string` — `[[old]]`(normTitle 비교) → `[[new]]`
  - `isValidNoteTitle(title: string): boolean` — 트림 후 1~100자, `]]` 없음, `[[` 없음

- [ ] **Step 1: 테스트 추가** — `tests/lib.test.mjs` import 줄에 `normTitle, noteLinks, noteBacklinks, renameNoteLinks, isValidNoteTitle` 추가, 파일 끝에:

```js
// ---- 아이디어 노트: 링크 ----
test('noteLinks: [[제목]]을 순서대로, 중복(대소문자·공백 무시) 제거, 빈 링크 제외', () => {
  assert.deepEqual(noteLinks('a [[여신 아이디어]] b [[ 여신 아이디어 ]] c [[Hub]] [[hub]] [[ ]] d'), ['여신 아이디어', 'Hub']);
  assert.deepEqual(noteLinks(''), []);
  assert.deepEqual(noteLinks(null), []);
});

test('noteBacklinks: 나를 가리키는 노트만, 자기 자신은 제외', () => {
  const notes = [
    { id: '1', title: '허브', body: '[[A]] [[b]]' },
    { id: '2', title: 'A', body: '[[허브]] [[A]]' },
    { id: '3', title: 'B', body: '없음' }
  ];
  assert.deepEqual(noteBacklinks('a', notes).map(n => n.id), ['1']);
  assert.deepEqual(noteBacklinks('허브', notes).map(n => n.id), ['2']);
  assert.deepEqual(noteBacklinks('B', notes).map(n => n.id), ['1']);
  assert.deepEqual(noteBacklinks('없음', notes), []);
});

test('renameNoteLinks: 대소문자 무시로 치환, 다른 링크는 그대로', () => {
  assert.equal(renameNoteLinks('x [[old]] y [[OLD ]] z [[other]]', 'Old', 'New'), 'x [[New]] y [[New]] z [[other]]');
  assert.equal(renameNoteLinks('', 'a', 'b'), '');
});

test('isValidNoteTitle: 1~100자, [[ ]] 금지', () => {
  assert.equal(isValidNoteTitle('여신 아이디어'), true);
  assert.equal(isValidNoteTitle('   '), false);
  assert.equal(isValidNoteTitle('a]]b'), false);
  assert.equal(isValidNoteTitle('[[a'), false);
  assert.equal(isValidNoteTitle('x'.repeat(101)), false);
});
```

- [ ] **Step 2: 실패 확인** — `cd C:/projects/my-work-desk && npm test` → `SyntaxError: ... does not provide an export named 'normTitle'`

- [ ] **Step 3: 구현** — `lib.js` 끝에:

```js
// ---- 아이디어 노트 ----
// 링크 문법은 본문 안의 [[제목]] 하나. 링크 표는 없고 노트 전체를 훑어 연결·백링크를 계산한다.
const LINK_RE = /\[\[([^\[\]]+?)\]\]/g;

export function normTitle(s) { return String(s || '').trim().toLowerCase(); }

export function noteLinks(body) {
  const out = [], seen = new Set();
  for (const m of String(body || '').matchAll(LINK_RE)) {
    const t = m[1].trim();
    const k = normTitle(t);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  return out;
}

export function noteBacklinks(title, notes) {
  const k = normTitle(title);
  return (notes || []).filter(n => normTitle(n.title) !== k && noteLinks(n.body).some(l => normTitle(l) === k));
}

export function renameNoteLinks(body, oldTitle, newTitle) {
  const k = normTitle(oldTitle);
  return String(body || '').replace(LINK_RE, (m, t) => normTitle(t) === k ? `[[${newTitle}]]` : m);
}

export function isValidNoteTitle(title) {
  const t = String(title || '').trim();
  return t.length >= 1 && t.length <= 100 && !t.includes(']]') && !t.includes('[[');
}
```

- [ ] **Step 4: 통과 확인** — `npm test` → `pass 36`(기존 32 + 4)

- [ ] **Step 5: 커밋**
```bash
git add lib.js tests/lib.test.mjs
git commit -m "feat(notes): 링크 파싱·백링크·제목 변경 치환 순수 함수"
```

---

### Task 2: 순수 함수 — `@` 멘션 잘라내기·치환, 검색, 본문 렌더, 요일 날짜

**Files:**
- Modify: `lib.js`
- Test: `tests/lib.test.mjs`

**Interfaces:**
- Consumes: `esc`, `normTitle`, `noteLinks` (Task 1)
- Produces:
  - `mentionQuery(text: string, caret: number): {start:number, query:string} | null` — 커서 앞에서 가장 가까운 `@`가 줄 시작/공백 뒤이고, `@`~커서 사이에 줄바꿈이 없으면 `{start: @의 인덱스, query: @ 뒤 글자}`. 아니면 null
  - `applyMention(text: string, start: number, caret: number, title: string): {text:string, caret:number}` — `text[start..caret)`를 `[[title]] `로 치환, 새 caret은 치환 뒤
  - `searchNotes(notes, q: string): note[]` — q 트림·소문자; 빈 q면 전부. 제목 또는 본문 포함. `updated_at` 내림차순
  - `renderNoteBody(body: string, titles: Set<string>): string` — 줄바꿈 `<br>`, `[[t]]`는 `titles`(normTitle 집합)에 있으면 `<button type="button" class="note-link" data-action="open-note" data-title="…">t</button>`, 없으면 `<span class="note-link broken">t</span>`. 나머지 텍스트는 `esc`
  - `fmtMdDow(isoStr: string): string` — `9/14(월)`

- [ ] **Step 1: 테스트 추가** — import에 `mentionQuery, applyMention, searchNotes, renderNoteBody, fmtMdDow` 추가:

```js
// ---- 아이디어 노트: @ 멘션 ----
test('mentionQuery: 줄 시작·공백 뒤 @만 트리거, 커서 앞 검색어를 준다', () => {
  assert.deepEqual(mentionQuery('@여신', 3), { start: 0, query: '여신' });
  assert.deepEqual(mentionQuery('메모 @허브 노', 8), { start: 3, query: '허브 노' });
  assert.equal(mentionQuery('a@b', 3), null);            // 이메일처럼 단어 중간
  assert.equal(mentionQuery('@a\nb', 4), null);          // 줄바꿈 넘어감
  assert.equal(mentionQuery('없음', 2), null);
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
});

test('applyMention: @검색어를 [[제목]] 과 공백으로 치환하고 커서를 뒤로', () => {
  assert.deepEqual(applyMention('메모 @허 끝', 3, 5, '허브'), { text: '메모 [[허브]]  끝', caret: 10 });
  assert.deepEqual(applyMention('@', 0, 1, 'A'), { text: '[[A]] ', caret: 6 });
});

test('searchNotes: 제목·본문 부분일치(대소문자 무시), updated_at 내림차순, 빈 검색은 전부', () => {
  const notes = [
    { id: '1', title: 'Hub', body: '', updated_at: '2026-09-01T00:00:00Z' },
    { id: '2', title: '여신', body: '회전일 hub 메모', updated_at: '2026-09-03T00:00:00Z' },
    { id: '3', title: '가족', body: '', updated_at: '2026-09-02T00:00:00Z' }
  ];
  assert.deepEqual(searchNotes(notes, 'hub').map(n => n.id), ['2', '1']);
  assert.deepEqual(searchNotes(notes, '  ').map(n => n.id), ['2', '3', '1']);
  assert.deepEqual(searchNotes(notes, '없음'), []);
});

test('renderNoteBody: 링크는 버튼, 끊긴 링크는 회색 span, 나머지는 esc + <br>', () => {
  const titles = new Set(['허브']);
  assert.equal(
    renderNoteBody('a<b [[허브]]\n[[없음]]', titles),
    'a&lt;b <button type="button" class="note-link" data-action="open-note" data-title="허브">허브</button><br><span class="note-link broken">없음</span>'
  );
  assert.equal(renderNoteBody('', titles), '');
});

test('fmtMdDow: 월/일(요일)', () => {
  assert.equal(fmtMdDow('2026-09-14'), '9/14(월)');
  assert.equal(fmtMdDow('2026-09-13'), '9/13(일)');
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → export 없음 SyntaxError

- [ ] **Step 3: 구현** — `lib.js` 끝에:

```js
// 커서 앞의 "@검색어". @는 줄 시작이나 공백 뒤에서만(이메일 주소를 건드리지 않는다), 줄바꿈을 넘지 않는다.
export function mentionQuery(text, caret) {
  const s = String(text || '').slice(0, caret);
  const at = s.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(s[at - 1])) return null;
  const query = s.slice(at + 1);
  if (query.includes('\n')) return null;
  return { start: at, query };
}

export function applyMention(text, start, caret, title) {
  const s = String(text || '');
  const ins = `[[${title}]] `;
  return { text: s.slice(0, start) + ins + s.slice(caret), caret: start + ins.length };
}

export function searchNotes(notes, q) {
  const k = String(q || '').trim().toLowerCase();
  return (notes || [])
    .filter(n => !k || String(n.title || '').toLowerCase().includes(k) || String(n.body || '').toLowerCase().includes(k))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function renderNoteBody(body, titles) {
  const s = String(body || '');
  let out = '', last = 0;
  for (const m of s.matchAll(LINK_RE)) {
    out += esc(s.slice(last, m.index));
    const t = m[1].trim();
    out += titles.has(normTitle(t))
      ? `<button type="button" class="note-link" data-action="open-note" data-title="${esc(t)}">${esc(t)}</button>`
      : `<span class="note-link broken">${esc(t)}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(s.slice(last));
  return out.replace(/\n/g, '<br>');
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtMdDow(isoStr) {
  return `${fmtMd(isoStr)}(${DOW[parseIso(isoStr).getDay()]})`;
}
```

- [ ] **Step 4: 통과 확인** — `npm test` → `pass 41`

- [ ] **Step 5: 커밋**
```bash
git add lib.js tests/lib.test.mjs
git commit -m "feat(notes): @ 멘션·검색·본문 렌더·요일 날짜 순수 함수"
```

---

### Task 3: SQL + 상태 + `notes.js` (Supabase 접근)

**Files:**
- Modify: `supabase-setup.sql` (끝에 추가)
- Modify: `state.js`
- Create: `notes.js`

**Interfaces:**
- Consumes: `sb`(`supabase.js`), `state`, `normTitle`, `renameNoteLinks`, `isValidNoteTitle`, `noteBacklinks`
- Produces:
  - `state.notes: {id,title,body,updated_at}[]`, `state.noteStack: string[]`(노트 id 스택), `state.notesReady: boolean`
  - `loadNotes(): Promise<Error|null>`
  - `saveNote({id?: string, title: string, body: string}): Promise<Error|null>` — id 없으면 insert. 제목 유효성·중복 검사. 제목이 바뀌면 백링크 본문 치환 후 저장
  - `deleteNote(id): Promise<Error|null>`
  - `findNoteByTitle(title): note|undefined`

- [ ] **Step 1: SQL 추가** — `supabase-setup.sql` 끝에:

```sql
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
```

- [ ] **Step 2: state.js** — `holidays: {}` 뒤에 추가:

```js
  holidays: {},     // { [iso]: '공휴일 이름' } — holidays.js 가 채운다
  notes: [],        // 아이디어 노트 { id, title, body, updated_at } — notes.js 가 채운다
  notesReady: false,
  noteStack: []     // 노트 뷰에서 링크 타고 들어간 노트 id 스택 (← 뒤로)
```
(`holidays` 줄 끝의 쉼표를 잊지 말 것)

- [ ] **Step 3: notes.js 작성**

```js
import { sb } from './supabase.js';
import { state } from './state.js';
import { normTitle, renameNoteLinks, isValidNoteTitle, noteBacklinks } from './lib.js';

export async function loadNotes() {
  const { data, error } = await sb.from('work_notes')
    .select('id,title,body,updated_at')
    .order('updated_at', { ascending: false });
  if (error) { state.notes = []; state.notesReady = false; return error; }
  state.notes = data;
  state.notesReady = true;
  return null;
}

export function findNoteByTitle(title) {
  const k = normTitle(title);
  return state.notes.find(n => normTitle(n.title) === k);
}

// 저장. 제목이 바뀌면 그 제목을 가리키던 다른 노트의 [[옛제목]]도 함께 바꾼다.
export async function saveNote({ id, title, body }) {
  title = String(title || '').trim();
  body = String(body || '');
  if (!isValidNoteTitle(title)) return new Error('제목은 1~100자이고 [[ ]] 를 포함할 수 없습니다.');
  const dup = findNoteByTitle(title);
  if (dup && dup.id !== id) return new Error('같은 제목의 노트가 있습니다.');
  const now = new Date().toISOString();
  if (!id) {
    const { error } = await sb.from('work_notes').insert({ user_id: state.user.id, title, body, updated_at: now });
    if (error) return error.code === '23505' ? new Error('같은 제목의 노트가 있습니다.') : error;
    return loadNotes();
  }
  const prev = state.notes.find(n => n.id === id);
  if (prev && normTitle(prev.title) !== normTitle(title)) {
    for (const n of noteBacklinks(prev.title, state.notes)) {
      const { error } = await sb.from('work_notes')
        .update({ body: renameNoteLinks(n.body, prev.title, title), updated_at: now }).eq('id', n.id);
      if (error) return error;
    }
  }
  const { error } = await sb.from('work_notes').update({ title, body, updated_at: now }).eq('id', id);
  if (error) return error.code === '23505' ? new Error('같은 제목의 노트가 있습니다.') : error;
  return loadNotes();
}

export async function deleteNote(id) {
  const { error } = await sb.from('work_notes').delete().eq('id', id);
  if (error) return error;
  return loadNotes();
}
```

- [ ] **Step 4: 문법 확인** — `node --check notes.js && node --check state.js && npm test` → 통과(테스트 수 변화 없음 41)

- [ ] **Step 5: 커밋**
```bash
git add supabase-setup.sql state.js notes.js
git commit -m "feat(notes): work_notes 표·RLS + 상태 + Supabase 접근 모듈"
```

---

### Task 4: HTML·CSS 골격 (카드 + 노트 다이얼로그)

**Files:**
- Modify: `index.html` — "프로젝트 관리" 카드 바로 뒤(줄 54 `</article>` 다음)에 카드, `dayDialog` 앞에 다이얼로그
- Modify: `styles.css` — 파일 끝 `@media(max-width:760px)` 블록 **앞**에 추가

**Interfaces:**
- Produces(DOM id): `#notesCard` `#noteSearch` `#noteAddBtn` `#noteStatus` `#noteList` · `#noteDialog` `#noteBack` `#noteDialogTitle` `#noteClose` `#noteRead`(읽기 모드 루트) `#noteReadTitle` `#noteReadBody` `#noteOut` `#noteIn` `#noteEditBtn` `#noteDeleteBtn` · `#noteEdit`(편집 모드 루트, `<form>`) `#noteId` `#noteTitle` `#noteBody` `#noteMention` `#noteSave` `#noteCancel`

- [ ] **Step 1: 카드 마크업** — `index.html` "프로젝트 관리" `</article>` 뒤에:

```html
      <article class="card" id="notesCard">
        <div class="card-head"><div><h2>아이디어 노트</h2><span class="hint">생각 하나에 카드 한 장. 본문에서 @로 다른 카드와 잇습니다.</span></div><button id="noteAddBtn" class="tool">＋ 새 노트</button></div>
        <div id="noteStatus" class="status"></div>
        <input id="noteSearch" class="note-search" placeholder="노트 검색 (제목·본문)" autocomplete="off">
        <div id="noteList" class="note-list"></div>
      </article>
```

- [ ] **Step 2: 다이얼로그 마크업** — `<dialog id="dayDialog"` 바로 앞에:

```html
  <dialog id="noteDialog" class="note-dialog">
    <div class="note-dialog-body">
      <div class="day-dialog-head">
        <div class="day-dialog-title"><button id="noteBack" type="button" class="text-button note-back" hidden>← 뒤로</button><span id="noteDialogTitle" class="hint">아이디어 노트</span></div>
        <div class="day-dialog-actions"><button id="noteClose" type="button" class="text-button" aria-label="닫기">×</button></div>
      </div>
      <div id="noteRead">
        <h3 id="noteReadTitle" class="note-h"></h3>
        <div id="noteReadBody" class="note-body"></div>
        <div class="note-rel"><p class="section-head">→ 연결한 노트</p><div id="noteOut" class="note-chips"></div></div>
        <div class="note-rel"><p class="section-head">← 이 노트를 가리키는 노트</p><div id="noteIn" class="note-chips"></div></div>
        <div class="dialog-actions"><button id="noteEditBtn" type="button" class="primary">수정</button><button id="noteDeleteBtn" type="button" class="tool">삭제</button></div>
      </div>
      <form id="noteEdit" class="form" hidden>
        <input id="noteId" type="hidden">
        <input id="noteTitle" required maxlength="100" placeholder="제목 (생각 하나)">
        <div class="note-edit-wrap">
          <div id="noteMention" class="note-mention" hidden></div>
          <textarea id="noteBody" maxlength="5000" placeholder="본문. @를 치면 다른 노트를 검색해 [[제목]]으로 잇습니다."></textarea>
        </div>
        <div class="dialog-actions"><button id="noteSave" class="primary">저장</button><button id="noteCancel" type="button" class="tool">취소</button></div>
      </form>
    </div>
  </dialog>
```

- [ ] **Step 3: CSS** — `styles.css`의 마지막 `@media(max-width:760px)` 앞에(한 줄로 이어 붙여도 됨):

```css
.note-search{width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#f7faf1;color:var(--ink);font-size:14px;outline:0;margin-bottom:10px}html.dark .note-search{background:#121712}.note-search:focus{border-color:var(--blue);background:var(--paper);box-shadow:0 0 0 3px rgba(47,122,61,.18)}
.note-list{display:grid;gap:6px}.note-item{display:grid;gap:2px;text-align:left;padding:10px 8px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;min-width:0}.note-item:hover{background:#f7faf1}html.dark .note-item:hover{background:#262d20}.note-item b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.note-item span{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note-dialog{border:1px solid var(--line);border-radius:16px;padding:0;width:min(600px,94vw);background:var(--paper);color:var(--ink);box-shadow:var(--shadow);max-height:92vh;overflow:hidden}.note-dialog::backdrop{background:rgba(0,0,0,.35)}.note-dialog-body{padding:20px;max-height:92vh;overflow-y:auto}.note-back{padding:0 4px 0 0;font-weight:700}
.note-h{margin:0 0 10px;font-size:20px;line-height:1.25}.note-body{font-size:15px;line-height:1.7;white-space:normal;word-break:break-word;min-height:40px}
.note-link{display:inline-block;padding:1px 8px;border:1px solid var(--blue);border-radius:999px;background:#eaf3d9;color:var(--blue-dark);font-size:13px;font-weight:700;cursor:pointer;line-height:1.5;vertical-align:baseline}html.dark .note-link{background:#1f2a12;color:#a3d977}.note-link.broken{border-color:var(--line);background:transparent;color:var(--muted);cursor:default;text-decoration:line-through}
.note-rel{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.note-chips{display:flex;flex-wrap:wrap;gap:6px}.note-chips .empty{padding:4px 0;text-align:left;font-size:13px}
.note-edit-wrap{position:relative}.note-edit-wrap textarea{min-height:200px}.note-mention{position:absolute;left:0;right:0;bottom:100%;margin-bottom:4px;max-height:220px;overflow-y:auto;background:var(--paper);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);z-index:2}.note-mention button{display:block;width:100%;text-align:left;padding:10px 12px;background:transparent;border:0;border-top:1px solid var(--line);color:var(--ink);font-size:14px}.note-mention button:first-child{border-top:0}.note-mention button:hover,.note-mention button.active{background:#f7faf1}html.dark .note-mention button:hover,html.dark .note-mention button.active{background:#262d20}.note-mention button.create{color:var(--blue-dark);font-weight:700}
```

- [ ] **Step 4: 눈 확인** — `cd C:/projects/my-work-desk && npx serve -l 3200 .`(또는 `python -m http.server 3200`) 후 브라우저에서 로그인 → "아이디어 노트" 카드가 프로젝트 관리 아래에 보이고 다이얼로그는 아직 안 열림(정상). 콘솔 에러 없음.

- [ ] **Step 5: 커밋**
```bash
git add index.html styles.css
git commit -m "feat(notes): 아이디어 노트 카드·노트 다이얼로그 골격 + 스타일"
```

---

### Task 5: `notes-ui.js` — 카드 렌더 + 읽기 모드 + 스택

**Files:**
- Create: `notes-ui.js`
- Modify: `app.js` — import, `start()`에서 로드·렌더, 클릭 배선

**Interfaces:**
- Consumes: `$`(ui.js), `state`, `esc`, `searchNotes`, `noteLinks`, `noteBacklinks`, `renderNoteBody`, `normTitle`, `fmtMdDow`, `loadNotes`, `deleteNote`, `findNoteByTitle`
- Produces: `renderNotesCard()`, `openNote(id)`, `openNoteByTitle(title)`, `goBackNote()`, `closeNoteDialog()`, `setNoteStatus(msg)`. Task 6이 `openNoteEditor(id|null)`, `onNoteFormSubmit`, `onNoteBodyInput` 등을 같은 파일에 추가한다.

- [ ] **Step 1: notes-ui.js 작성**

```js
import { $ } from './ui.js';
import { state } from './state.js';
import { esc, searchNotes, noteLinks, noteBacklinks, renderNoteBody, normTitle, fmtMdDow } from './lib.js';
import { deleteNote, findNoteByTitle } from './notes.js';

export function setNoteStatus(msg) { const el = $('#noteStatus'); if (el) el.textContent = msg || ''; }

function titleSet() { return new Set(state.notes.map(n => normTitle(n.title))); }

function noteItemHTML(n) {
  const first = String(n.body || '').split('\n').find(l => l.trim()) || '';
  const when = n.updated_at ? fmtMdDow(n.updated_at.slice(0, 10)) : '';
  return `<button type="button" class="note-item" data-action="open-note-id" data-id="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(first) || '(본문 없음)'}${when ? ` · ${when}` : ''}</span></button>`;
}

// 대시보드 카드: 검색어 있으면 결과 전부, 없으면 최근 수정 5장.
export function renderNotesCard() {
  const q = $('#noteSearch')?.value || '';
  const list = searchNotes(state.notes, q);
  const shown = q.trim() ? list : list.slice(0, 5);
  $('#noteList').innerHTML = shown.map(noteItemHTML).join('')
    || `<div class="empty">${q.trim() ? '검색 결과가 없습니다.' : '아직 노트가 없습니다. ＋ 새 노트로 첫 생각을 적어 보세요.'}</div>`;
}

function chipHTML(n) {
  return `<button type="button" class="note-link" data-action="open-note-id" data-id="${esc(n.id)}">${esc(n.title)}</button>`;
}

function renderRead(n) {
  const titles = titleSet();
  $('#noteReadTitle').textContent = n.title;
  $('#noteReadBody').innerHTML = renderNoteBody(n.body, titles) || '<span class="hint">본문이 없습니다.</span>';
  const out = noteLinks(n.body).map(t => findNoteByTitle(t)).filter(Boolean).filter(x => x.id !== n.id);
  const inn = noteBacklinks(n.title, state.notes);
  $('#noteOut').innerHTML = out.map(chipHTML).join('') || '<div class="empty">아직 연결한 노트가 없습니다.</div>';
  $('#noteIn').innerHTML = inn.map(chipHTML).join('') || '<div class="empty">이 노트를 가리키는 노트가 없습니다.</div>';
  $('#noteBack').hidden = state.noteStack.length <= 1;
  $('#noteRead').hidden = false;
  $('#noteEdit').hidden = true;
}

// 노트 뷰 열기. push=true 면 스택에 쌓는다(링크 타고 들어갈 때). false 면 스택 맨 위를 교체(저장 후 다시 보기).
export function openNote(id, push = true) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  if (push) state.noteStack.push(id);
  else if (state.noteStack.length) state.noteStack[state.noteStack.length - 1] = id;
  else state.noteStack.push(id);
  renderRead(n);
  const d = $('#noteDialog');
  if (!d.open) d.showModal();
  d.querySelector('.note-dialog-body').scrollTop = 0;
}

export function openNoteByTitle(title) {
  const n = findNoteByTitle(title);
  if (n) openNote(n.id, true);
}

export function goBackNote() {
  if (state.noteStack.length <= 1) return;
  state.noteStack.pop();
  openNote(state.noteStack[state.noteStack.length - 1], false);
}

export function closeNoteDialog() {
  state.noteStack = [];
  const d = $('#noteDialog');
  if (d.open) d.close();
}

export function currentNoteId() { return state.noteStack[state.noteStack.length - 1] || null; }

export async function onDeleteCurrentNote() {
  const id = currentNoteId();
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  if (!confirm(`"${n.title}" 노트를 삭제할까요? 다른 노트에 남은 링크는 끊긴 링크로 표시됩니다.`)) return;
  const err = await deleteNote(id);
  if (err) return alert(err.message || '삭제하지 못했습니다.');
  closeNoteDialog();
  renderNotesCard();
}
```

- [ ] **Step 2: app.js 배선** — import 줄들 뒤에:

```js
import { loadNotes } from './notes.js';
import { renderNotesCard, openNote, openNoteByTitle, goBackNote, closeNoteDialog, onDeleteCurrentNote, setNoteStatus } from './notes-ui.js';
```

`start()`의 `renderFamily();` 뒤에:

```js
  const notesErr = await loadNotes();
  setNoteStatus(notesErr ? '노트를 불러오지 못했습니다. Supabase에 work_notes SQL을 적용했는지 확인해 주세요.' : '');
  renderNotesCard();
```

파일 끝(이벤트 배선들 근처)에:

```js
// ---- 아이디어 노트 ----
$('#noteSearch').addEventListener('input', renderNotesCard);
$('#noteList').addEventListener('click', e => {
  const b = e.target.closest('[data-action="open-note-id"]');
  if (b) openNote(b.dataset.id, true);
});
$('#noteDialog').addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'open-note-id') openNote(b.dataset.id, true);
  if (b.dataset.action === 'open-note') openNoteByTitle(b.dataset.title);
});
$('#noteBack').onclick = goBackNote;
$('#noteClose').onclick = closeNoteDialog;
$('#noteDeleteBtn').onclick = onDeleteCurrentNote;
$('#noteDialog').addEventListener('close', () => { state.noteStack = []; });
```
(`state`가 app.js에 이미 import돼 있는지 확인, 없으면 `import { state } from './state.js';`)

- [ ] **Step 3: 확인** — `node --check notes-ui.js && node --check app.js && npm test`. 브라우저: Supabase 대시보드에서 Task 3 SQL 실행 후 → 카드에 "아직 노트가 없습니다" 문구. (노트 생성은 Task 6이라 여기서는 SQL 편집기로 한 장 넣어 봐도 됨: `insert into work_notes(title, body) values ('허브', '[[없음]] 테스트');` → 카드에 뜨고 누르면 뷰 열림, `없음`은 회색 취소선.)

- [ ] **Step 4: 커밋**
```bash
git add notes-ui.js app.js
git commit -m "feat(notes): 카드 목록·검색 + 노트 뷰 읽기 모드·링크 이동·뒤로·삭제"
```

---

### Task 6: 편집 모드 + `@` 멘션 팝업 + 새 노트 만들기

**Files:**
- Modify: `notes-ui.js`
- Modify: `app.js` — 배선 추가

**Interfaces:**
- Consumes: `mentionQuery`, `applyMention`, `searchNotes`, `saveNote`, `findNoteByTitle`, `renderNotesCard`, `openNote`, `currentNoteId`
- Produces: `openNoteEditor(id|null)`, `onNoteFormSubmit(e)`, `cancelNoteEdit()`, `onNoteBodyInput()`, `onNoteBodyKeydown(e)`, `onMentionClick(e)`

- [ ] **Step 1: notes-ui.js에 추가** — import 줄을 아래로 바꾸고 파일 끝에 함수 추가:

```js
import { esc, searchNotes, noteLinks, noteBacklinks, renderNoteBody, normTitle, fmtMdDow, mentionQuery, applyMention } from './lib.js';
import { deleteNote, findNoteByTitle, saveNote } from './notes.js';
```

```js
// ---- 편집 모드 ----
let mention = null; // { start, query, items: [{title, create?}], active }

export function openNoteEditor(id) {
  const n = id ? state.notes.find(x => x.id === id) : null;
  $('#noteId').value = n?.id || '';
  $('#noteTitle').value = n?.title || '';
  $('#noteBody').value = n?.body || '';
  hideMention();
  $('#noteRead').hidden = true;
  $('#noteEdit').hidden = false;
  $('#noteBack').hidden = true;
  const d = $('#noteDialog');
  if (!d.open) d.showModal();
  if (!n) state.noteStack = [];
  $('#noteTitle').focus();
}

export function cancelNoteEdit() {
  const id = currentNoteId();
  if (id) openNote(id, false); else closeNoteDialog();
}

export async function onNoteFormSubmit(e) {
  e.preventDefault();
  const id = $('#noteId').value || null;
  const title = $('#noteTitle').value;
  const body = $('#noteBody').value;
  $('#noteSave').disabled = true;
  const err = await saveNote({ id, title, body });
  $('#noteSave').disabled = false;
  if (err) return alert(err.message || '저장하지 못했습니다.');
  renderNotesCard();
  const saved = findNoteByTitle(title);
  if (saved) openNote(saved.id, false);
}

// ---- @ 멘션 팝업 ----
function hideMention() { mention = null; const el = $('#noteMention'); el.hidden = true; el.innerHTML = ''; }

function renderMention() {
  const el = $('#noteMention');
  el.innerHTML = mention.items.map((it, i) =>
    `<button type="button" class="${it.create ? 'create' : ''}${i === mention.active ? ' active' : ''}" data-i="${i}">${it.create ? `'${esc(it.title)}' 새 노트 만들기` : esc(it.title)}</button>`
  ).join('');
  el.hidden = false;
}

export function onNoteBodyInput() {
  const ta = $('#noteBody');
  const m = mentionQuery(ta.value, ta.selectionStart);
  if (!m) return hideMention();
  const selfId = $('#noteId').value;
  const q = m.query.trim();
  const items = searchNotes(state.notes, q).filter(n => n.id !== selfId).slice(0, 8).map(n => ({ title: n.title }));
  if (q && !findNoteByTitle(q)) items.push({ title: q, create: true });
  if (!items.length) return hideMention();
  mention = { start: m.start, items, active: 0 };
  renderMention();
}

async function pickMention(i) {
  const it = mention?.items[i];
  if (!it) return;
  const ta = $('#noteBody');
  if (it.create) {
    const err = await saveNote({ title: it.title, body: '' });
    if (err) return alert(err.message || '노트를 만들지 못했습니다.');
    renderNotesCard();
  }
  const r = applyMention(ta.value, mention.start, ta.selectionStart, it.title);
  ta.value = r.text;
  ta.setSelectionRange(r.caret, r.caret);
  hideMention();
  ta.focus();
}

export function onMentionClick(e) {
  const b = e.target.closest('button[data-i]');
  if (b) pickMention(Number(b.dataset.i));
}

export function onNoteBodyKeydown(e) {
  if (!mention) return;
  if (e.key === 'Escape') { e.preventDefault(); hideMention(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); mention.active = (mention.active + 1) % mention.items.length; renderMention(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); mention.active = (mention.active - 1 + mention.items.length) % mention.items.length; renderMention(); return; }
  if (e.key === 'Enter') { e.preventDefault(); pickMention(mention.active); }
}
```

- [ ] **Step 2: app.js 배선 추가** — import에 `openNoteEditor, onNoteFormSubmit, cancelNoteEdit, onNoteBodyInput, onNoteBodyKeydown, onMentionClick, currentNoteId` 추가, 노트 배선 블록에:

```js
$('#noteAddBtn').onclick = () => openNoteEditor(null);
$('#noteEditBtn').onclick = () => openNoteEditor(currentNoteId());
$('#noteEdit').addEventListener('submit', onNoteFormSubmit);
$('#noteCancel').onclick = cancelNoteEdit;
$('#noteBody').addEventListener('input', onNoteBodyInput);
$('#noteBody').addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) onNoteBodyInput(); });
$('#noteBody').addEventListener('keydown', onNoteBodyKeydown);
$('#noteMention').addEventListener('mousedown', e => e.preventDefault()); // textarea 포커스 유지
$('#noteMention').addEventListener('click', onMentionClick);
```

- [ ] **Step 3: 브라우저 확인(스펙 완료 기준 2·3)** —
  1. ＋ 새 노트 → 제목 "허브" 저장 → 읽기 모드로 전환
  2. ＋ 새 노트 → 제목 "여신 회전일" 본문에 `@허` → 팝업에 "허브" → 선택 → `[[허브]] ` 박힘 → 저장 → 본문에 칩 → 칩 클릭 → 허브 뷰, ← 뒤로 보임, 허브의 "가리키는 노트"에 여신 회전일
  3. 본문에 `@신규아이디어` → "'신규아이디어' 새 노트 만들기" → 선택 → 새 노트 생성 + 링크 삽입
  4. 허브 제목을 "허브2"로 수정 → 여신 회전일 본문이 `[[허브2]]`로 바뀜
  5. 허브2 삭제 → 여신 회전일 본문의 `허브2`가 회색 취소선
  6. 폰(또는 devtools 모바일)에서 `@` 팝업이 textarea 위에 뜨고 키보드에 안 가림

- [ ] **Step 4: 커밋**
```bash
git add notes-ui.js app.js
git commit -m "feat(notes): 편집 모드 + @ 멘션 검색·새 노트 만들기·링크 삽입"
```

---

### Task 7: 문서·핸드오프 + PR

**Files:**
- Modify: `SESSION_HANDOFF.md` — "현재 기능" 아래에 절 추가, 운영 원칙의 표 목록에 `work_notes` 추가

- [ ] **Step 1: SESSION_HANDOFF.md** — 운영 원칙 줄의 표 목록 `…·notification_log` 뒤에 `·work_notes` 추가. "현재 기능"에:

```markdown
### 아이디어 노트 (제텔카스텐, 본인 전용)

- `work_notes`(id, user_id, title, body, updated_at). RLS 본인만. 제목은 계정 안 유일(대소문자·공백 무시).
- 링크는 본문 `[[제목]]`이 전부 — 링크 표 없음. 연결·백링크는 클라에서 `lib.js noteLinks/noteBacklinks`로 계산.
- 제목 바꾸면 `notes.js saveNote`가 백링크 본문의 `[[옛제목]]`을 함께 치환. 삭제하면 남은 링크는 회색 취소선(끊긴 링크).
- 편집은 textarea. `@`(줄 시작·공백 뒤)로 제목 검색 → 선택하면 `[[제목]] ` 삽입. 없는 제목이면 "새 노트 만들기".
- 화면: 대시보드 카드(최근 5장·검색) → `noteDialog` 읽기/편집. 링크 타고 들어간 만큼 `state.noteStack`, ← 뒤로.
- 가족 공유·태그·노트→업무 전환은 안 만듦(스펙 `docs/superpowers/specs/2026-09-14-idea-notes-design.md`).
```

- [ ] **Step 2: 전체 확인** — `npm test`(41 pass) + `for f in *.js; do node --check $f; done`

- [ ] **Step 3: 커밋·PR**
```bash
git add SESSION_HANDOFF.md
git commit -m "docs: 아이디어 노트 핸드오프"
git push -u origin feat/idea-notes
gh pr create --title "feat: 아이디어 노트 (제텔카스텐)" --body "..."
```
PR 본문에 **"머지 전 Supabase 대시보드에서 supabase-setup.sql의 work_notes 절 실행 필요"** 를 맨 위에 적는다. reviewer 서브에이전트 APPROVE 뒤 머지.

---

## Self-Review

- 스펙 커버: 데이터(T3) · 링크 파싱/백링크/치환/끊긴 링크(T1,T2,T5) · 카드 최근5+검색+새노트+빈안내(T5,T4) · 노트 뷰 읽기/스택/뒤로/삭제(T5) · 편집/`@`팝업/새 노트 만들기/Esc/커서 이탈(T6: `keyup`으로 커서 이동 시 재판정, `mentionQuery`가 null이면 닫힘) · 제목 필수/유일/`]]` 금지(T1,T3) · 모바일 팝업 위치(T4 CSS `bottom:100%`) · 요일 표시(T2 `fmtMdDow`, T5 카드) · 순수 함수 7개 전부 테스트(T1,T2)
- 타입 일치: `openNote(id, push)` · `currentNoteId()` · `saveNote({id,title,body})` · `data-action="open-note"`(제목) vs `"open-note-id"`(id) — T2 렌더와 T5 배선 동일
- 스펙 밖: 없음. `fmtMdDow`를 업무 카드 날짜에도 쓰는 건 **별도 작업**(사용자 요청 목록 1번)이라 이 플랜에 안 넣음
