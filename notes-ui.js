import { $ } from './ui.js';
import { state } from './state.js';
import { iso, esc, searchNotes, noteLinks, noteBacklinks, renderNoteBody, normTitle, fmtMdDow, mentionQuery, applyMention } from './lib.js';
import { deleteNote, findNoteByTitle, saveNote } from './notes.js';

export function setNoteStatus(msg) { const el = $('#noteStatus'); if (el) el.textContent = msg || ''; }

function titleSet() { return new Set(state.notes.map(n => normTitle(n.title))); }

function noteItemHTML(n) {
  const first = String(n.body || '').split('\n').find(l => l.trim()) || '';
  const when = n.updated_at ? fmtMdDow(iso(new Date(n.updated_at))) : ''; // UTC 문자열을 그대로 자르면 KST 새벽 수정분이 전날로 찍힌다
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
