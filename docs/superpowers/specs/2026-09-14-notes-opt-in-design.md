# 아이디어 노트 켜기/끄기 (계정 설정) — 설계

2026-09-14 · 사용자 확정 (A안: `work_settings` 컬럼 + 설정 체크박스 / 기본 끔 / 기존 노트 있는 계정 자동 켜기 안 함)

## 목적

아이디어 노트는 개인 귀속 기능이다. 안 쓰는 구성원 화면에 카드가 차지하지 않도록 **기본은 사용 안 함**으로 두고,
쓰고 싶은 사람만 프로필 → 설정에서 켠다. 가족 공유 계획은 없다.

`시세·투자 패널 보기`(`work_settings.show_market`)와 같은 틀을 그대로 따른다. 차이는 하나 —
시세는 가족 관리자에게만 토글이 보이지만, 노트 토글은 **모든 계정에** 보인다.

## 데이터

```sql
alter table public.work_settings add column if not exists show_notes boolean not null default false;
```

- `supabase-setup.sql`의 `work_settings` 표 정의에도 컬럼을 추가하고, 위 `alter`를 함께 둔다(새 설치·기존 설치 모두 커버).
- RLS는 기존 `work_settings_all` 정책(본인 행)이 그대로 적용된다. 정책 변경 없음.
- **사용자가 Supabase 대시보드에서 한 번 실행**해야 한다.
- 컬럼이 아직 없는 상태에서 앱이 뜨면 `loadSettings`가 에러를 돌려준다 → 기존 처리(시세와 동일)대로 두고, 노트는 꺼진 것으로 본다.

## 설정 화면

"화면" 섹션, `시세·투자 패널 보기` 행 바로 아래:

```
[ ] 아이디어 노트 보기
    나만 보는 개인 노트입니다. 끄면 카드만 숨고 노트는 지워지지 않습니다.
```

- `id="setNotes"`, 행은 항상 표시(`hidden` 없음).
- 다이얼로그를 열 때마다 `state.settings.showNotes`로 체크 상태를 맞춘다.

## 동작

| 상태 | 카드 `#notesCard` | `loadNotes()` | 노트 다이얼로그 |
|---|---|---|---|
| 꺼짐(기본) | 숨김 | 호출 안 함 (`state.notesReady=false`, `state.notes=[]`) | 열릴 경로 없음(카드가 숨어 있으므로) |
| 켜짐 | 표시 | 부팅 시 호출 | 정상 |

- **켜기**: `setShowNotes(true)` 저장 성공 → `loadNotes()` → `renderNotesCard()` → 카드 표시.
  저장 실패 → `alert` + 체크박스 원복 (시세 토글과 동일).
- **끄기**: `setShowNotes(false)` 저장 성공 → 카드 숨김. 노트 다이얼로그가 열려 있으면 닫고 스택 비움
  (설정 다이얼로그는 노트 다이얼로그 위에 열릴 수 없으니 실제로는 드묾, 방어용). 데이터는 그대로.
- 부팅 순서: `loadSettings()` 뒤에 `state.settings.showNotes`를 보고 `loadNotes()` 여부 결정. 시세 카드의
  `applyMarketVisibility()` 옆에 `applyNotesVisibility()`를 둔다.
- 기존에 노트를 이미 적어 둔 계정도 배포 후엔 카드가 안 보인다. 설정에서 한 번 켜면 그대로 돌아온다(자동 켜기 안 함 — 사용자 확정).

## 파일

- `settings.js` — `loadSettings`에 `show_notes` 조회·`state.settings.showNotes` 추가, `setShowNotes(on)` (`setShowMarket`과 같은 꼴의 `upsert`). supabase-js `upsert`는 `merge-duplicates`라 보내지 않은 컬럼은 기존 값을 유지하므로 한쪽 토글이 다른 쪽을 되돌리지 않는다 — 두 함수 모두 자기 컬럼만 보낸다.
- `index.html` — 설정 행 1개 + 힌트
- `ui.js` — `applyNotesVisibility()`, `openSettingsDialog`에서 체크 반영
- `app.js` — 부팅 시 조건부 `loadNotes`, `#setNotes` change 핸들러
- `supabase-setup.sql` — 컬럼
- `SESSION_HANDOFF.md` — 설정 항목·SQL 실행 안내 한 줄

## 테스트

순수 함수 추가가 없어 `npm test`에 새 테스트는 없다. `node --check` + 브라우저 확인:

1. SQL 실행 전: 앱이 뜨고 노트 카드 없음, 설정에 체크박스 있음(켜면 저장 실패 alert + 원복)
2. SQL 실행 후: 켬 → 카드와 기존 노트가 그대로 보임 → 새로고침해도 유지 → 다른 기기에서도 켜져 있음
3. 끔 → 카드 사라짐 → 다시 켬 → 노트 그대로
4. 시세 토글을 바꿔도 노트 설정이 안 바뀌고, 그 반대도 마찬가지 (upsert가 다른 컬럼을 건드리지 않는지 확인)

## 범위 밖

- 기존 노트 보유 계정 자동 켜기
- 노트 데이터 삭제(끄기는 숨김일 뿐)
- 가족 공유
