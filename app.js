import { sb } from './supabase.js';
import { state, settings, today } from './state.js';
import { iso, isValidFamilyCode, rpcErrorMessage } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay, renderFamily, applyMarketVisibility, setFamilyStatus, setShareFamily, syncShareFamilyForProject, openTaskDialog, closeTaskDialog, openSettingsDialog, closeSettingsDialog, renderProfile, openDayDialog, closeDayDialog } from './ui.js';
import { load, saveTask, toggleTask, editTask, removeTask } from './tasks.js';
import { loadProjects, addProject, deleteProject, migrateLocalProjects, ensureFixedProjects } from './projects.js';
import { loadMarket, renderInvestment, renderStockLinks } from './market.js';
import { pushSupported, getPushState, enablePush, disablePush } from './notify.js';
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
  renderProfile();
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


async function refreshPushLabel() {
  const btn = $('#pushToggleBtn');
  const lbl = $('#pushStateLabel');
  if (!btn) return;
  const st = await getPushState();
  if (!st.supported) { btn.textContent = '지원 안 함'; btn.disabled = true; if (lbl) lbl.textContent = '이 브라우저는 푸시 알림을 지원하지 않습니다.'; return; }
  if (st.permission === 'denied') { btn.textContent = '차단됨'; btn.disabled = true; if (lbl) lbl.textContent = '브라우저 설정에서 알림 허용을 다시 켜 주세요.'; return; }
  btn.disabled = false;
  btn.textContent = st.subscribed ? '알림 끄기' : '알림 켜기';
  if (lbl) lbl.textContent = st.subscribed ? '이 기기의 마감 알림 · 켜져 있음' : '이 기기의 마감 알림 · 꺼져 있음';
}

async function onNotifyToggle() {
  const st = await getPushState();
  try {
    if (st.subscribed) {
      if (!confirm('이 기기의 알림을 끌까요?')) return;
      await disablePush();
    } else {
      await enablePush();
      alert('알림이 켜졌습니다. 저장된 업무의 알림 시점이 되면 이 기기로 알림이 도착합니다.');
    }
  } catch (err) {
    alert(err?.message || '알림 설정을 바꾸지 못했습니다.');
  }
  refreshPushLabel();
}

$('#googleLogin').onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
  if (error) $('#notice').textContent = '로그인을 시작하지 못했습니다. Google 로그인이 활성화됐는지 확인해 주세요.';
};
// 프로필 버튼(=계정/설정)
$('#profileBtn').onclick = () => { refreshPushLabel(); openSettingsDialog(); };
$('#closeSettings').onclick = closeSettingsDialog;
$('#logoutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };
// 설정 다이얼로그의 토글들
$('#setHideDone').addEventListener('change', e => { settings.hideDone = e.target.checked; render(); });
$('#setDark').addEventListener('change', e => { settings.dark = e.target.checked; render(); });
$('#setMarket').addEventListener('change', async e => {
  const err = await setShowMarket(e.target.checked);
  if (err) { alert(err.message || '설정을 저장하지 못했습니다.'); e.target.checked = !e.target.checked; return; }
  applyMarketVisibility();
  if (!$('.market-card').hidden) { renderInvestment(); loadMarket(); }
});
$('#pushToggleBtn').onclick = async () => { await onNotifyToggle(); };
// 가족 초대 코드 공유 / 재발급 — 설정 다이얼로그의 버튼
async function shareFamilyCode() {
  const code = state.family?.code; if (!code) return;
  const msg = `우리집 데스크에 초대합니다.
1) https://my-work-desk.vercel.app 을 열어 Google 로그인
2) 아래 코드를 "가족" 카드에서 입력

초대 코드: ${code}`;
  try {
    if (navigator.share) await navigator.share({ title: '우리집 데스크 가족 초대', text: msg });
    else { await navigator.clipboard.writeText(msg); alert('초대 메시지를 복사했습니다. 카톡 등으로 붙여넣으세요.'); }
  } catch (_) { /* 사용자 취소 */ }
}
$('#settingsShareCode').onclick = shareFamilyCode;
$('#settingsRegenCode').onclick = async () => {
  if (!confirm('초대 코드를 새로 발급할까요? 기존 코드로는 참여할 수 없게 됩니다.')) return;
  const err = await regenerateCode();
  if (err) return alert('코드를 재발급하지 못했습니다.');
  $('#settingsInviteCode').textContent = state.family.code;
  renderFamily();
};
$('#addForm').addEventListener('submit', saveTask);
$('#todayTasks').addEventListener('click', handleTaskAction);
$('#todayTasks').addEventListener('change', handleTaskAction);
$('#weekTasks').addEventListener('click', handleTaskAction);
$('#weekTasks').addEventListener('change', handleTaskAction);
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('.wk-cell');
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
$('#addProject').onclick = onAddProject;
$('#familyBody').addEventListener('click', handleFamilyAction);
$('#familyBody').addEventListener('keydown', e => {
  if (e.target.id === 'joinCode' && e.key === 'Enter') { e.preventDefault(); $('#joinFamily')?.click(); }
});
$('#refreshMarket').onclick = loadMarket;
$('#openMarketDashboard').onclick = () => window.open('https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y', '_blank', 'noopener');
$('#searchStock').onclick = renderStockLinks;
$('#stockQuery').addEventListener('keydown', e => { if (e.key === 'Enter') renderStockLinks(); });
$('#dayDialogClose').onclick = closeDayDialog;
$('#dayDialogAdd').onclick = () => {
  const iso = state.selectedDate;
  closeDayDialog();
  openTaskDialog('add');
  if (iso) $('#date').value = iso;
  $('#title').focus();
};
$('#dayDialogList').addEventListener('click', (e) => {
  const btn = e.target.closest('.day-task');
  if (!btn) return;
  closeDayDialog();
  editTask(btn.dataset.taskId);
});
sb.auth.onAuthStateChange((_event, session) => { if (session && !state.user) start(); });
start();
