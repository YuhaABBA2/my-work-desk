import { sb } from './supabase.js';
import { state, settings, today } from './state.js';
import { iso, isValidFamilyCode, rpcErrorMessage } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay, renderFamily, applyMarketVisibility, setFamilyStatus, setShareFamily, syncShareFamilyForProject, openTaskDialog, closeTaskDialog } from './ui.js';
import { load, saveTask, toggleTask, editTask, removeTask, notifyDue } from './tasks.js';
import { loadProjects, addProject, deleteProject, migrateLocalProjects, ensureFixedProjects } from './projects.js';
import { loadMarket, renderInvestment, renderStockLinks } from './market.js';
import { loadFamily, createFamily, joinFamily, leaveFamily, regenerateCode, renameMe, defaultDisplayName } from './family.js';
import { loadSettings, setShowMarket } from './settings.js';

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
    if (err) return alert(err.message || '프로젝트를 삭제하지 못했습니다.');
    renderProjects();
  }
}

async function onAddProject() {
  const err = await addProject($('#newProject').value);
  if (err) return alert(err.message || '프로젝트를 추가하지 못했습니다.');
  $('#newProject').value = '';
  renderProjects();
}

async function handleFamilyAction(e) {
  const id = e.target.id;
  if (!id) return;
  const name = defaultDisplayName(state.user);
  let err = null;
  if (id === 'createFamily') err = await createFamily(name);
  else if (id === 'joinFamily') {
    const code = $('#joinCode').value;
    if (!isValidFamilyCode(code)) return alert('코드는 6자리입니다.');
    err = await joinFamily(code, name);
  }
  else if (id === 'renameMe') err = await renameMe($('#myName').value);
  else if (id === 'regenCode') err = await regenerateCode();
  else if (id === 'leaveFamily') {
    if (!confirm('가족에서 나갈까요? 가족 일정이 더 이상 보이지 않습니다.')) return;
    err = await leaveFamily();
  }
  else return;
  if (err) return alert(rpcErrorMessage(err));
  await load();          // 가족 업무가 들어오거나 빠진다
  renderFamily();
  applyMarketVisibility();
  syncShareFamilyForProject();
}

async function onToggleMarket() {
  const err = await setShowMarket(!state.settings.showMarket);
  if (err) return alert(err.message || '설정을 저장하지 못했습니다.');
  applyMarketVisibility();
  if (!$('.market-card').hidden) { renderInvestment(); loadMarket(); }
}

let started = false;

async function start() {
  document.documentElement.classList.toggle('dark', settings.dark);
  $('#todayLabel').textContent = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#date').value = iso(today);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  if (started) return;
  started = true;
  state.user = session.user;
  $('#userName').textContent = state.user.email || '로그인됨';
  $('#loginOverlay').hidden = true;
  $('#app').hidden = false;
  const projErr = await loadProjects();
  setProjectStatus(projErr ? '프로젝트 동기화 준비 중: Supabase SQL 마이그레이션이 필요합니다.' : '');
  const famErr = await loadFamily();
  setFamilyStatus(famErr ? '가족 정보를 불러오지 못했습니다. SQL 마이그레이션을 확인해 주세요.' : '');
  await loadSettings();
  await load();
  const migErr = await migrateLocalProjects();
  if (migErr) setProjectStatus('프로젝트 목록을 옮기지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  const fixErr = await ensureFixedProjects();
  if (fixErr) setProjectStatus('기본 프로젝트를 만들지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  renderProjects();
  renderFamily();
  applyMarketVisibility();
  syncShareFamilyForProject();
  if (!$('.market-card').hidden) { renderInvestment(); loadMarket(); }
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
$('#closeTaskDialog').onclick = closeTaskDialog;
$('#addTaskBtn').onclick = () => openTaskDialog('add');
$('#fabAdd').onclick = () => openTaskDialog('add');
$('#allDay').addEventListener('change', e => setAllDay(e.target.checked));
$('#project').addEventListener('change', syncShareFamilyForProject);
$('#prev').onclick = () => { state.view.setMonth(state.view.getMonth() - 1); calendar(); };
$('#next').onclick = () => { state.view.setMonth(state.view.getMonth() + 1); calendar(); };
$('#thisMonth').onclick = () => { state.view = new Date(today.getFullYear(), today.getMonth(), 1); state.selectedDate = iso(today); $('#date').value = state.selectedDate; calendar(); };
$('#toggleDone').onclick = () => { settings.hideDone = !settings.hideDone; render(); };
$('#darkMode').onclick = () => { settings.dark = !settings.dark; render(); };
$('#notifyDue').onclick = notifyDue;
$('#addProject').onclick = onAddProject;
$('#familyBody').addEventListener('click', handleFamilyAction);
$('#familyBody').addEventListener('keydown', e => {
  if (e.target.id === 'joinCode' && e.key === 'Enter') { e.preventDefault(); $('#joinFamily')?.click(); }
});
$('#toggleMarket').onclick = onToggleMarket;
$('#refreshMarket').onclick = loadMarket;
$('#openMarketDashboard').onclick = () => window.open('https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y', '_blank', 'noopener');
$('#searchStock').onclick = renderStockLinks;
$('#stockQuery').addEventListener('keydown', e => { if (e.key === 'Enter') renderStockLinks(); });
sb.auth.onAuthStateChange((_event, session) => { if (session && !state.user) start(); });
start();
