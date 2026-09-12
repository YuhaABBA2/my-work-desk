import { iso, addDays, esc, pri, sortTasks, projectColor, FIXED_PROJECTS } from './lib.js';
import { today, state, settings } from './state.js';

export const $ = (s) => document.querySelector(s);

function visibleTasks() { return settings.hideDone ? state.tasks.filter(t => !t.done) : state.tasks; }

function dueInfo(t) {
  if (t.done) return '';
  const diff = Math.round((new Date(t.date) - today) / 86400000);
  if (diff < 0) return '<span class="due-badge overdue">지남</span>';
  if (diff === 0) return '<span class="due-badge today-due">오늘</span>';
  if (diff <= 3) return `<span class="due-badge soon">${diff}일</span>`;
  return '';
}

function taskHTML(t) {
  return `<div class="task ${t.done ? 'done' : ''}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${esc(t.id)}">
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${t.time ? esc(t.time) + ' · ' : ''}${esc(t.project || '미분류')}${t.note ? ' · ' + esc(t.note) : ''}</div>
    </div>
    ${dueInfo(t)}
    ${t.seriesId ? '<span class="badge repeat">반복</span>' : ''}
    <span class="badge ${t.priority}">${pri(t.priority)}</span>
    <button class="edit" data-action="edit-task" data-id="${esc(t.id)}">수정</button>
    <button class="delete" aria-label="삭제" data-action="remove-task" data-id="${esc(t.id)}">×</button>
  </div>`;
}

export function render() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#toggleDone').textContent = settings.hideDone ? '완료 보이기' : '완료 숨기기';
  $('#darkMode').textContent = settings.dark ? '라이트모드' : '다크모드';

  const td = iso(today);
  const open = state.tasks.filter(t => !t.done);
  const done = state.tasks.filter(t => t.done);
  const shown = visibleTasks();
  $('#openCount').textContent = open.length;
  $('#doneCount').textContent = done.length;
  $('#todayTasks').innerHTML = shown.filter(t => t.date === td).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">오늘 등록된 업무가 없습니다.</div>';
  const until = iso(addDays(today, 7));
  $('#weekTasks').innerHTML = shown.filter(t => !t.done && t.date >= td && t.date <= until).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">이번 주 마감 업무가 없습니다.</div>';

  const dueSoon = open.filter(t => t.date <= iso(addDays(today, 3))).sort(sortTasks);
  $('#dueAlerts').innerHTML = dueSoon.length ? `<div class="alert">마감 임박 ${dueSoon.length}건: ${esc(dueSoon.slice(0, 3).map(t => t.title).join(', '))}</div>` : '';

  renderProjects();
  calendar();
}

export function setProjectStatus(msg) {
  const el = $('#projectStatus');
  if (el) el.textContent = msg || '';
}

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

  const cur = $('#project').value;
  renderProjectOptions(state.editId ? (cur || null) : (cur || undefined));
}

export function calendar() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prev = new Date(y, m, 0).getDate();
  $('#monthLabel').textContent = `${y}년 ${m + 1}월`;
  let html = '';
  const shown = visibleTasks();
  for (let i = 0; i < 42; i++) {
    let n, dt, other = false;
    if (i < first) { n = prev - first + i + 1; dt = new Date(y, m - 1, n); other = true; }
    else if (i >= first + days) { n = i - first - days + 1; dt = new Date(y, m + 1, n); other = true; }
    else { n = i - first + 1; dt = new Date(y, m, n); }
    const dayIso = iso(dt);
    const list = shown.filter(t => t.date === dayIso).slice(0, 2);
    html += `<button class="day ${other ? 'other' : ''} ${dayIso === iso(today) ? 'today' : ''} ${dayIso === state.selectedDate ? 'selected' : ''}" data-date="${dayIso}"><b>${n}</b>${list.map(t => `<span class="dot">${esc(t.title)}</span>`).join('')}</button>`;
  }
  $('#calendar').innerHTML = html;
}

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

export function selectDate(date) {
  state.selectedDate = date;
  $('#date').value = date;
  calendar();
  $('#title').focus();
  $('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 시리즈 일정 수정/삭제 범위. 취소·Esc 는 null.
export function askSeriesScope(mode) {
  const dlg = $('#seriesDialog');
  $('#seriesDialogTitle').textContent = mode === 'delete' ? '반복 일정 삭제' : '반복 일정 수정';
  const form = dlg.querySelector('form');
  return new Promise(resolve => {
    // 선택은 form submit(버튼 value)과 cancel(Esc)로 판정한다. Chrome 152에서는 dialog의
    // close 이벤트가 오지 않는 경우가 있어 close에만 기대면 선택이 무시된다. close는 보조.
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      form.removeEventListener('submit', onSubmit);
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('close', onClose);
      resolve(v === 'one' || v === 'following' ? v : null);
    };
    const onSubmit = (e) => finish(e.submitter?.value);
    const onCancel = () => finish(null);
    const onClose = () => finish(dlg.returnValue);
    form.addEventListener('submit', onSubmit);
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
  });
}
