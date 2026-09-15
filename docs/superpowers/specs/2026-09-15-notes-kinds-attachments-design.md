# 노트 종류(아이디어·메모·회의록) + 첨부파일 — 설계

2026-09-15 · 사용자 확정 (노트 하나에 '종류' / 본인 전용 / 회의록 틀 = 일시·참석자·아젠다·내용)

## 데이터
```sql
alter table public.work_notes add column if not exists kind text not null default 'idea' check (kind in ('idea','memo','meeting'));

create table if not exists public.work_note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.work_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique,          -- storage 객체 경로 {uid}/{note_id}/{uuid}-{파일명}
  name text not null,                 -- 원래 파일명
  mime text not null default '',
  size integer not null default 0,
  created_at timestamptz not null default now()
);
-- RLS: 본인 행만 select/insert/delete (work_notes 와 같은 꼴)
-- storage: 버킷 note-files (private, 10MB). storage.objects 정책 select/insert/delete:
--   bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text
```
- 노트 삭제 → 파일 행은 cascade. 스토리지 객체는 클라가 삭제 전에 `remove(paths)`로 지운다(실패해도 노트 삭제는 진행 — 고아 객체는 남을 수 있음, 허용).
- 제한: 파일 10MB, 노트당 10개. 종류 제한 없음(이미지·PDF·문서).

## 화면
### 카드 "노트" (구 아이디어 노트)
- 머리 밑에 탭 칩 `전체 · 아이디어 · 메모 · 회의록` (`state.noteTab`, 기본 전체, localStorage 기억).
- 목록 줄: `[종류배지] 제목` / `첫 줄 · 📎n · 수정일`. 검색은 탭과 AND.
- `＋ 새 노트` → 현재 탭 종류로 편집기 열림(전체면 아이디어).

### 편집
- 제목 밑 종류 칩 3개(라디오). 회의록으로 **새로** 만들 때만 본문이 비어 있으면 틀 삽입:
  ```
  일시: 9/15(화)
  참석자:
  아젠다:
  내용:
  ```
- 첨부 영역: `[파일 추가]`(`<input type=file multiple>`) → 선택 즉시 목록(이미지는 `URL.createObjectURL` 썸네일), ✕로 제외. 기존 첨부도 같은 목록에 ✕(삭제 예약).
- **저장 시**: 노트 upsert → 예약 삭제 실행(storage remove + 행 delete) → 새 파일 순서대로 upload + 행 insert. 개별 실패는 모아서 "n개 업로드 실패: 이름…" alert, 성공한 것은 반영. 10개 초과·10MB 초과는 선택 시점에 거부.
- 저장 버튼은 진행 중 "저장 중… (2/5)".

### 읽기
- 본문 아래 "첨부" 섹션: 이미지 썸네일 격자(3열, 폰 2열) + 파일 칩(이름 · 크기).
- 서명 URL(`createSignedUrls(paths, 3600)`)을 열 때 한 번 받아 캐시(노트별, 50분).
- 이미지 탭 → `<dialog id="imgDialog">` 전체화면 미리보기(한 장, 닫기·바깥 탭 닫힘). 파일 칩 탭 → `window.open(signedUrl)`.

### 기타
- 설정 라벨 "아이디어 노트 보기" → "노트 보기", 힌트 "나만 보는 개인 노트(아이디어·메모·회의록)…".
- `@` 링크·백링크·제목 유일성은 종류와 무관하게 전체 노트에 걸침.

## 순수 함수 (lib.js, 테스트)
| 함수 | 역할 |
|---|---|
| `NOTE_KINDS` | `[{key:'idea',label:'아이디어'},{key:'memo',label:'메모'},{key:'meeting',label:'회의록'}]` |
| `kindLabel(kind)` | 라벨, 모르면 '아이디어' |
| `noteTemplate(kind, todayIso)` | 회의록이면 위 틀, 그 외 '' |
| `filterNotesByKind(notes, tab)` | `'all'`이면 전부 |
| `isImageMime(mime)` | `image/` 접두 |
| `fmtBytes(n)` | `0 B`·`12.3 KB`·`4.6 MB` |
| `safeFileName(name)` | 경로 위험 문자 제거, 100자 절단, 비면 'file' |

## 파일
- `supabase-setup.sql`, `lib.js`+`tests/lib.test.mjs`, `notes.js`(kind·files API), `notes-ui.js`(탭·종류칩·첨부·미리보기), `index.html`, `styles.css`, `app.js`(배선), `SESSION_HANDOFF.md`

## 완료 기준
1. `npm test`
2. 프로덕션: 회의록 새로 만들기 → 틀 채워짐 → 이미지 1장 첨부 → 저장 → 읽기에서 썸네일 → 탭하면 전체 미리보기 → 새로고침 후 유지 → 첨부 ✕ 후 저장 → 사라짐 → 노트 삭제
3. 탭 전환·검색 AND, 배지·📎 카운트
