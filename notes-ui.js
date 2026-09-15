import { $ } from './ui.js';
import { state } from './state.js';
import { iso, esc, searchNotes, noteLinks, noteBacklinks, renderNoteBody, normTitle, fmtMdDow, mentionQuery, applyMention,
  NOTE_KINDS, kindLabel, noteTemplate, filterNotesByKind, isImageMime, fmtBytes } from './lib.js';
import { deleteNote, findNoteByTitle, saveNote, uploadNoteFile, deleteNoteFile, signedUrls, NOTE_FILE_MAX, NOTE_FILE_BYTES } from './notes.js';

export function setNoteStatus(msg) { const el = $('#noteStatus'); if (el) el.textContent = msg || ''; }

function titleSet() { return new Set(state.notes.map(n => normTitle(n.title))); }

// ---- 카드 (탭 + 목록) ----
function currentTab() { return state.noteTab || 'all'; }

export function setNoteTab(tab) {
  state.noteTab = tab;
  try { localStorage.setItem('noteTab', tab); } catch { /* 사생활 모드 등 */ }
  renderNotesCard();
}

function renderTabs() {
  const box = $('#noteTabs');
  if (!box) return;
  const tab = currentTab();
  const tabs = [{ key: 'all', label: '전체' }, ...NOTE_KINDS];
  box.innerHTML = tabs.map(t => `<button type="button" class="cal-tab${t.key === tab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');
}

function noteItemHTML(n) {
  const first = String(n.body || '').split('\n').find(l => l.trim()) || '';
  const when = n.updated_at ? fmtMdDow(iso(new Date(n.updated_at))) : ''; // UTC 문자열을 그대로 자르면 KST 새벽 수정분이 전날로 찍힌다
  const files = n.files?.length ? ` · 📎${n.files.length}` : '';
  return `<button type="button" class="note-item" data-action="open-note-id" data-id="${esc(n.id)}"><b><span class="kind-badge ${esc(n.kind || 'idea')}">${kindLabel(n.kind)}</span>${esc(n.title)}</b><span>${esc(first) || '(본문 없음)'}${files}${when ? ` · ${when}` : ''}</span></button>`;
}

// 대시보드 카드: 탭으로 거른 뒤, 검색어 있으면 결과 전부, 없으면 최근 수정 5장.
export function renderNotesCard() {
  renderTabs();
  if (!state.notesReady) { $('#noteList').innerHTML = ''; return; }
  const q = $('#noteSearch')?.value || '';
  const list = searchNotes(filterNotesByKind(state.notes, currentTab()), q);
  const shown = q.trim() ? list : list.slice(0, 5);
  $('#noteList').innerHTML = shown.map(noteItemHTML).join('')
    || `<div class="empty">${q.trim() ? '검색 결과가 없습니다.' : '아직 노트가 없습니다. ＋ 새 노트로 첫 생각을 적어 보세요.'}</div>`;
}

// ---- 읽기 ----
function chipHTML(n) {
  return `<button type="button" class="note-link" data-action="open-note-id" data-id="${esc(n.id)}">${esc(n.title)}</button>`;
}

async function renderAttachments(n) {
  const box = $('#noteFiles');
  const files = n.files || [];
  if (!files.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<p class="section-head">첨부</p><div class="hint">불러오는 중…</div>';
  const urls = await signedUrls(files);
  if (currentNoteId() !== n.id) return; // 그 사이 다른 노트로 이동
  const imgs = files.filter(f => isImageMime(f.mime));
  const docs = files.filter(f => !isImageMime(f.mime));
  box.innerHTML = '<p class="section-head">첨부</p>'
    + (imgs.length ? `<div class="file-grid">${imgs.map(f => urls[f.path]
        ? `<button type="button" class="file-thumb" data-action="preview-image" data-url="${esc(urls[f.path])}" data-name="${esc(f.name)}"><img src="${esc(urls[f.path])}" alt="${esc(f.name)}" loading="lazy"></button>`
        : `<div class="file-thumb broken">${esc(f.name)}</div>`).join('')}</div>` : '')
    + (docs.length ? `<div class="file-list">${docs.map(f => urls[f.path]
        ? `<a class="file-chip" href="${esc(urls[f.path])}" target="_blank" rel="noreferrer">📄 ${esc(f.name)} <span class="hint">${fmtBytes(f.size)}</span></a>`
        : `<span class="file-chip broken">📄 ${esc(f.name)}</span>`).join('')}</div>` : '');
}

function renderRead(n) {
  const titles = titleSet();
  $('#noteReadKind').textContent = kindLabel(n.kind);
  $('#noteReadKind').className = `kind-badge ${n.kind || 'idea'}`;
  $('#noteReadTitle').textContent = n.title;
  $('#noteReadBody').innerHTML = renderNoteBody(n.body, titles) || '<span class="hint">본문이 없습니다.</span>';
  renderAttachments(n);
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
  if (push && currentNoteId() === id) push = false;
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
  const extra = n.files?.length ? ` 첨부 ${n.files.length}개도 함께 지워집니다.` : '';
  if (!confirm(`"${n.title}" 노트를 삭제할까요? 다른 노트에 남은 링크는 끊긴 링크로 표시됩니다.${extra}`)) return;
  const err = await deleteNote(id);
  if (err) return alert(err.message || '삭제하지 못했습니다.');
  closeNoteDialog();
  renderNotesCard();
}

// ---- 이미지 전체 미리보기 ----
export function openImagePreview(url, name) {
  const d = $('#imgDialog');
  const img = $('#imgPreview');
  img.src = url; img.alt = name || '';
  $('#imgName').textContent = name || '';
  if (!d.open) d.showModal();
}
export function closeImagePreview() { const d = $('#imgDialog'); if (d.open) d.close(); $('#imgPreview').src = ''; }

// ---- 편집 모드 ----
let mention = null; // { start, query, items: [{title, create?}], active }
let staged = [];     // 새로 고른 File 들 (저장 시 업로드)
let removed = new Set(); // 삭제 예약한 기존 첨부 id

function editKind() { return $('#noteEdit input[name=kind]:checked')?.value || 'idea'; }

function renderEditFiles() {
  const id = $('#noteId').value;
  const n = id ? state.notes.find(x => x.id === id) : null;
  const existing = (n?.files || []).filter(f => !removed.has(f.id));
  const total = existing.length + staged.length;
  const items = [
    ...existing.map(f => `<div class="edit-file"><span class="edit-file-name">${isImageMime(f.mime) ? '🖼' : '📄'} ${esc(f.name)} <span class="hint">${fmtBytes(f.size)}</span></span><button type="button" class="text-button" data-remove-existing="${esc(f.id)}" aria-label="첨부 삭제">✕</button></div>`),
    ...staged.map((f, i) => `<div class="edit-file new">${isImageMime(f.type) ? `<img class="edit-thumb" src="${URL.createObjectURL(f)}" alt="">` : '<span>📄</span>'}<span class="edit-file-name">${esc(f.name)} <span class="hint">${fmtBytes(f.size)} · 저장 시 업로드</span></span><button type="button" class="text-button" data-remove-staged="${i}" aria-label="첨부 취소">✕</button></div>`),
  ];
  $('#noteEditFiles').innerHTML = items.join('');
  $('#noteFileCount').textContent = `${total}/${NOTE_FILE_MAX}`;
  $('#noteFileAdd').disabled = total >= NOTE_FILE_MAX;
}

export function onNoteFilesPicked(e) {
  const id = $('#noteId').value;
  const n = id ? state.notes.find(x => x.id === id) : null;
  let total = (n?.files || []).filter(f => !removed.has(f.id)).length + staged.length;
  const rejected = [];
  for (const f of e.target.files || []) {
    if (total >= NOTE_FILE_MAX) { rejected.push(`${f.name}: 노트당 ${NOTE_FILE_MAX}개까지`); continue; }
    if (f.size > NOTE_FILE_BYTES) { rejected.push(`${f.name}: 10MB 초과`); continue; }
    staged.push(f); total++;
  }
  e.target.value = '';
  renderEditFiles();
  if (rejected.length) alert(rejected.join('\n'));
}

export function onEditFilesClick(e) {
  const rs = e.target.closest('[data-remove-staged]');
  if (rs) { staged.splice(Number(rs.dataset.removeStaged), 1); renderEditFiles(); return; }
  const re = e.target.closest('[data-remove-existing]');
  if (re) { removed.add(re.dataset.removeExisting); renderEditFiles(); }
}

export function openNoteEditor(id, kind) {
  if (!state.notesReady) { alert('노트를 불러오지 못했습니다. Supabase에 work_notes SQL을 적용했는지 확인해 주세요.'); return; }
  const n = id ? state.notes.find(x => x.id === id) : null;
  const k = n ? (n.kind || 'idea') : (kind && kind !== 'all' ? kind : 'idea');
  $('#noteId').value = n?.id || '';
  $('#noteTitle').value = n?.title || '';
  $('#noteBody').value = n ? (n.body || '') : noteTemplate(k, iso(new Date()));
  for (const r of $('#noteEdit').querySelectorAll('input[name=kind]')) r.checked = r.value === k;
  staged = []; removed = new Set();
  renderEditFiles();
  hideMention();
  $('#noteRead').hidden = true;
  $('#noteEdit').hidden = false;
  $('#noteBack').hidden = true;
  const d = $('#noteDialog');
  if (!d.open) d.showModal();
  if (!n) state.noteStack = [];
  $('#noteTitle').focus();
}

// 종류 칩을 바꿀 때: 새 노트이고 본문이 비어 있거나 다른 종류의 틀 그대로면 틀을 갈아 끼운다.
export function onKindChange() {
  if ($('#noteId').value) return;
  const ta = $('#noteBody');
  const isTemplate = NOTE_KINDS.some(k => ta.value === noteTemplate(k.key, iso(new Date())));
  if (!ta.value.trim() || isTemplate) ta.value = noteTemplate(editKind(), iso(new Date()));
}

export function cancelNoteEdit() {
  staged = []; removed = new Set();
  const id = currentNoteId();
  if (id) openNote(id, false); else closeNoteDialog();
}

export async function onNoteFormSubmit(e) {
  e.preventDefault();
  const id = $('#noteId').value || null;
  const title = $('#noteTitle').value;
  const body = $('#noteBody').value;
  const kind = editKind();
  const btn = $('#noteSave');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    const r = await saveNote({ id, title, body, kind });
    if (!r || !r.id) return alert(r?.message || '저장하지 못했습니다.'); // Error 또는 PostgrestError(plain object)
    const noteId = r.id;
    const before = state.notes.find(x => x.id === noteId);
    const failures = [];
    // 삭제 예약 → 업로드. 개별 실패는 모아서 알린다.
    for (const f of (before?.files || []).filter(f => removed.has(f.id))) {
      const err = await deleteNoteFile(f);
      if (err) failures.push(`${f.name}: 삭제 실패`);
    }
    for (let i = 0; i < staged.length; i++) {
      btn.textContent = `저장 중… (${i + 1}/${staged.length})`;
      const err = await uploadNoteFile(noteId, staged[i]);
      if (err) failures.push(err.message);
    }
    staged = []; removed = new Set();
    const { loadNotes } = await import('./notes.js');
    await loadNotes();
    renderNotesCard();
    openNote(noteId, false);
    if (failures.length) alert(`첨부 ${failures.length}개 처리 실패:\n${failures.join('\n')}`);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
}

// ---- @ 멘션 팝업 ----
export function hideMention() { mention = null; const el = $('#noteMention'); el.hidden = true; el.innerHTML = ''; }

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

let picking = false;

async function pickMention(i) {
  if (picking) return;
  const it = mention?.items[i];
  if (!it) return;
  const { start } = mention;
  const ta = $('#noteBody');
  const end = ta.selectionStart;
  picking = true;
  try {
    if (it.create) {
      const r = await saveNote({ title: it.title, body: '', kind: 'idea' });
      if (r instanceof Error || !r?.id) return alert(r?.message || '노트를 만들지 못했습니다.');
      renderNotesCard();
    }
    const r = applyMention(ta.value, start, end, it.title);
    ta.value = r.text;
    ta.setSelectionRange(r.caret, r.caret);
    hideMention();
    ta.focus();
  } finally {
    picking = false;
  }
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
