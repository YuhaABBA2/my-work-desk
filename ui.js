import { iso, addDays, esc, pri, sortTasks, projectColor, FIXED_PROJECTS, dueDate, spansDay, dueState, fmtMd, authorLabel, isFamilyProject, daysBetween } from './lib.js';
import { today, state, settings } from './state.js';

export const $ = (s) => document.querySelector(s);

function visibleTasks() { return settings.hideDone ? state.tasks.filter(t => !t.done) : state.tasks; }

function dueInfo(t) {
  if (t.done) return '';
  const s = dueState(t, iso(today));
  if (s === 'past') return '<span class="due-badge overdue">지남</span>';
  if (s === 'today') return '<span class="due-badge today-due">오늘</span>';
  if (s === 'ongoing') return '<span class="due-badge ongoing">진행중</span>';
  if (s.startsWith('soon:')) return `<span class="due-badge soon">${s.slice(5)}일</span>`;
  return '';
}

function taskMeta(t) {
  const parts = [];
  if (t.endDate && t.endDate !== t.date) parts.push(`${fmtMd(t.date)} ~ ${fmtMd(t.endDate)}`);
  parts.push(t.time ? esc(t.time) : '하루종일');
  parts.push(esc(t.project || '미분류'));
  if (t.note) parts.push(esc(t.note));
  const author = authorLabel(t, state.user?.id, state.family?.members || []);
  if (author) parts.push(esc(author));
  return parts.join(' · ');
}

function remindBadge(t) {
  const on = [t.remind1h && '1시간 전', t.remind1d && '하루 전'].filter(Boolean);
  return on.length ? `<span class="badge remind" title="${on.join(' · ')}">알림</span>` : '';
}

function taskHTML(t) {
  return `<div class="task ${t.done ? 'done' : ''}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${esc(t.id)}" style="--c:${projectColor(t.project)}">
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${taskMeta(t)}</div>
    </div>
    <div class="task-side">
      ${dueInfo(t)}
      ${t.seriesId ? '<span class="badge repeat">반복</span>' : ''}
      ${remindBadge(t)}
      <span class="badge ${t.priority}">${pri(t.priority)}</span>
      <button class="edit" data-action="edit-task" data-id="${esc(t.id)}">수정</button>
      <button class="delete" aria-label="삭제" data-action="remove-task" data-id="${esc(t.id)}">×</button>
    </div>
  </div>`;
}

export function render() {
  document.documentElement.classList.toggle('dark', settings.dark);
  const td = iso(today);
  const until = iso(addDays(today, 7));
  const shown = visibleTasks();
  // "오늘 해야 할 일", "이번 주 마감", 상단 카운트, 마감 임박 배너는 개인 업무만.
  // 가족 공유 업무는 아래 "가족 일정" 카드에서 별도로 본다.
  const personal = state.tasks.filter(t => !t.familyId);
  const personalOpen = personal.filter(t => !t.done);
  const personalDone = personal.filter(t => t.done);
  $('#openCount').textContent = personalOpen.length;
  $('#doneCount').textContent = personalDone.length;
  const personalShown = shown.filter(t => !t.familyId);
  $('#todayTasks').innerHTML = personalShown.filter(t => spansDay(t, td)).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">오늘 등록된 업무가 없습니다.</div>';
  $('#weekTasks').innerHTML = personalShown.filter(t => !t.done && dueDate(t) >= td && dueDate(t) <= until).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">이번주 업무일정이 없습니다.</div>';
  const dueSoon = personalOpen.filter(t => dueDate(t) <= iso(addDays(today, 3))).sort(sortTasks);
  $('#dueAlerts').innerHTML = dueSoon.length ? `<div class="alert">마감 임박 ${dueSoon.length}건: ${esc(dueSoon.slice(0, 3).map(t => t.title).join(', '))}</div>` : '';

  // 가족 일정 카드: family_id 가 있는 업무만 (spansDay 오늘 또는 이번 주 안 마감).
  const famBlock = $('#familyTasksBlock');
  if (famBlock) {
    if (!state.family) { famBlock.hidden = true; $('#familyTasksCount').textContent = ''; }
    else {
      famBlock.hidden = false;
      // "가족 일정 리스트" = 프로젝트가 정확히 "가족 일정"(또는 "가족일정")인 업무만.
      // 다른 프로젝트에 붙인 "가족과 공유" 태그는 inform 목적이라 캘린더에만 표시 (여기 안 옴).
      const famShown = shown.filter(t => isFamilyProject(t.project));
      const famList = famShown.filter(t => spansDay(t, td) || (!t.done && dueDate(t) >= td && dueDate(t) <= until)).sort(sortTasks);
      $('#familyTasks').innerHTML = famList.map(taskHTML).join('') || '<div class="empty">"가족 일정" 프로젝트로 새 업무를 만들면 여기 나타납니다.</div>';
      const famOpen = state.tasks.filter(t => isFamilyProject(t.project) && !t.done).length;
      $('#familyTasksCount').textContent = famOpen ? `미완료 ${famOpen}` : '';
    }
  }

  renderProjects();
  calendar();
}

export function setProjectStatus(msg) {
  const el = $('#projectStatus');
  if (el) el.textContent = msg || '';
}

export function setFamilyStatus(msg) {
  const el = $('#familyStatus');
  if (el) el.textContent = msg || '';
}

function memberAvatar(m) {
  const initial = esc((m.name || '?').trim()[0] || '?').toUpperCase();
  // 내가 나인 경우 Google 프로필 사진을 우선. 다른 구성원은 이름 첫 글자.
  if (m.userId === state.user?.id) {
    const pic = state.user.user_metadata?.avatar_url || state.user.user_metadata?.picture;
    if (pic) return `<img class="avatar avatar-sm" src="${esc(pic)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar avatar-sm',textContent:'${initial}'}))">`;
  }
  return `<span class="avatar avatar-sm">${initial}</span>`;
}

export function renderFamily() {
  const box = $('#familyBody');
  const f = state.family;
  if (!f) {
    box.innerHTML = `<p class="hint">가족을 만들거나 초대 코드를 입력하면 "가족 일정" 업무를 함께 볼 수 있습니다.</p>
      <div class="family-actions"><button id="createFamily" class="primary">가족 만들기</button></div>
      <div class="project-add"><input id="joinCode" maxlength="6" placeholder="초대 코드 6자리" autocapitalize="characters" autocomplete="off"><button id="joinFamily" class="tool">참여</button></div>`;
    return;
  }
  box.innerHTML = `<ul class="members">${f.members.map(m =>
    `<li>${memberAvatar(m)}<span class="m-name">${esc(m.name)}</span>${m.userId === f.ownerId ? ' <span class="badge repeat">가장</span>' : ''}${m.userId === state.user.id ? ' <span class="hint">(나)</span>' : ''}</li>`
  ).join('')}</ul>
    <p class="hint">이름 변경·초대 코드·가족 나가기는 프로필 → 설정에서.</p>`;
}

// 시세·투자 패널은 계정 설정으로, 토글 버튼은 관리자(또는 가족 없음)에게만.
export function applyMarketVisibility() {
  // 구성원(관리자 아님)에게는 설정과 무관하게 패널·토글 모두 숨긴다.
  const canSee = !state.family || state.family.isAdmin;
  const on = canSee && !!state.settings.showMarket;
  $('.market-card').hidden = !on;
  $('.investment-card').hidden = !on;
  const btn = $('#toggleMarket');
  btn.hidden = !canSee;
  btn.textContent = on ? '시세·투자 숨기기' : '시세·투자 보기';
}

export function renderProjects() {
  const favorites = state.projects;
  const dot = (p) => `<i class="dot-color" style="background:${projectColor(p)}"></i>`;
  $('#projectChips').innerHTML = favorites.map(p => {
    const fixed = FIXED_PROJECTS.includes(p);
    return `<span class="chip ${fixed ? 'fixed' : ''}">${dot(p)}${esc(p)}${fixed ? '' : ` <button data-action="delete-project" data-project="${esc(p)}">×</button>`}</span>`;
  }).join('');

  // 이번 달 마감(dueDate)이 이 달인 업무만 카운트 — 시간이 지나도 카드가 무의미해지지 않도록.
  const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `${y}-${m}`;
  const monthTasks = state.tasks.filter(t => dueDate(t).startsWith(monthPrefix));
  const groups = {};
  monthTasks.forEach(t => { const p = t.project || '미분류'; (groups[p] ??= []).push(t); });
  $('#projectsView').innerHTML = Object.entries(groups).map(([p, items]) => {
    const total = items.length;
    const done = items.filter(t => t.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const color = projectColor(p === '미분류' ? null : p);
    return `<button class="project project-btn" data-project="${esc(p)}"><div class="project-line"><span>${dot(p === '미분류' ? null : p)}${esc(p)}</span><span class="hint">${done}/${total} · ${pct}%</span></div><div class="bar"><i style="width:${pct}%;background:${color}"></i></div></button>`;
  }).join('') || '<div class="empty">이번 달 마감인 업무가 없습니다.</div>';

  const cur = $('#project').value;
  renderProjectOptions(state.editId ? (cur || null) : (state.projects.includes(cur) ? cur : undefined));
}

export function calendar() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const prev = new Date(y, m, 0).getDate();
  $('#monthLabel').textContent = `${y}년 ${m + 1}월`;
  const shown = visibleTasks();
  const todayIso = iso(today);

  // 42셀 만들어 주별로 자른다.
  const cells = [];
  for (let i = 0; i < 42; i++) {
    let n, dt, other = false;
    if (i < first) { n = prev - first + i + 1; dt = new Date(y, m - 1, n); other = true; }
    else if (i >= first + days) { n = i - first - days + 1; dt = new Date(y, m + 1, n); other = true; }
    else { n = i - first + 1; dt = new Date(y, m, n); }
    cells.push({ n, iso: iso(dt), other });
  }
  const weeks = [];
  for (let i = 0; i < 6; i++) weeks.push(cells.slice(i * 7, i * 7 + 7));

  // 긴 기간이 위 트랙에 배치되도록 정렬.
  const sorted = [...shown].sort((a, b) => {
    const spanA = daysBetween(a.date, dueDate(a));
    const spanB = daysBetween(b.date, dueDate(b));
    if (spanB !== spanA) return spanB - spanA;
    return sortTasks(a, b);
  });

  const MAX_TRACKS = 3;  // 한 셀에 세그먼트 최대 3개 표시, 이후는 "+N"

  const weekHtml = weeks.map(week => {
    const wkStart = week[0].iso, wkEnd = week[6].iso;
    const segs = [];
    for (const t of sorted) {
      if (dueDate(t) < wkStart) continue;
      if (t.date > wkEnd) continue;
      const startCol = Math.max(0, daysBetween(wkStart, t.date));
      const endCol = Math.min(6, daysBetween(wkStart, dueDate(t)));
      segs.push({ task: t, startCol, endCol });
    }
    // 트랙 배정 (겹치지 않는 가장 낮은 번호)
    const tracks = [];
    for (const seg of segs) {
      let tr = 0;
      while (tr < tracks.length && tracks[tr].some(o => !(seg.endCol < o.startCol || seg.startCol > o.endCol))) tr++;
      if (!tracks[tr]) tracks[tr] = [];
      tracks[tr].push(seg);
      seg.track = tr;
    }
    // 초과 트랙은 셀 하단 "+N" 표시
    const overflow = new Array(7).fill(0);
    for (const seg of segs) {
      if (seg.track >= MAX_TRACKS) {
        for (let c = seg.startCol; c <= seg.endCol; c++) overflow[c]++;
      }
    }

    const cellsHtml = week.map((c, ci) => `<button class="wk-cell${c.other ? ' other' : ''}${c.iso === todayIso ? ' today' : ''}${c.iso === state.selectedDate ? ' selected' : ''}" data-date="${c.iso}"><span class="wk-num">${c.n}</span>${overflow[ci] > 0 ? `<span class="wk-more">+${overflow[ci]}</span>` : ''}</button>`).join('');

    const segsHtml = segs.filter(s => s.track < MAX_TRACKS).map(s => {
      const col = projectColor(s.task.project);
      const leftPct = (s.startCol / 7) * 100;
      const widthPct = ((s.endCol - s.startCol + 1) / 7) * 100;
      const top = 22 + s.track * 22;
      return `<span class="wk-seg" style="left:${leftPct.toFixed(3)}%;width:calc(${widthPct.toFixed(3)}% - 4px);top:${top}px;background:${col}22;color:${col};border-left:3px solid ${col}" title="${esc(s.task.title)}">${esc(s.task.title)}</span>`;
    }).join('');

    return `<div class="wk-row"><div class="wk-cells">${cellsHtml}</div><div class="wk-segs">${segsHtml}</div></div>`;
  }).join('');

  $('#calendar').innerHTML = weekHtml;
}

export function resetForm() {
  state.editId = null;
  $('#formTitle').textContent = '업무 · 일정 추가';
  $('#submitTask').textContent = '추가하기';
  $('#repeat').disabled = false;
  $('#repeatCount').disabled = false;
  $('#addForm').reset();
  $('#date').value = state.selectedDate || iso(today);
  $('#endDate').value = '';
  $('#repeatCount').value = 1;
  setAllDay(false);
  renderProjectOptions(undefined);
  setShareFamily(false, false);
  syncShareFamilyForProject();
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

// 가족과 공유 체크박스: 가족 프로젝트면 켜서 잠그고, 가족이 없으면 아예 숨긴다.
export function setShareFamily(on, locked) {
  const row = $('#shareFamilyRow');
  const cb = $('#shareFamily');
  row.hidden = !state.family;
  cb.checked = !!on;
  cb.disabled = !!locked;
  row.classList.toggle('locked', !!locked);
}

// 프로젝트 값에 맞춰 공유 체크박스 상태 갱신. 가족 프로젝트면 무조건 켜고 잠근다.
export function syncShareFamilyForProject() {
  const p = $('#project').value || null;
  if (isFamilyProject(p)) setShareFamily(true, true);
  else setShareFamily($('#shareFamily').checked, false);
}

export function fillEditForm(t) {
  $('#taskDialog').showModal();
  state.editId = t.id;
  $('#formTitle').textContent = '업무 · 일정 수정';
  $('#submitTask').textContent = '수정 저장';
  $('#title').value = t.title;
  $('#date').value = t.date;
  $('#endDate').value = t.endDate || '';
  $('#priority').value = t.priority;
  renderProjectOptions(t.project || null);
  setAllDay(!t.time);
  $('#time').value = t.time || '';
  $('#remind1h').checked = !!t.remind1h && !!t.time;
  $('#remind1d').checked = !!t.remind1d;
  setShareFamily(!!t.familyId, isFamilyProject(t.project));
  $('#note').value = t.note || '';
  $('#repeat').value = 'none';
  $('#repeat').disabled = true;
  $('#repeatCount').disabled = true;
}

// 업무 폼 다이얼로그. mode='add' 는 폼 초기화, 'edit' 는 fillEditForm 이 먼저 채웠다고 가정.
// 헤더의 프로필 버튼 (아바타 + 이름). 클릭하면 설정 다이얼로그.
export function renderProfile() {
  const u = state.user;
  const md = u?.user_metadata || {};
  const pic = md.avatar_url || md.picture || '';
  const name = md.full_name || md.name || (u?.email?.split('@')[0]) || '나';
  const initial = (name.trim()[0] || '?').toUpperCase();
  const avatar = pic
    ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(initial)}'}))">`
    : esc(initial);
  const setEl = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  setEl('#profileAvatar', avatar);
  setEl('#settingsAvatar', avatar);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setText('#profileName', name);
  setText('#settingsName', name);
  setText('#settingsEmail', u?.email || '');
}

export function openSettingsDialog() {
  // Refresh from live state each open
  $('#setHideDone').checked = !!settings.hideDone;
  $('#setDark').checked = !!settings.dark;
  $('#setMarket').checked = !!state.settings.showMarket;
  const canSeeMarket = !state.family || state.family.isAdmin;
  $('#setMarketRow').hidden = !canSeeMarket;
  // 가족 섹션: 가족이 있으면 노출. 이름 항상, 초대는 가장만, 나가기는 구성원만.
  const famSection = $('#familySection');
  if (famSection) {
    famSection.hidden = !state.family;
    if (state.family) {
      const me = state.family.members.find(m => m.userId === state.user?.id);
      $('#settingsMyName').value = me?.name || '';
      $('#familyInviteBlock').hidden = !state.family.isAdmin;
      if (state.family.isAdmin) $('#settingsInviteCode').textContent = state.family.code;
      $('#settingsLeaveFamily').hidden = state.family.isAdmin;
    }
  }
  $('#settingsDialog').showModal();
}
export function closeSettingsDialog() {
  const d = $('#settingsDialog');
  if (d.open) d.close();
}



// 공용 행 렌더러 — 날짜/프로젝트 상세 다이얼로그에서 재사용.
function renderDayTaskRow(t, showDate = false) {
  const members = state.family?.members || [];
  const memberName = members.find(m => m.userId === t.userId)?.name;
  const authorName = (t.userId === state.user?.id)
    ? (state.user.user_metadata?.full_name || state.user.user_metadata?.name || '나')
    : (memberName || '가족');
  const when = showDate
    ? (t.time ? `${fmtMd(t.date)} ${esc(t.time)}` : `${fmtMd(t.date)} 종일`)
    : (t.time ? esc(t.time) : '종일');
  const c = projectColor(t.project);
  return `<button class="day-task${t.done ? ' done' : ''}" data-task-id="${esc(t.id)}">
    <span class="dt-when">${when}</span>
    <span class="dt-bar" style="background:${c}"></span>
    <span class="dt-title">${esc(t.title)}</span>
    ${userAvatarFor(t.userId, authorName)}
  </button>`;
}

// 프로젝트 상세 다이얼로그
export function openProjectDialog(name) {
  const norm = name === '미분류' ? null : name;
  const list = state.tasks.filter(t => (t.project || '미분류') === name).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = dueDate(a), bd = dueDate(b);
    return a.done ? bd.localeCompare(ad) : ad.localeCompare(bd);
  });
  const done = list.filter(t => t.done).length;
  const c = projectColor(norm);
  $('#projectDialogName').innerHTML = `<i class="dot-color" style="background:${c}"></i>${esc(name)}`;
  $('#projectDialogSub').textContent = list.length ? `${done}/${list.length} 완료` : '';
  $('#projectDialogList').innerHTML = list.length
    ? list.map(t => renderDayTaskRow(t, true)).join('')
    : '<div class="empty">업무가 없습니다.</div>';
  $('#projectDialog').showModal();
}

export function closeProjectDialog() {
  const d = $('#projectDialog');
  if (d.open) d.close();
}

function userAvatarFor(userId, name) {
  const initial = esc((name || '?').trim()[0] || '?').toUpperCase();
  if (userId === state.user?.id) {
    const pic = state.user.user_metadata?.avatar_url || state.user.user_metadata?.picture;
    if (pic) return `<img class="avatar avatar-sm" src="${esc(pic)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar avatar-sm',textContent:'${initial}'}))">`;
  }
  return `<span class="avatar avatar-sm">${initial}</span>`;
}

export function openDayDialog(dateIso) {
  const d = parseIsoLocal(dateIso);
  const weekday = d.toLocaleDateString('ko-KR', { weekday: 'long' });
  $('#dayDialogDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday}`;
  let lunar = '';
  try {
    const parts = new Intl.DateTimeFormat('ko-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(d);
    const M = parts.find(p => p.type === 'month')?.value || '';
    const D = parts.find(p => p.type === 'day')?.value || '';
    if (M && D) lunar = `음력 ${M}.${D}`;
  } catch (_) {}
  $('#dayDialogSub').textContent = lunar;

  const list = visibleTasks().filter(t => spansDay(t, dateIso)).sort((a, b) => {
    const at = a.time || '99:99', bt = b.time || '99:99';
    if (at !== bt) return at.localeCompare(bt);
    return sortTasks(a, b);
  });
  const items = list.map(t => renderDayTaskRow(t, false)).join('');
  $('#dayDialogList').innerHTML = items || '<div class="empty">이 날엔 등록된 업무가 없습니다.</div>';
  $('#dayDialog').showModal();
}

export function closeDayDialog() {
  const d = $('#dayDialog');
  if (d.open) d.close();
}

function parseIsoLocal(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function openTaskDialog(mode = 'add') {
  if (mode === 'add') resetForm();
  $('#taskDialog').showModal();
  setTimeout(() => $('#title').focus(), 0);
}

export function closeTaskDialog() {
  const d = $('#taskDialog');
  if (d.open) d.close();
  resetForm();
}

export function selectDate(date) {
  state.selectedDate = date;
  calendar();
  openDayDialog(date);
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
