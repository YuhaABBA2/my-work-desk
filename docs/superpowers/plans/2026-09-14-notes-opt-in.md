# 아이디어 노트·시세 패널 계정 설정(켜기/끄기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이디어 노트 카드를 기본 숨김으로 두고 프로필 → 설정에서 계정별로 켜게 하며, 시세·투자 패널 설정도 가장 전용 가드를 없애 모든 계정이 같은 방식으로 켜게 한다.

**Architecture:** 기존 `work_settings.show_market` 패턴 복제. `work_settings`에 `show_notes` 컬럼을 더하고 `settings.js`가 두 값을 `state.settings`로 싣는다. `ui.js`의 `applyNotesVisibility()`/`applyMarketVisibility()`가 카드 `hidden`을 설정값 하나로 결정한다. 부팅 시 노트가 꺼져 있으면 `loadNotes()`를 아예 부르지 않는다. 로직 변경은 전부 DOM·Supabase 접근 코드라 `npm test`에 새 순수 함수 테스트는 없고, 각 Task는 `node --check` + 브라우저 확인으로 닫는다.

**Tech Stack:** 바닐라 ES 모듈, Supabase JS (publishable key), `<dialog>`. 테스트는 `node --test`.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-09-14-notes-opt-in-design.md`
- 노트 설정 컬럼 이름 `show_notes`, 상태 이름 `state.settings.showNotes`, 체크박스 id `setNotes`, 라벨 문구 **"아이디어 노트 보기"**
- 힌트 문구: **"나만 보는 개인 노트입니다. 끄면 카드만 숨고 노트는 지워지지 않습니다."**
- 기본값 끔. 기존 노트 보유 계정 자동 켜기 없음. 끄기는 숨김일 뿐 데이터 삭제 없음.
- 시세·투자 설정 행은 **모든 계정에** 표시 — `state.family.isAdmin` 가드 제거. 컬럼·저장 함수는 그대로.
- `#toggleMarket`(존재하지 않는 요소) 참조를 없앤다.
- `service_role` 키는 어디에도 두지 않는다. SQL은 사용자가 Supabase 대시보드에서 실행한다.
- 커밋 메시지 끝에 붙일 줄:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Yc2ur4TGwTvRPsqS1CwrhP
  ```
- 작업 브랜치 `feat/notes-opt-in` (이미 체크아웃됨). 저장소 `C:\projects\my-work-desk`.

---

## 파일 구조

| 파일 | 역할 | 이번 변경 |
|---|---|---|
| `supabase-setup.sql` | 표·RLS 정의 (사용자가 대시보드에 붙여 실행) | `work_settings.show_notes` 컬럼 (create 정의 + alter) |
| `state.js` | 앱 상태 | `settings` 기본값에 `showNotes: false` |
| `settings.js` | `work_settings` 읽기/쓰기 | `show_notes` 조회, `setShowNotes(on)` |
| `index.html` | 마크업 | 설정 "화면" 섹션에 노트 행 + 힌트, 시세 행의 `hidden` 제거 |
| `ui.js` | 화면 | `applyMarketVisibility` 재작성(가드·죽은 참조 제거), `applyNotesVisibility` 신설, `openSettingsDialog` 체크 반영 |
| `app.js` | 이벤트 배선·부팅 | 부팅 시 조건부 `loadNotes`, `#setNotes` change 핸들러, 가족 변경 시 불필요한 `applyMarketVisibility` 호출 제거 |
| `SESSION_HANDOFF.md` | 다음 세션 인계 | 설정 항목·SQL 안내 |

---

### Task 1: 데이터 — `show_notes` 컬럼 + `settings.js`

**Files:**
- Modify: `supabase-setup.sql:77-81`
- Modify: `state.js:13`
- Modify: `settings.js` (전체 27줄)

**Interfaces:**
- Produces: `state.settings = { showMarket: boolean, showNotes: boolean }`, `setShowNotes(on: boolean): Promise<Error|null>` (성공 시 `state.settings.showNotes` 갱신). Task 2가 이 둘을 쓴다.

- [ ] **Step 1: SQL — 표 정의에 컬럼 추가 + 기존 설치용 alter**

`supabase-setup.sql` 77~81줄의 `work_settings` 정의를 다음으로 바꾼다:

```sql
create table if not exists public.work_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_market boolean not null default false,
  show_notes boolean not null default false,
  updated_at timestamptz not null default now()
);
-- 2026-09-14: 아이디어 노트 켜기/끄기 (기존 설치용)
alter table public.work_settings add column if not exists show_notes boolean not null default false;
```

- [ ] **Step 2: state.js 기본값**

`state.js:13`을 다음으로:

```js
  settings: { showMarket: false, showNotes: false }, // work_settings (계정별)
```

- [ ] **Step 3: settings.js — 조회·저장**

`settings.js` 전체를 다음으로 교체:

```js
import { sb } from './supabase.js';
import { state } from './state.js';

// 계정별 설정. 행이 없거나 조회 실패면 기본값(시세·투자·노트 모두 숨김).
export async function loadSettings() {
  const { data, error } = await sb.from('work_settings').select('show_market,show_notes').eq('user_id', state.user.id).maybeSingle();
  if (error) { state.settings = { showMarket: false, showNotes: false }; return error; }
  state.settings = { showMarket: !!data?.show_market, showNotes: !!data?.show_notes };
  return null;
}

// upsert는 merge-duplicates라 보내지 않은 컬럼은 기존 값을 유지한다 — 두 함수 모두 자기 컬럼만 보낸다.
export async function setShowMarket(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_market: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showMarket = !!on;
  return null;
}

export async function setShowNotes(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_notes: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showNotes = !!on;
  return null;
}
```

주의: 기존 코드는 `loadSettings` 실패 시 `state.settings`를 건드리지 않았다. 컬럼이 아직 없는 배포 직후에는 `select`가 `42703`으로 실패하는데, 그때 노트·시세 모두 꺼진 것으로 보이게 하려고 실패 분기에서도 기본값을 넣는다.

- [ ] **Step 4: 문법 확인 + 기존 테스트**

Run: `cd /c/projects/my-work-desk && node --check settings.js && node --check state.js && npm test 2>&1 | tail -3`
Expected: 에러 없음, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add supabase-setup.sql state.js settings.js
git commit -m "feat(settings): work_settings.show_notes 컬럼 + setShowNotes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Yc2ur4TGwTvRPsqS1CwrhP"
```

---

### Task 2: 화면 — 설정 행·카드 표시·부팅 배선

**Files:**
- Modify: `index.html:148` (시세 행), 그 아래에 노트 행 추가
- Modify: `ui.js:154-164` (`applyMarketVisibility`), `ui.js:544-548` (`openSettingsDialog` 앞부분)
- Modify: `app.js:4` (import), `app.js:13` (import), `app.js:50-57`, `app.js:66-74`, `app.js:138-143` (boot), `app.js:186-191` (setMarket 핸들러)

**Interfaces:**
- Consumes: `state.settings.showNotes`, `state.settings.showMarket`, `setShowNotes(on)`, `setShowMarket(on)` (Task 1); `loadNotes()`, `renderNotesCard()`, `setNoteStatus()`, `closeNoteDialog()` (기존 `notes.js`/`notes-ui.js`).
- Produces: `applyNotesVisibility()`, `applyMarketVisibility()` (둘 다 인자 없음, `ui.js` export).

- [ ] **Step 1: index.html — 설정 행**

`index.html:148`의

```html
        <label class="settings-row" id="setMarketRow" hidden><span>시세·투자 패널 보기</span><input id="setMarket" type="checkbox"></label>
```

를 다음 세 줄로 바꾼다 (`hidden`과 `id="setMarketRow"` 제거, 노트 행·힌트 추가):

```html
        <label class="settings-row"><span>시세·투자 패널 보기</span><input id="setMarket" type="checkbox"></label>
        <label class="settings-row"><span>아이디어 노트 보기</span><input id="setNotes" type="checkbox"></label>
        <p class="hint">나만 보는 개인 노트입니다. 끄면 카드만 숨고 노트는 지워지지 않습니다.</p>
```

- [ ] **Step 2: ui.js — 표시 함수 두 개**

`ui.js:154-164`의 `applyMarketVisibility` 전체(주석 포함)를 다음으로 교체:

```js
// 시세·투자 패널: 계정 설정 하나로 결정. (가장 전용 가드와 헤더 토글 버튼은 2026-09-14에 제거)
export function applyMarketVisibility() {
  const on = !!state.settings.showMarket;
  $('.market-card').hidden = !on;
  $('.investment-card').hidden = !on;
}

// 아이디어 노트 카드: 계정 설정 하나로 결정. 기본 꺼짐.
export function applyNotesVisibility() {
  $('#notesCard').hidden = !state.settings.showNotes;
}
```

- [ ] **Step 3: ui.js — 설정 다이얼로그 열 때 체크 반영**

`ui.js:544-548`의

```js
  $('#setHideDone').checked = !!settings.hideDone;
  $('#setDark').checked = !!settings.dark;
  $('#setMarket').checked = !!state.settings.showMarket;
  const canSeeMarket = !state.family || state.family.isAdmin;
  $('#setMarketRow').hidden = !canSeeMarket;
```

를

```js
  $('#setHideDone').checked = !!settings.hideDone;
  $('#setDark').checked = !!settings.dark;
  $('#setMarket').checked = !!state.settings.showMarket;
  $('#setNotes').checked = !!state.settings.showNotes;
```

로 바꾼다.

- [ ] **Step 4: app.js — import**

`app.js:4`의 import 목록에서 `applyMarketVisibility,` 바로 뒤에 `applyNotesVisibility,`를 넣는다:

```js
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay, renderFamily, applyMarketVisibility, applyNotesVisibility, setFamilyStatus, setShareFamily, syncShareFamilyForProject, openTaskDialog, closeTaskDialog, openSettingsDialog, closeSettingsDialog, renderProfile, openDayDialog, closeDayDialog, openProjectDialog, closeProjectDialog, openSearchDialog, closeSearchDialog, renderSearchResults, weekStartOf, openReactionsFor, closeReactionsDialog, refreshOpenDialogs, updateLunarPreview } from './ui.js';
```

`app.js:13`을

```js
import { loadSettings, setShowMarket, setShowNotes } from './settings.js';
```

- [ ] **Step 5: app.js — 가족 변경 시 호출 제거**

`app.js:50-57`(가족 만들기/합류 핸들러 끝부분)과 `app.js:66-74`(`onSettingsLeaveFamily`)에 있는 `applyMarketVisibility();` 줄을 **각각 한 줄씩 지운다.** 시세 표시가 더는 가족 상태에 안 걸리므로. 지운 뒤 두 곳은 이렇게 보여야 한다:

```js
  await load();
  renderFamily();
  syncShareFamilyForProject();
}
```

```js
  await load();
  renderFamily();
  syncShareFamilyForProject();
  closeSettingsDialog();
}
```

- [ ] **Step 6: app.js — 부팅**

`app.js:138-143`의

```js
  const notesErr = await loadNotes();
  setNoteStatus(notesErr ? '노트를 불러오지 못했습니다. Supabase에 work_notes SQL을 적용했는지 확인해 주세요.' : '');
  renderNotesCard();
  applyMarketVisibility();
  syncShareFamilyForProject();
  if (!$('.market-card').hidden) { renderInvestment(); loadMarket(); }
```

를

```js
  applyNotesVisibility();
  if (state.settings.showNotes) await refreshNotes();
  applyMarketVisibility();
  syncShareFamilyForProject();
  if (!$('.market-card').hidden) { renderInvestment(); loadMarket(); }
```

로 바꾸고, `loadSettings()`를 부르는 부팅 함수 **바로 위**(함수 선언 앞)에 헬퍼를 둔다 (`grep -n "await loadSettings" app.js`로 찾아 그 함수의 `async function` 줄 앞):

```js
// 노트 카드가 켜져 있을 때만 부른다. 꺼져 있으면 work_notes 조회 자체를 안 한다.
async function refreshNotes() {
  const err = await loadNotes();
  setNoteStatus(err ? '노트를 불러오지 못했습니다. Supabase에 work_notes SQL을 적용했는지 확인해 주세요.' : '');
  renderNotesCard();
}
```

- [ ] **Step 7: app.js — 노트 토글 핸들러**

`app.js:186-191`의 `#setMarket` change 핸들러 **바로 아래**에 추가:

```js
$('#setNotes').addEventListener('change', async e => {
  const err = await setShowNotes(e.target.checked);
  if (err) { alert(err.message || '설정을 저장하지 못했습니다.'); e.target.checked = !e.target.checked; return; }
  applyNotesVisibility();
  if (state.settings.showNotes) await refreshNotes();
  else closeNoteDialog();
});
```

`closeNoteDialog`는 `app.js:15`의 `notes-ui.js` import에 이미 있다. `state`가 `app.js`에 import돼 있는지 `grep -n "import { state" app.js`로 확인 — 없으면 `import { state } from './state.js';` 추가.

- [ ] **Step 8: 문법 확인 + 기존 테스트**

Run: `cd /c/projects/my-work-desk && node --check app.js && node --check ui.js && npm test 2>&1 | tail -3 && grep -n "toggleMarket\|setMarketRow\|isAdmin" ui.js app.js index.html`
Expected: 문법 에러 없음, `# fail 0`, grep 결과에 `toggleMarket`·`setMarketRow` 없음, `isAdmin`은 가족 섹션(초대 코드·나가기) 줄만 남음.

- [ ] **Step 9: 브라우저 확인 (SQL 실행 전)**

로컬 서버(`npx serve .` 또는 기존 방식)로 열고 로그인:
1. 노트 카드가 없다. 콘솔에 `Cannot set properties of null` 같은 TypeError가 **없다** (기존 `#toggleMarket` 결함 해소 확인).
2. 프로필 → 설정: "시세·투자 패널 보기"와 "아이디어 노트 보기" 체크박스가 둘 다 보인다 (가족 구성원 계정으로도 확인 가능하면 그 계정에서도).
3. "아이디어 노트 보기" 체크 → `show_notes` 컬럼이 없으므로 alert("설정을 저장하지 못했습니다" 또는 42703 메시지) + 체크 원복.

- [ ] **Step 10: 사용자에게 SQL 실행 요청 후 브라우저 확인**

사용자가 Supabase 대시보드 SQL 편집기에서 Task 1 Step 1의 `alter table … add column if not exists show_notes …` 한 줄을 실행한 뒤:
1. 새로고침 → 설정에서 노트 켬 → 카드와 기존 노트가 그대로 보임 → 새로고침해도 유지.
2. 노트 끔 → 카드 사라짐 → 다시 켬 → 노트 그대로.
3. 시세·투자 켬 → 카드 두 개 보이고 **양돈 시세가 자동으로 실림**(새로고침 버튼 안 눌러도). 끔 → 사라짐.
4. 시세 토글을 바꿔도 노트 체크 상태가 안 바뀌고, 그 반대도 마찬가지.

- [ ] **Step 11: Commit**

```bash
git add index.html ui.js app.js
git commit -m "feat(settings): 아이디어 노트 켜기/끄기 + 시세·투자 설정을 모든 계정에 (가장 가드·#toggleMarket 잔재 제거)

노트는 기본 숨김, 꺼져 있으면 work_notes 조회를 안 한다. applyMarketVisibility가 없는
#toggleMarket을 건드려 TypeError로 loadMarket이 안 돌던 결함도 함께 해소.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Yc2ur4TGwTvRPsqS1CwrhP"
```

---

### Task 3: 핸드오프 문서 + PR

**Files:**
- Modify: `SESSION_HANDOFF.md:49-66` (노트·시세 섹션), `SESSION_HANDOFF.md:88` (파일 구조 줄)

- [ ] **Step 1: 노트 섹션에 설정 안내**

`SESSION_HANDOFF.md` "### 아이디어 노트 (제텔카스텐, 본인 전용) — 2026-09-14" 섹션의 마지막 불릿(스펙·계획 경로 줄) **앞**에 추가:

```markdown
- **기본 숨김.** 프로필 → 설정 → "아이디어 노트 보기"로 계정별 켬(`work_settings.show_notes`). 꺼져 있으면 카드도 없고 `loadNotes()`도 안 부른다. 끄기는 숨김일 뿐 노트는 남는다. 배포 후 기존 사용자도 한 번 켜야 한다. 스펙 `docs/superpowers/specs/2026-09-14-notes-opt-in-design.md`.
```

- [ ] **Step 2: 시세 섹션 제목·조건 수정**

```markdown
### 시세·투자 패널 (관리자 전용)
```
→
```markdown
### 시세·투자 패널 (계정 설정)
```

그 아래 불릿

```markdown
- 툴바 토글 표시 조건: 가족이 없거나 가족의 가장. 구성원에겐 토글·패널 모두 없음.
```
→
```markdown
- 프로필 → 설정 → "시세·투자 패널 보기". 2026-09-14부터 가족 가장 여부와 무관하게 모든 계정이 켤 수 있다. (헤더 토글 버튼은 9/13에 없어졌는데 `applyMarketVisibility`가 계속 참조해 TypeError → `loadMarket` 미실행 결함이 있었다. 같은 날 해소.)
```

- [ ] **Step 3: 파일 구조 줄**

```markdown
- `settings.js`: `work_settings` (show_market)
```
→
```markdown
- `settings.js`: `work_settings` (show_market, show_notes)
```

- [ ] **Step 4: Commit + push + PR**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: 핸드오프 — 노트·시세 계정 설정

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Yc2ur4TGwTvRPsqS1CwrhP"
git push -u origin feat/notes-opt-in
```

PR 본문(`gh pr create --title "feat: 아이디어 노트·시세 패널 계정 설정(켜기/끄기)" --body-file <파일>`로 올린다):

```markdown
## 요약
- 아이디어 노트 카드 기본 숨김 → 프로필 → 설정 "아이디어 노트 보기"로 계정별 켬 (`work_settings.show_notes`)
- 시세·투자 패널 설정을 가족 가장 전용에서 모든 계정으로
- `applyMarketVisibility`가 없어진 `#toggleMarket`을 참조해 TypeError → `loadMarket` 미실행이던 결함 해소

## 배포 후 할 일
Supabase SQL 편집기: `alter table public.work_settings add column if not exists show_notes boolean not null default false;`
기존 노트 사용자도 설정에서 한 번 켜야 카드가 보임.

## 확인
- [ ] 노트 켬/끔/새로고침 유지
- [ ] 시세 켜면 양돈 시세 자동 로드
- [ ] 두 토글이 서로 영향 없음

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Yc2ur4TGwTvRPsqS1CwrhP
```

---

## Self-review (계획 작성자 체크)

- 스펙 커버리지: 데이터(T1) · 설정 화면(T2 S1,S3) · 동작 표(T2 S2,S6,S7) · 시세 가드 제거·죽은 참조(T2 S2,S3,S5) · 파일 목록 전부 · 핸드오프(T3) · 브라우저 확인 4항목(T2 S10). 누락 없음.
- 이름 일치: `show_notes`/`showNotes`/`setShowNotes`/`setNotes`/`applyNotesVisibility`/`refreshNotes` — T1·T2·T3에서 동일.
- `loadSettings` 실패 분기에서 기본값을 넣는 변경은 스펙 "컬럼이 아직 없는 상태 … 노트는 꺼진 것으로 본다"를 구현한 것.
