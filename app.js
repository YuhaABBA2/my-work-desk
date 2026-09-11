const supabaseUrl = 'https://skihcfyndumifhaxamas.supabase.co';
const supabaseKey = 'sb_publishable_6igMLFNC7cYgN2gCjwUvpg_mYcsFN4B';
const sb = window.supabase.createClient(supabaseUrl, supabaseKey);
const $ = (s) => document.querySelector(s);

const today = new Date();
today.setHours(0, 0, 0, 0);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let tasks = [];
let user = null;
let editId = null;
let selectedDate = null;

const settings = {
  get hideDone() { return localStorage.getItem('hideDone') === '1'; },
  set hideDone(v) { localStorage.setItem('hideDone', v ? '1' : '0'); },
  get dark() { return localStorage.getItem('darkMode') === '1'; },
  set dark(v) { localStorage.setItem('darkMode', v ? '1' : '0'); },
  get projects() {
    try {
      return JSON.parse(localStorage.getItem('deskProjects') || '["회사 업무","개인 일정","투자 · 자산","Work Station"]');
    } catch (_err) {
      return ['회사 업무', '개인 일정', '투자 · 자산', 'Work Station'];
    }
  },
  set projects(v) { localStorage.setItem('deskProjects', JSON.stringify([...new Set(v.filter(Boolean))])); }
};

function iso(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function pri(p) { return p === 'high' ? '중요' : p === 'middle' ? '보통' : '여유'; }
function sortTasks(a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); }
function visibleTasks() { return settings.hideDone ? tasks.filter(t => !t.done) : tasks; }

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
    <span class="badge ${t.priority}">${pri(t.priority)}</span>
    <button class="edit" data-action="edit-task" data-id="${esc(t.id)}">수정</button>
    <button class="delete" aria-label="삭제" data-action="remove-task" data-id="${esc(t.id)}">×</button>
  </div>`;
}

async function load() {
  const { data, error } = await sb.from('work_tasks').select('*').order('task_date').order('task_time');
  if (error) return alert('업무 목록을 불러오지 못했습니다. Supabase 설정을 확인해 주세요.');
  tasks = data.map(x => ({
    id: x.id,
    title: x.title,
    date: x.task_date,
    priority: x.priority,
    project: x.project,
    time: x.task_time?.slice(0, 5) || '',
    note: x.note,
    done: x.done
  }));
  render();
}

function render() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#toggleDone').textContent = settings.hideDone ? '완료 보이기' : '완료 숨기기';
  $('#darkMode').textContent = settings.dark ? '라이트모드' : '다크모드';

  const td = iso(today);
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
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

function renderProjects() {
  const favorites = settings.projects;
  const fromTasks = [...new Set(tasks.map(t => t.project || '미분류'))];
  const allProjects = [...new Set([...favorites, ...fromTasks])];
  $('#projects').innerHTML = allProjects.map(p => `<option value="${esc(p)}">`).join('');
  $('#projectChips').innerHTML = favorites.map(p => `<span class="chip">${esc(p)} <button data-action="delete-project" data-project="${esc(p)}">×</button></span>`).join('');

  const ongoing = tasks.filter(t => !t.done);
  const groups = {};
  ongoing.forEach(t => { const p = t.project || '미분류'; (groups[p] ??= []).push(t); });
  $('#projectsView').innerHTML = Object.entries(groups).map(([p, items]) => {
    const all = tasks.filter(t => (t.project || '미분류') === p);
    const pct = Math.round((all.length - items.length) / all.length * 100);
    return `<div class="project"><div class="project-line"><span>${esc(p)}</span><span class="hint">${items.length}건 남음</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('') || '<div class="empty">프로젝트별 업무를 등록해 보세요.</div>';
}

function calendar() {
  const y = view.getFullYear();
  const m = view.getMonth();
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
    html += `<button class="day ${other ? 'other' : ''} ${dayIso === iso(today) ? 'today' : ''} ${dayIso === selectedDate ? 'selected' : ''}" data-date="${dayIso}"><b>${n}</b>${list.map(t => `<span class="dot">${esc(t.title)}</span>`).join('')}</button>`;
  }
  $('#calendar').innerHTML = html;
}

function resetForm() {
  editId = null;
  $('#formTitle').textContent = '업무 · 일정 추가';
  $('#submitTask').textContent = '추가하기';
  $('#cancelEdit').hidden = true;
  $('#repeat').disabled = false;
  $('#repeatCount').disabled = false;
  $('#addForm').reset();
  $('#date').value = selectedDate || iso(today);
  $('#repeatCount').value = 1;
}

function occurrenceDates(startIso, repeat, count) {
  const start = new Date(startIso);
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    if (repeat === 'daily') return iso(addDays(start, i));
    if (repeat === 'weekly') return iso(addDays(start, i * 7));
    if (repeat === 'monthly') return iso(addMonths(start, i));
    return startIso;
  });
}

async function saveTask(e) {
  e.preventDefault();
  const base = {
    title: $('#title').value.trim(),
    task_date: $('#date').value,
    priority: $('#priority').value,
    project: $('#project').value.trim() || null,
    task_time: $('#time').value || null,
    note: $('#note').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  if (editId) {
    const { error } = await sb.from('work_tasks').update(base).eq('id', editId);
    if (error) return alert('수정하지 못했습니다.');
    await load();
    resetForm();
    return;
  }
  const repeat = $('#repeat').value;
  const count = repeat === 'none' ? 1 : Math.min(24, Math.max(1, Number($('#repeatCount').value || 1)));
  const records = occurrenceDates(base.task_date, repeat, count).map((date, i) => ({
    user_id: user.id,
    title: base.title,
    task_date: date,
    priority: base.priority,
    project: base.project,
    task_time: base.task_time,
    note: repeat === 'none' ? base.note : [base.note, `${repeat === 'daily' ? '매일' : repeat === 'weekly' ? '매주' : '매월'} 반복 ${i + 1}/${count}`].filter(Boolean).join(' · ')
  }));
  const { error } = await sb.from('work_tasks').insert(records);
  if (error) return alert('저장하지 못했습니다. Supabase 테이블 설정을 확인해 주세요.');
  await load();
  resetForm();
}

function selectDate(date) {
  selectedDate = date;
  $('#date').value = date;
  calendar();
  $('#title').focus();
  document.querySelector('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  const { error } = await sb.from('work_tasks').update({ done: !t.done, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('저장하지 못했습니다.');
  t.done = !t.done;
  render();
}

function editTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editId = id;
  $('#formTitle').textContent = '업무 · 일정 수정';
  $('#submitTask').textContent = '수정 저장';
  $('#cancelEdit').hidden = false;
  $('#title').value = t.title;
  $('#date').value = t.date;
  $('#priority').value = t.priority;
  $('#project').value = t.project || '';
  $('#time').value = t.time || '';
  $('#note').value = t.note || '';
  $('#repeat').value = 'none';
  $('#repeat').disabled = true;
  $('#repeatCount').disabled = true;
  document.querySelector('#addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removeTask(id) {
  if (!confirm('이 업무를 삭제할까요?')) return;
  const { error } = await sb.from('work_tasks').delete().eq('id', id);
  if (error) return alert('삭제하지 못했습니다.');
  tasks = tasks.filter(t => t.id !== id);
  render();
}

function addProject() {
  const value = $('#newProject').value.trim();
  if (!value) return;
  settings.projects = [...settings.projects, value];
  $('#newProject').value = '';
  renderProjects();
}
function deleteProject(name) {
  settings.projects = settings.projects.filter(p => p !== name);
  renderProjects();
}

async function notifyDue() {
  const due = tasks.filter(t => !t.done && t.date <= iso(addDays(today, 3))).sort(sortTasks);
  if (!due.length) return alert('마감 임박 업무가 없습니다.');
  if (!('Notification' in window)) return alert('이 브라우저는 알림을 지원하지 않습니다.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return;
  new Notification('마감 임박 업무', { body: due.slice(0, 4).map(t => t.title).join(', ') });
}

async function loadMarket() {
  const status = $('#marketStatus');
  const grid = $('#marketGrid');
  const names = ['양돈', '한우', '산란', '육계'];
  status.textContent = '축산물 시세를 조회하는 중입니다.';
  grid.innerHTML = names.map(n => marketCard(n, null)).join('');
  try {
    const url = 'https://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_cert_key=TEST&p_cert_id=TEST&p_returntype=json&p_product_cls_code=01&p_item_category_code=200';
    const res = await fetch(url);
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data.filter(x => typeof x === 'object') : [];
    status.innerHTML = rows.length ? 'KAMIS 축산물 가격정보를 불러왔습니다.' : 'KAMIS 테스트 키 응답에 상세 품목이 없어 공식 페이지 확인이 필요합니다. <a class="source-link" href="https://www.kamis.or.kr/customer/reference/openapi_list.do" target="_blank" rel="noreferrer">KAMIS Open API</a>';
    grid.innerHTML = names.map(n => marketCard(n, rows.find(r => JSON.stringify(r).includes(n)))).join('');
  } catch (err) {
    status.innerHTML = `브라우저에서 KAMIS 조회가 제한됐습니다. <a class="source-link" href="https://www.kamis.or.kr/customer/price/wholesale/item.do" target="_blank" rel="noreferrer">공식 가격정보 보기</a>`;
    grid.innerHTML = names.map(n => marketCard(n, null)).join('');
  }
}

function marketCard(name, row) {
  const text = row ? JSON.stringify(row) : '공식 데이터 연결 필요';
  const bars = [35, 52, 44, 63, 57, 70].map(v => `<i style="height:${v}%"></i>`).join('');
  return `<div class="market-item"><b>${name}</b><span>${esc(text).slice(0, 80)}</span><div class="spark">${bars}</div></div>`;
}

async function handleTaskAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === 'toggle-task' && e.type !== 'change') return;
  if (action !== 'toggle-task' && e.type !== 'click') return;
  if (action === 'toggle-task') await toggleTask(e.target.dataset.id);
  if (action === 'edit-task') editTask(e.target.dataset.id);
  if (action === 'remove-task') await removeTask(e.target.dataset.id);
  if (action === 'delete-project') deleteProject(e.target.dataset.project);
}

async function start() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#todayLabel').textContent = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#date').value = iso(today);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  user = session.user;
  $('#userName').textContent = user.email || '로그인됨';
  $('#loginOverlay').hidden = true;
  $('#app').hidden = false;
  await load();
  loadMarket();
}

$('#googleLogin').onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
  if (error) $('#notice').textContent = '로그인을 시작하지 못했습니다. Google 로그인이 활성화됐는지 확인해 주세요.';
};
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };
$('#addForm').addEventListener('submit', saveTask);
$('#todayTasks').addEventListener('click', handleTaskAction);
$('#todayTasks').addEventListener('change', handleTaskAction);
$('#weekTasks').addEventListener('click', handleTaskAction);
$('#weekTasks').addEventListener('change', handleTaskAction);
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('.day');
  if (day?.dataset.date) selectDate(day.dataset.date);
});
$('#projectChips').addEventListener('click', handleTaskAction);
$('#cancelEdit').onclick = resetForm;
$('#prev').onclick = () => { view.setMonth(view.getMonth() - 1); calendar(); };
$('#next').onclick = () => { view.setMonth(view.getMonth() + 1); calendar(); };
$('#thisMonth').onclick = () => { view = new Date(today.getFullYear(), today.getMonth(), 1); selectedDate = iso(today); $('#date').value = selectedDate; calendar(); };
$('#toggleDone').onclick = () => { settings.hideDone = !settings.hideDone; render(); };
$('#darkMode').onclick = () => { settings.dark = !settings.dark; render(); };
$('#notifyDue').onclick = notifyDue;
$('#addProject').onclick = addProject;
$('#refreshMarket').onclick = loadMarket;
sb.auth.onAuthStateChange((_event, session) => { if (session && !user) start(); });
start();
