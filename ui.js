import { iso, addDays, esc, pri, sortTasks, isStaleRepeat, projectColor, FIXED_PROJECTS, dueDate, spansDay, dueState, fmtMd, authorLabel, isFamilyProject, daysBetween, isPersonalTask, holidaySpans, dueBannerText, weekSummaryText, resolveView, projectsSummaryText, splitDue } from './lib.js';
import { REACTION_EMOJIS, summarizeReactions } from './reactions.js';
import { holidayFor, lunarFor } from './holidays.js';
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
  const reacts = t.familyId ? summarizeReactions(t.id) : '';
  const reactBtn = t.familyId
    ? `<button class="react-btn" data-action="react-open" data-id="${esc(t.id)}" aria-label="응원 이모지">😊</button>`
    : '';
  return `<div class="task ${t.done ? 'done' : ''}">
    <input class="check" type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-task" data-id="${esc(t.id)}" style="--c:${projectColor(t.project)}">
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${taskMeta(t)}</div>
      ${reacts ? `<div class="reactions">${reacts}</div>` : ''}
    </div>
    <div class="task-side">
      ${dueInfo(t)}
      ${t.seriesId ? '<span class="badge repeat">반복</span>' : ''}
      ${remindBadge(t)}
      <span class="badge ${t.priority}">${pri(t.priority)}</span>
      ${reactBtn}
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
  // "오늘 해야 할 일", "이번 주 마감", 상단 카운트, 마감 임박 배너는 내 업무만 (isPersonalTask).
  // "가족과 공유"를 켠 내 업무도 여기 남는다 — 공유는 캘린더 표시일 뿐. 가족 일정 프로젝트는 아래 "가족 일정" 카드로.
  const myId = state.user?.id;
  const personal = state.tasks.filter(t => isPersonalTask(t, myId));
  // 반복 시리즈의 지난 회차는 '남은 일'이 아니다 (2026-09-15) — 카운트·마감 임박·저녁 배너에서 뺀다.
  const personalOpen = personal.filter(t => !t.done && !isStaleRepeat(t, td));
  const personalDone = personal.filter(t => t.done);
  $('#openCount').textContent = personalOpen.length;
  $('#doneCount').textContent = personalDone.length;
  const personalShown = shown.filter(t => isPersonalTask(t, myId));
  $('#todayTasks').innerHTML = personalShown.filter(t => spansDay(t, td)).sort(sortTasks).map(taskHTML).join('') || '<div class="empty">오늘 등록된 업무가 없습니다.</div>';
  const weekList = personalShown.filter(t => !t.done && dueDate(t) >= td && dueDate(t) <= until).sort(sortTasks);
  $('#weekTasks').innerHTML = weekList.map(taskHTML).join('') || '<div class="empty">이번주 업무일정이 없습니다.</div>';
  $('#weekSummary').textContent = weekSummaryText(weekList, td); // 접혀 있어도 보이는 한 줄
  const { overdue: pastDue, soon: dueSoon } = splitDue(personalOpen, td);
  const alerts = [];
  if (dueSoon.length) alerts.push(`<div class="alert">${esc(dueBannerText(dueSoon.map(t => t.title)))}</div>`);
  // 지난 일: 마감이 지났는데 미완료. 줄마다 [완료] [오늘로] — 배너에 섞여 쌓이지 않게 여기서 바로 정리한다.
  if (pastDue.length) {
    const rows = pastDue.map(t => `<div class="od-row"><span class="od-title">${esc(t.title)} <span class="od-when">${esc(fmtMd(dueDate(t)))}</span></span>`
      + `<span class="od-actions"><button type="button" class="text-button" data-od="done" data-id="${esc(t.id)}">완료</button>`
      + `<button type="button" class="text-button" data-od="today" data-id="${esc(t.id)}">오늘로</button></span></div>`).join('');
    alerts.push(`<div class="alert overdue-list"><b>지난 일 ${pastDue.length}건</b>${rows}</div>`);
  }
  // 저녁 배너 (22시~06시): 오늘 미완료 개인 업무를 내일로 넘기기.
  const nowHour = new Date().getHours();
  if (nowHour >= 22 || nowHour < 7) {
    const overdue = personalOpen.filter(t => dueDate(t) <= td);
    if (overdue.length) alerts.push(`<div class="alert evening"><span>오늘 못 한 일 ${overdue.length}건이 있습니다.</span> <button id="pushToTomorrow" class="text-button">내일로 넘기기</button></div>`);
  }
  // 일요일 회고 (오늘이 일요일이면)
  if (today.getDay() === 0) {
    const start = iso(addDays(today, -7)), end = iso(addDays(today, -1));
    const doneLast = state.tasks.filter(t => t.done && dueDate(t) >= start && dueDate(t) <= end);
    if (doneLast.length) {
      const groups = {};
      for (const t of doneLast) { const p = t.project || '미분류'; groups[p] = (groups[p] || 0) + 1; }
      const pills = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([p, n]) => `<span class="retro-pill" style="background:${projectColor(p === '미분류' ? null : p)}22;color:${projectColor(p === '미분류' ? null : p)}">${esc(p)} ${n}</span>`).join('');
      alerts.push(`<div class="alert retro"><b>지난주 ${doneLast.length}건 완료</b> · ${pills}</div>`);
    }
  }
  $('#dueAlerts').innerHTML = alerts.join('');

  // 가족 일정은 달력·프로젝트 관리(가족 일정)에서 본다. 따로 보여주던 「이번주 가족일정」 카드는
  // 같은 것을 두 번 보여줘 없앴다(2026-09-25). 가족 만들기·참여는 설정 › 가족으로 옮겼다.

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
  ).join('')}</ul>`;
}

// 시세·투자 패널: 계정 설정 하나로 결정. (가장 전용 가드와 헤더 토글 버튼은 2026-09-14에 제거)
export function applyMarketVisibility() {
  const on = !!state.settings.showMarket;
  $('.market-card').hidden = !on;
  $('.investment-card').hidden = !on;
  applyView();
}

// 화면 탭(일정 / 시세·지표). 시세·지표는 나만 보는 패널이라 일정 화면과 나눈다.
// 시세 패널을 끈 사람에게는 탭이 없고 늘 일정 화면이다. 마지막 탭은 이 기기에만 기억한다.
export function applyView() {
  const on = !!state.settings.showMarket;
  let saved = null;
  try { saved = localStorage.getItem('view'); } catch (_) {}
  const view = resolveView(saved, on);
  $('#mainGrid').dataset.view = view;
  $('#viewTabs').hidden = !on;
  for (const b of document.querySelectorAll('#viewTabs [data-view]')) {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  }
}

export function setView(view) {
  try { localStorage.setItem('view', view); } catch (_) {}
  applyView();
  window.scrollTo(0, 0);
}

// 아이디어 노트 카드: 계정 설정 하나로 결정. 기본 꺼짐.
export function applyNotesVisibility() {
  $('#notesCard').hidden = !state.settings.showNotes;
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
  $('#projectsSummary').textContent = projectsSummaryText(monthTasks); // 접혀 있어도 보이는 한 줄
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
  // 주간 뷰 초기화 (앱 시작 시 오늘이 속한 주의 일요일로 세팅).
  if (!state.weekStart) state.weekStart = weekStartOf(today);
  const monthBtn = $('#calMonth'), weekBtn = $('#calWeek');
  if (monthBtn && weekBtn) {
    monthBtn.setAttribute('aria-selected', state.calMode === 'month');
    weekBtn.setAttribute('aria-selected', state.calMode === 'week');
    monthBtn.classList.toggle('active', state.calMode === 'month');
    weekBtn.classList.toggle('active', state.calMode === 'week');
  }
  if (state.calMode === 'week') return renderWeekView();
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
    // 공휴일 막대가 맨 앞 → 맨 위 줄. 연휴는 막대 하나(추석 추석 추석 → 추석).
    const segs = holidaySpans(state.holidays, week.map(c => c.iso)).map(h => ({ holiday: h, startCol: h.startCol, endCol: h.endCol }));
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

    const cellsHtml = week.map((c, ci) => {
      const hol = holidayFor(c.iso);
      const lun = lunarFor(c.iso);
      const cls = ['wk-cell', c.other && 'other', c.iso === todayIso && 'today', c.iso === state.selectedDate && 'selected', hol && 'holiday'].filter(Boolean).join(' ');
      const lunChip = lun ? `<span class="wk-lun">${esc(lun)}</span>` : '';
      const more = overflow[ci] > 0 ? `<span class="wk-more">+${overflow[ci]}</span>` : '';
      return `<button class="${cls}" data-date="${c.iso}"${hol ? ` title="${esc(hol)}"` : ''}><span class="wk-num">${c.n}${lunChip}</span>${more}</button>`;
    }).join('');

    const segsHtml = segs.filter(s => s.track < MAX_TRACKS).map(s => {
      const leftPct = (s.startCol / 7) * 100;
      const widthPct = ((s.endCol - s.startCol + 1) / 7) * 100;
      const top = 22 + s.track * 22;
      if (s.holiday) {
        return `<span class="wk-seg hol-seg" style="left:${leftPct.toFixed(3)}%;width:calc(${widthPct.toFixed(3)}% - 4px);top:${top}px" title="${esc(s.holiday.title)}">${esc(s.holiday.label)}</span>`;
      }
      const col = projectColor(s.task.project);
      return `<span class="wk-seg" style="left:${leftPct.toFixed(3)}%;width:calc(${widthPct.toFixed(3)}% - 4px);top:${top}px;background:${col}22;color:${col};border-left:3px solid ${col}" title="${esc(s.task.title)}">${esc(s.task.title)}</span>`;
    }).join('');

    return `<div class="wk-row"><div class="wk-cells">${cellsHtml}</div><div class="wk-segs">${segsHtml}</div></div>`;
  }).join('');

  $('#calendar').innerHTML = weekHtml;
}


// 주어진 Date 의 그 주 일요일(00:00) Date.
export function weekStartOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

const WV_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];   // 06:00 ~ 21:00 (다음 줄=22:00)
const WV_HOUR_H = 44;                                                              // 한 시간 = 44px
const WV_DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function estMinutes(t) {
  // task_time 만 있고 지속시간 필드가 없다면 기본 60분.
  return 60;
}

function renderWeekView() {
  const start = new Date(state.weekStart);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const startIso = iso(start), endIso = iso(end);
  const todayIso = iso(today);

  $('#monthLabel').textContent =
    `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;

  const shown = visibleTasks();
  // 이번 주와 겹치는 업무만.
  const weekTasks = shown.filter(t => t.date <= endIso && dueDate(t) >= startIso);
  const timed = weekTasks.filter(t => t.time && t.date === dueDate(t));   // 시간이 있고 단일일자
  const allDay = weekTasks.filter(t => !(t.time && t.date === dueDate(t))); // 종일/기간

  // ── 상단 날짜 헤더 ───────────────────────────────────────────
  const headCols = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const isoD = iso(d);
    const hol = holidayFor(isoD);
    const cls = ['wv-head', isoD === todayIso && 'today', isoD === state.selectedDate && 'selected', hol && 'holiday'].filter(Boolean).join(' ');
    headCols.push(`<button class="${cls}" data-date="${isoD}"${hol ? ` title="${esc(hol)}"` : ''}><span class="wv-dow">${WV_DAY_NAMES[i]}</span><span class="wv-num">${d.getDate()}</span></button>`);
  }
  const headHtml = `<div class="wv-head-row"><div class="wv-head-time"></div>${headCols.join('')}</div>`;

  // ── 종일/기간 스트립 (트랙 배치) ────────────────────────────
  const sortedAllDay = [...allDay].sort((a, b) => {
    const spanA = daysBetween(a.date, dueDate(a));
    const spanB = daysBetween(b.date, dueDate(b));
    if (spanB !== spanA) return spanB - spanA;
    return sortTasks(a, b);
  });
  // 공휴일 막대가 맨 앞 → 맨 위 줄 (월 보기와 같다)
  const weekIsos = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
  const segs = holidaySpans(state.holidays, weekIsos).map(h => ({ holiday: h, startCol: h.startCol, endCol: h.endCol }));
  for (const t of sortedAllDay) {
    const sCol = Math.max(0, daysBetween(startIso, t.date));
    const eCol = Math.min(6, daysBetween(startIso, dueDate(t)));
    segs.push({ task: t, startCol: sCol, endCol: eCol });
  }
  const tracks = [];
  for (const seg of segs) {
    let tr = 0;
    while (tr < tracks.length && tracks[tr].some(o => !(seg.endCol < o.startCol || seg.startCol > o.endCol))) tr++;
    if (!tracks[tr]) tracks[tr] = [];
    tracks[tr].push(seg);
    seg.track = tr;
  }
  const trackCount = tracks.length;
  const stripH = Math.max(trackCount * 22 + 6, 8);
  const stripSegs = segs.map(s => {
    const leftPct = (s.startCol / 7) * 100;
    const widthPct = ((s.endCol - s.startCol + 1) / 7) * 100;
    const top = 3 + s.track * 22;
    if (s.holiday) {
      return `<span class="wv-seg hol-seg" style="left:calc(${leftPct.toFixed(3)}% + 2px);width:calc(${widthPct.toFixed(3)}% - 4px);top:${top}px" title="${esc(s.holiday.title)}">${esc(s.holiday.label)}</span>`;
    }
    const c = projectColor(s.task.project);
    return `<span class="wv-seg" data-task-id="${esc(s.task.id)}" style="left:calc(${leftPct.toFixed(3)}% + 2px);width:calc(${widthPct.toFixed(3)}% - 4px);top:${top}px;background:${c}22;color:${c};border-left:3px solid ${c}" title="${esc(s.task.title)}">${esc(s.task.title)}</span>`;
  }).join('');
  const stripHtml = trackCount
    ? `<div class="wv-strip"><div class="wv-strip-time">종일</div><div class="wv-strip-cells" style="height:${stripH}px">${stripSegs}</div></div>`
    : '';

  // ── 시간 격자 ────────────────────────────────────────────
  const rows = WV_HOURS.map(h => {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const isoD = iso(d);
      const startAt = `${String(h).padStart(2, '0')}:00`;
      cells.push(`<button class="wv-slot" data-date="${isoD}" data-time="${startAt}" aria-label="${esc(isoD)} ${startAt}"></button>`);
    }
    return `<div class="wv-row"><div class="wv-time">${String(h).padStart(2, '0')}:00</div>${cells.join('')}</div>`;
  }).join('');
  const gridH = WV_HOURS.length * WV_HOUR_H;

  // 타임드 이벤트 배치 (열별로 그룹지어 겹침 감지 후 폭 나눔).
  const bounds = { top: WV_HOURS[0] * 60, bot: (WV_HOURS[WV_HOURS.length - 1] + 1) * 60 };
  const byCol = [[], [], [], [], [], [], []];
  for (const t of timed) {
    const col = daysBetween(startIso, t.date);
    if (col < 0 || col > 6) continue;
    const startMin = timeToMinutes(t.time);
    if (startMin == null) continue;
    const endMin = Math.min(bounds.bot, startMin + estMinutes(t));
    if (endMin <= bounds.top || startMin >= bounds.bot) continue;
    const s0 = Math.max(startMin, bounds.top);
    byCol[col].push({ task: t, s0, e0: endMin });
  }
  const evHtmls = [];
  for (let col = 0; col < 7; col++) {
    const list = byCol[col].sort((a, b) => a.s0 - b.s0 || b.e0 - a.e0);
    // 인접 겹침 그룹.
    const groups = [];
    let cur = null, curEnd = -1;
    for (const ev of list) {
      if (!cur || ev.s0 >= curEnd) { cur = [ev]; groups.push(cur); curEnd = ev.e0; }
      else { cur.push(ev); curEnd = Math.max(curEnd, ev.e0); }
    }
    for (const g of groups) {
      const n = g.length;
      g.forEach((ev, i) => {
        const c = projectColor(ev.task.project);
        const topPx = (ev.s0 - bounds.top) / 60 * WV_HOUR_H;
        const hPx = Math.max(20, (ev.e0 - ev.s0) / 60 * WV_HOUR_H - 2);
        const colW = 100 / 7;
        const leftPct = col * colW + (i / n) * colW;
        const widthPct = (1 / n) * colW;
        evHtmls.push(`<span class="wv-event" data-task-id="${esc(ev.task.id)}" style="left:calc(${leftPct.toFixed(3)}% + 2px);width:calc(${widthPct.toFixed(3)}% - 4px);top:${topPx.toFixed(1)}px;height:${hPx.toFixed(1)}px;background:${c}22;color:${c};border-left:3px solid ${c}"><b>${esc(ev.task.time)}</b> ${esc(ev.task.title)}</span>`);
      });
    }
  }

  const gridHtml = `<div class="wv-grid" style="height:${gridH}px">${rows}<div class="wv-events">${evHtmls.join('')}</div></div>`;
  $('#calendar').innerHTML = `<div class="wv">${headHtml}${stripHtml}${gridHtml}</div>`;
}

export function resetForm() {
  state.editId = null;
  $('#formTitle').textContent = '업무 · 일정 추가';
  $('#submitTask').textContent = '추가하기';
  $('#repeat').disabled = false;
  $('#repeatCount').disabled = false;
  if ($('#repeatBack')) $('#repeatBack').disabled = false;
  $('#addForm').reset();
  $('#date').value = state.selectedDate || iso(today);
  $('#endDate').value = '';
  $('#repeatCount').value = 1;
  if ($('#repeatBack')) $('#repeatBack').value = 0;
  if ($('#isLunar')) $('#isLunar').checked = false;
  setAllDay(false);
  renderProjectOptions(undefined);
  setShareFamily(false, false);
  syncShareFamilyForProject();
  updateLunarPreview();
}

// "음력" 체크 상태에 따라 시작일 아래 표시.
export function updateLunarPreview() {
  const box = $('#lunarPreview');
  if (!box) return;
  const iso = $('#date').value;
  if (!iso) { box.textContent = ''; return; }
  if ($('#isLunar')?.checked) {
    const lp = lunarFor(iso);
    box.textContent = lp ? `= 음력 ${lp}` : '';
  } else {
    const lp = lunarFor(iso);
    box.textContent = lp ? `(음력 ${lp})` : '';
  }
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
  if ($('#repeatBack')) $('#repeatBack').disabled = true;
  if ($('#isLunar')) $('#isLunar').checked = false;
  updateLunarPreview();
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
  $('#setNotes').checked = !!state.settings.showNotes;
  // 가족 섹션: 가족이 없으면 만들기·참여, 있으면 구성원 + 이름·초대(가장만)·나가기(구성원만).
  const famSection = $('#familySection');
  if (famSection) {
    renderFamily();
    $('#familyManage').hidden = !state.family;
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
  return `<div class="day-task${t.done ? ' done' : ''}" data-task-id="${esc(t.id)}">
    <input class="check dt-check" type="checkbox" ${t.done ? 'checked' : ''} data-action="dt-toggle" data-id="${esc(t.id)}" style="--c:${c}" aria-label="완료 표시">
    <button class="dt-body" type="button" data-action="dt-edit" data-id="${esc(t.id)}">
      <span class="dt-when">${when}</span>
      <span class="dt-bar" style="background:${c}"></span>
      <span class="dt-title">${esc(t.title)}</span>
      ${userAvatarFor(t.userId, authorName)}
    </button>
    <button class="dt-del" type="button" data-action="dt-del" data-id="${esc(t.id)}" aria-label="삭제">×</button>
  </div>`;
}

// 다이얼로그가 열려 있으면 내부 리스트만 다시 그린다 (닫지 않는다).
export function refreshOpenDialogs() {
  if ($('#dayDialog')?.open && state.selectedDate) openDayDialog(state.selectedDate);
  if ($('#projectDialog')?.open && state.openProject) openProjectDialog(state.openProject);
  if ($('#searchDialog')?.open) renderSearchResults($('#searchInput').value);
}

// 프로젝트 상세 다이얼로그
export function openProjectDialog(name) {
  state.openProject = name;
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
  const hol = holidayFor(dateIso);
  const subParts = [lunar, hol].filter(Boolean);
  $('#dayDialogSub').innerHTML = subParts.length
    ? subParts.map((p, i) => i === 1 ? `<span class="sub-hol">${esc(p)}</span>` : esc(p)).join(' · ')
    : '';

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


// 전체 업무 검색 다이얼로그


// 응원 팔레트 다이얼로그 — 이모지 6개, 클릭 시 토글, 닫기.
export function openReactionsFor(taskId) {
  const list = state.reactions?.[taskId] || [];
  const myId = state.user?.id;
  const cells = REACTION_EMOJIS.map(e => {
    const mine = list.some(r => r.userId === myId && r.emoji === e);
    const n = list.filter(r => r.emoji === e).length;
    return `<button class="react-cell${mine ? ' mine' : ''}" data-emoji="${esc(e)}" type="button">${e}${n ? `<span>${n}</span>` : ''}</button>`;
  }).join('');
  $('#reactionsTaskId').value = taskId;
  $('#reactionsPalette').innerHTML = cells;
  $('#reactionsDialog').showModal();
}

export function closeReactionsDialog() {
  const d = $('#reactionsDialog');
  if (d.open) d.close();
}

export function openSearchDialog() {
  $('#searchInput').value = '';
  renderSearchResults('');
  $('#searchDialog').showModal();
  setTimeout(() => $('#searchInput').focus(), 0);
}
export function closeSearchDialog() {
  const d = $('#searchDialog');
  if (d.open) d.close();
}
export function renderSearchResults(qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  const box = $('#searchResults');
  if (!q) {
    box.innerHTML = '<div class="empty">제목·프로젝트·메모 중 아무 단어로 찾을 수 있습니다.</div>';
    return;
  }
  const matches = state.tasks.filter(t => {
    return (t.title || '').toLowerCase().includes(q)
      || (t.project || '').toLowerCase().includes(q)
      || (t.note || '').toLowerCase().includes(q);
  }).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.date.localeCompare(a.date);
  }).slice(0, 60);
  box.innerHTML = matches.length
    ? matches.map(t => renderDayTaskRow(t, true)).join('')
    : '<div class="empty">일치하는 업무가 없습니다.</div>';
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
