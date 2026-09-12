import { sb } from './supabase.js';
import { state, settings, today } from './state.js';
import { iso } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus } from './ui.js';
import { load, saveTask, toggleTask, editTask, removeTask, notifyDue } from './tasks.js';
import { loadProjects, addProject, deleteProject } from './projects.js';
import { loadMarket, renderInvestment, renderStockLinks } from './market.js';

async function handleTaskAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === 'toggle-task' && e.type !== 'change') return;
  if (action !== 'toggle-task' && e.type !== 'click') return;
  if (action === 'toggle-task') await toggleTask(e.target.dataset.id);
  if (action === 'edit-task') editTask(e.target.dataset.id);
  if (action === 'remove-task') await removeTask(e.target.dataset.id);
  if (action === 'delete-project') {
    const err = await deleteProject(e.target.dataset.project);
    if (err) return alert('프로젝트를 삭제하지 못했습니다.');
    renderProjects();
  }
}

async function onAddProject() {
  const err = await addProject($('#newProject').value);
  if (err) return alert(err.message || '프로젝트를 추가하지 못했습니다.');
  $('#newProject').value = '';
  renderProjects();
}

async function start() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#todayLabel').textContent = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#date').value = iso(today);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  state.user = session.user;
  $('#userName').textContent = state.user.email || '로그인됨';
  $('#loginOverlay').hidden = true;
  $('#app').hidden = false;
  const projErr = await loadProjects();
  setProjectStatus(projErr ? '프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다.' : '');
  await load();
  renderInvestment();
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
$('#prev').onclick = () => { state.view.setMonth(state.view.getMonth() - 1); calendar(); };
$('#next').onclick = () => { state.view.setMonth(state.view.getMonth() + 1); calendar(); };
$('#thisMonth').onclick = () => { state.view = new Date(today.getFullYear(), today.getMonth(), 1); state.selectedDate = iso(today); $('#date').value = state.selectedDate; calendar(); };
$('#toggleDone').onclick = () => { settings.hideDone = !settings.hideDone; render(); };
$('#darkMode').onclick = () => { settings.dark = !settings.dark; render(); };
$('#notifyDue').onclick = notifyDue;
$('#addProject').onclick = onAddProject;
$('#refreshMarket').onclick = loadMarket;
$('#openMarketDashboard').onclick = () => window.open('https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y', '_blank', 'noopener');
$('#searchStock').onclick = renderStockLinks;
$('#stockQuery').addEventListener('keydown', e => { if (e.key === 'Enter') renderStockLinks(); });
sb.auth.onAuthStateChange((_event, session) => { if (session && !state.user) start(); });
start();
