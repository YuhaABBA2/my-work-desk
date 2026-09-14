# 아이디어 노트 (제텔카스텐) — 설계

2026-09-14 · 사용자 확정 (질문 5개 → 답: 폰 즉시 기록 1순위 / `@` 검색 링크 / 제목+본문 / 링크 타고 다니는 구조 / 태그 없이 허브 노트)

## 목적

폰에서 떠오른 생각을 우리집 데스크 안에 바로 적고, 카드끼리 링크로 이어 나중에 예상 못 한 연결을 만나는
**나만의** 노트. 옵시디언은 쓰지 않으므로 대체·연동 대상이 아니다.

제텔카스텐 원칙 중 가져오는 것: 한 장 = 생각 하나 · 카드끼리 링크 · 폴더/태그 없음(허브 노트가 목차 역할).

## 범위 밖 (이번에 안 만듦)

- 가족 공유 (본인 전용)
- 태그 `#…`
- 노트 → 업무 전환
- 편집 중 칩 렌더링(contenteditable) — 편집은 textarea에 `[[제목]]` 글자 그대로

## 데이터

```sql
create table if not exists public.work_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists work_notes_user_title on public.work_notes (user_id, lower(title));
-- RLS: 본인 행만 select/insert/update/delete (work_projects와 같은 꼴)
```

- `supabase-setup.sql`에 추가. **사용자가 Supabase 대시보드에서 한 번 실행**해야 한다(앱엔 service 키 없음).
- 링크는 본문 안의 `[[제목]]`이 전부. 링크 표 없음 — 노트 전체를 받아 클라에서 파싱한다.
  - 연결(outgoing) = 내 본문의 `[[제목]]` 목록
  - 백링크 = 다른 노트 본문에 `[[내 제목]]`이 있는 것
  - 제목 비교는 대소문자 무시·앞뒤 공백 무시
- 제목 변경 시 그 제목을 가리키는 모든 본문의 `[[옛제목]]` → `[[새제목]]`으로 함께 갱신(여러 행 update).
- 삭제 시 남은 `[[제목]]`은 끊긴 링크로 렌더(회색, 클릭 불가). 본문은 손대지 않는다.
- 유일성 위반(같은 제목) 저장 시: "같은 제목의 노트가 있습니다" 안내, 저장 안 함.

## 화면

### 대시보드 카드 "아이디어 노트"
- 최근 수정 5장(updated_at desc): 제목 + 본문 첫 줄 + 수정일(요일 포함)
- 검색칸: 제목·본문 부분일치, 입력 즉시 필터, 결과는 카드 안 목록으로 대체
- [+ 새 노트] → 편집 모드로 노트 뷰 열림
- 노트가 0장이면 안내 문구

### 노트 뷰 (전체화면 `<dialog>`, 업무 추가 다이얼로그와 같은 껍데기)
읽기 모드:
```
← 뒤로   아이디어 노트                수정 · 삭제 · 닫기
제목
본문 — [[제목]]은 칩으로, 누르면 그 노트로 이동(스택 push). 끊긴 링크는 회색 글자.
────
→ 연결한 노트   (칩 목록)
← 이 노트를 가리키는 노트   (칩 목록)
```
- 스택: 칩으로 들어간 만큼 쌓이고 ← 뒤로가 pop. 스택 비면 ← 뒤로 숨김. 닫기는 스택 비움.
- 삭제: `confirm` 뒤 삭제, 뷰 닫기.

편집 모드:
- 제목 input + 본문 textarea, [저장]·[취소]
- 본문에서 `@` 입력 → 커서 위 팝업에 제목 검색 목록(타이핑할수록 좁혀짐, 최대 8개, 자기 자신 제외)
  - 항목 선택(터치/Enter) → `@검색어`를 `[[제목]]`으로 치환, 팝업 닫힘
  - 일치 없거나 검색어가 새 제목이면 맨 밑 **"'○○' 새 노트 만들기"** → 빈 본문 노트 생성 후 `[[○○]]` 삽입
  - Esc, 또는 커서가 `@` 앞으로 빠져나가면 팝업 닫힘(`@`와 적던 글자는 그대로 남음)
- 저장: 제목 필수(빈 제목 저장 불가), updated_at 갱신. 제목이 바뀌었으면 백링크 본문 일괄 치환 후 저장.

### 모바일
- 노트 뷰는 폰에서 전체화면. `@` 팝업은 키보드 위에 가리지 않게 textarea 바로 위에 고정.

## 순수 함수 (lib.js, 테스트 대상)

| 함수 | 역할 |
|---|---|
| `noteLinks(body)` | 본문 → `[[…]]` 제목 배열(중복 제거, 순서 유지) |
| `noteBacklinks(title, notes)` | title을 가리키는 노트 배열 |
| `renameNoteLinks(body, oldTitle, newTitle)` | 본문의 `[[old]]` → `[[new]]` (대소문자 무시) |
| `mentionQuery(text, caretPos)` | 커서 앞 `@검색어` 잘라내기 → `{start, query}` 또는 null |
| `applyMention(text, start, caretPos, title)` | `@검색어` 자리를 `[[title]]`로 치환한 텍스트와 새 커서 위치 |
| `searchNotes(notes, q)` | 제목·본문 부분일치(대소문자 무시), updated_at desc |
| `renderNoteBody(body, titleSet)` | 본문 → HTML(칩/끊긴 링크/줄바꿈, esc 적용) |

엣지케이스: 빈 본문 · `[[ ]]` 빈 링크 · 자기 자신 링크 · 같은 노트 두 번 링크 · 제목에 대괄호 포함(허용 안 함: 저장 시 거부) ·
`@`가 이메일처럼 단어 중간에 있을 때(앞 글자가 공백/줄 시작일 때만 트리거).

## 파일

- `notes.js` (새) — 로드/저장/삭제/제목변경 치환, Supabase 접근
- `ui.js` — 카드 렌더·노트 뷰·`@` 팝업 (파일이 이미 767줄이라 노트 뷰는 `notes-ui.js`로 분리)
- `index.html` — 카드 + 노트 다이얼로그 골격
- `styles.css` — 칩·팝업
- `lib.js` + `tests/lib.test.mjs` — 위 순수 함수와 테스트
- `supabase-setup.sql` — 표·RLS 추가

## 완료 기준

1. `npm test` 통과(위 함수 전부)
2. 폰에서: 새 노트 → `@`로 다른 노트 링크 → 저장 → 칩 클릭으로 이동 → 뒤로 → 백링크 확인
3. 제목 변경 후 다른 노트의 링크가 따라 바뀜, 삭제 후 끊긴 링크 회색
