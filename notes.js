import { sb } from './supabase.js';
import { state } from './state.js';
import { normTitle, renameNoteLinks, isValidNoteTitle, noteBacklinks, fileExt } from './lib.js';

export const NOTE_BUCKET = 'note-files';
export const NOTE_FILE_MAX = 10;              // 노트당 첨부 수
export const NOTE_FILE_BYTES = 10 * 1024 * 1024; // 파일당 10MB (버킷 제한과 같음)

// 노트 + 첨부 메타(work_note_files)를 한 번에. 첨부는 n.files = [{id, path, name, mime, size}].
export async function loadNotes() {
  const { data, error } = await sb.from('work_notes')
    .select('id,title,body,kind,updated_at,work_note_files(id,path,name,mime,size,created_at)')
    .order('updated_at', { ascending: false });
  if (error) { state.notes = []; state.notesReady = false; return error; }
  state.notes = data.map(n => {
    const { work_note_files, ...rest } = n;
    const files = (work_note_files || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return { ...rest, kind: rest.kind || 'idea', files };
  });
  state.notesReady = true;
  return null;
}

export function findNoteByTitle(title) {
  const k = normTitle(title);
  return state.notes.find(n => normTitle(n.title) === k);
}

// 저장. 제목이 바뀌면 그 제목을 가리키던 다른 노트의 [[옛제목]]도 함께 바꾼다. 성공하면 저장된 노트 id 를 돌려준다.
export async function saveNote({ id, title, body, kind }) {
  if (!state.notesReady) return new Error('노트를 불러오지 못해 저장할 수 없습니다.');
  title = String(title || '').trim();
  body = String(body || '');
  kind = ['idea', 'memo', 'meeting'].includes(kind) ? kind : 'idea';
  if (!isValidNoteTitle(title)) return new Error('제목은 1~100자이고 [[ ]] 를 포함할 수 없습니다.');
  const dup = findNoteByTitle(title);
  if (dup && dup.id !== id) return new Error('같은 제목의 노트가 있습니다.');
  const now = new Date().toISOString();
  if (!id) {
    const { data, error } = await sb.from('work_notes')
      .insert({ user_id: state.user.id, title, body, kind, updated_at: now }).select('id').single();
    if (error) return error.code === '23505' ? new Error('같은 제목의 노트가 있습니다.') : error;
    const loadErr = await loadNotes();
    return loadErr || { id: data.id };
  }
  const prev = state.notes.find(n => n.id === id);
  const renamed = prev && normTitle(prev.title) !== normTitle(title);
  if (renamed) body = renameNoteLinks(body, prev.title, title);
  // 자기 제목을 먼저 올린다. 가장 흔한 실패(제목 충돌 23505)가 아무것도 안 건드린 상태에서 멈추고,
  // 뒤의 백링크 갱신이 실패해도 남는 건 '끊긴 링크'뿐이다(엉뚱한 노트에 붙지 않는다). 상태를 새로 받으므로
  // 같은 저장을 다시 눌러도 남은 백링크는 안 고쳐진다 — 제목을 옛 것으로 되돌렸다 다시 바꾸면 복구된다.
  // (반대 순서였을 땐 백링크가 먼저 새 제목을 가리킨 채 실패해 엉뚱한 노트에 붙을 수 있었다 — 2026-09-14 리뷰)
  const { error } = await sb.from('work_notes').update({ title, body, kind, updated_at: now }).eq('id', id);
  if (error) return error.code === '23505' ? new Error('같은 제목의 노트가 있습니다.') : error;
  if (renamed) {
    for (const n of noteBacklinks(prev.title, state.notes)) {
      const { error: linkErr } = await sb.from('work_notes')
        .update({ body: renameNoteLinks(n.body, prev.title, title), updated_at: now }).eq('id', n.id);
      if (linkErr) { await loadNotes(); return linkErr; }
    }
  }
  const loadErr = await loadNotes();
  return loadErr || { id };
}

export async function deleteNote(id) {
  if (!state.notesReady) return new Error('노트를 불러오지 못해 삭제할 수 없습니다.');
  // 스토리지 객체를 먼저 지운다. 실패해도 노트 삭제는 진행 (고아 객체는 남을 수 있음 — 허용).
  const n = state.notes.find(x => x.id === id);
  const paths = (n?.files || []).map(f => f.path);
  if (paths.length) await sb.storage.from(NOTE_BUCKET).remove(paths);
  const { error } = await sb.from('work_notes').delete().eq('id', id);
  if (error) return error;
  return loadNotes();
}

// ---- 첨부 ----
// 객체 키는 ASCII 만: Storage 가 한글·공백·괄호 키를 "Invalid key"로 거부한다. 원래 이름은 행(name)에 남긴다.
function newPath(noteId, file) {
  const rnd = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ext = fileExt(file.name);
  return `${state.user.id}/${noteId}/${rnd}${ext ? '.' + ext : ''}`;
}

// 파일 하나 업로드 + 행 기록. 실패하면 Error 를 돌려준다(throw 안 함).
export async function uploadNoteFile(noteId, file) {
  if (file.size > NOTE_FILE_BYTES) return new Error(`${file.name}: 10MB를 넘습니다.`);
  const path = newPath(noteId, file);
  const { error: upErr } = await sb.storage.from(NOTE_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) return new Error(`${file.name}: ${upErr.message || '업로드 실패'}`);
  const { error: rowErr } = await sb.from('work_note_files')
    .insert({ note_id: noteId, user_id: state.user.id, path, name: file.name, mime: file.type || '', size: file.size });
  if (rowErr) { await sb.storage.from(NOTE_BUCKET).remove([path]); return new Error(`${file.name}: ${rowErr.message || '기록 실패'}`); }
  return null;
}

export async function deleteNoteFile(f) {
  await sb.storage.from(NOTE_BUCKET).remove([f.path]); // 실패해도 행은 지운다
  const { error } = await sb.from('work_note_files').delete().eq('id', f.id);
  return error || null;
}

// 서명 URL (1시간). 노트를 열 때 한 번 받아 50분 캐시.
const urlCache = new Map(); // path → { url, at }
export async function signedUrls(files) {
  const need = files.filter(f => { const c = urlCache.get(f.path); return !c || Date.now() - c.at > 50 * 60_000; }).map(f => f.path);
  if (need.length) {
    const { data } = await sb.storage.from(NOTE_BUCKET).createSignedUrls(need, 3600);
    for (const d of data || []) if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, at: Date.now() });
  }
  return Object.fromEntries(files.map(f => [f.path, urlCache.get(f.path)?.url || null]));
}
