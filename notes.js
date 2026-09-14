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
  if (!state.notesReady) return new Error('노트를 불러오지 못해 저장할 수 없습니다.');
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
  const renamed = prev && normTitle(prev.title) !== normTitle(title);
  if (renamed) body = renameNoteLinks(body, prev.title, title);
  // 자기 제목을 먼저 올린다. 가장 흔한 실패(제목 충돌 23505)가 아무것도 안 건드린 상태에서 멈추고,
  // 뒤의 백링크 갱신이 실패해도 남는 건 '끊긴 링크'뿐이다(엉뚱한 노트에 붙지 않는다). 상태를 새로 받으므로
  // 같은 저장을 다시 눌러도 남은 백링크는 안 고쳐진다 — 제목을 옛 것으로 되돌렸다 다시 바꾸면 복구된다.
  // (반대 순서였을 땐 백링크가 먼저 새 제목을 가리킨 채 실패해 엉뚱한 노트에 붙을 수 있었다 — 2026-09-14 리뷰)
  const { error } = await sb.from('work_notes').update({ title, body, updated_at: now }).eq('id', id);
  if (error) return error.code === '23505' ? new Error('같은 제목의 노트가 있습니다.') : error;
  if (renamed) {
    for (const n of noteBacklinks(prev.title, state.notes)) {
      const { error: linkErr } = await sb.from('work_notes')
        .update({ body: renameNoteLinks(n.body, prev.title, title), updated_at: now }).eq('id', n.id);
      if (linkErr) { await loadNotes(); return linkErr; }
    }
  }
  return loadNotes();
}

export async function deleteNote(id) {
  if (!state.notesReady) return new Error('노트를 불러오지 못해 삭제할 수 없습니다.');
  const { error } = await sb.from('work_notes').delete().eq('id', id);
  if (error) return error;
  return loadNotes();
}
