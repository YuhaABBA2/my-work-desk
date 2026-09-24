import { sb } from './supabase.js';
import { state, settings, today } from './state.js';
import { iso, isValidFamilyCode, rpcErrorMessage, isPersonalTask, dateFromQuery } from './lib.js';
import { $, render, calendar, resetForm, selectDate, renderProjects, setProjectStatus, setAllDay, renderFamily, applyMarketVisibility, applyNotesVisibility, setFamilyStatus, setShareFamily, syncShareFamilyForProject, openTaskDialog, closeTaskDialog, openSettingsDialog, closeSettingsDialog, renderProfile, openDayDialog, closeDayDialog, openProjectDialog, closeProjectDialog, openSearchDialog, closeSearchDialog, renderSearchResults, weekStartOf, openReactionsFor, closeReactionsDialog, refreshOpenDialogs, updateLunarPreview } from './ui.js';
import { load, saveTask, toggleTask, editTask, removeTask } from './tasks.js';
import { toggleReaction } from './reactions.js';
import { initHolidays } from './holidays.js';
initHolidays();
import { loadProjects, addProject, deleteProject, migrateLocalProjects, ensureFixedProjects } from './projects.js';
import { loadMarket } from './market.js';
import { startTicker, stopTicker, refreshTicker, openWatchDialog, closeWatchDialog, onWatchQueryInput, onWatchDialogClick, onWatchReset } from './ticker.js';
import { pushSupported, getPushState, enablePush, disablePush } from './notify.js';
import { loadFamily, createFamily, joinFamily, leaveFamily, regenerateCode, renameMe, defaultDisplayName } from './family.js';
import { loadSettings, setShowMarket, setShowNotes } from './settings.js';
import { loadNotes } from './notes.js';
import { renderNotesCard, openNote, openNoteByTitle, goBackNote, closeNoteDialog, onDeleteCurrentNote, setNoteStatus, openNoteEditor, onNoteFormSubmit, cancelNoteEdit, onNoteBodyInput, onNoteBodyKeydown, onMentionClick, currentNoteId, hideMention, setNoteTab, onNoteFilesPicked, onEditFilesClick, onKindChange, openImagePreview, closeImagePreview } from './notes-ui.js';

async function handleTaskAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === 'toggle-task' && e.type !== 'change') return;
  if (action !== 'toggle-task' && e.type !== 'click') return;
  if (action === 'toggle-task') await toggleTask(e.target.dataset.id);
  if (action === 'react-open') return openReactionsFor(e.target.dataset.id);
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
  // 가족 카드에는 이제 "만들기 / 참여" 만 남아 있다.
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
  else return;
  if (err) return alert(rpcErrorMessage(err));
  await load();
  renderFamily();
  syncShareFamilyForProject();
}

// 설정 다이얼로그 안의 가족 관련 액션.
async function onSettingsRenameMe() {
  const err = await renameMe($('#settingsMyName').value);
  if (err) return alert(err.message || '이름을 저장하지 못했습니다.');
  renderFamily();
}
async function onSettingsLeaveFamily() {
  if (!confirm('가족에서 나갈까요? 가족 일정이 더 이상 보이지 않습니다.')) return;
  const err = await leaveFamily();
  if (err) return alert(rpcErrorMessage(err));
  await load();
  renderFamily();
  syncShareFamilyForProject();
  closeSettingsDialog();
}


// 오늘 미완료 개인 업무 전체를 내일로 이동.
async function pushOverdueToTomorrow() {
  const td = new Date(); td.setHours(0, 0, 0, 0);
  const tdIso = td.toISOString().slice(0, 10);
  const t2 = new Date(td); t2.setDate(td.getDate() + 1);
  const tomorrowIso = t2.toISOString().slice(0, 10);
  const targets = state.tasks.filter(t => !t.done && isPersonalTask(t, state.user?.id) && (t.endDate || t.date) <= tdIso).map(t => t.id);
  if (!targets.length) return;
  if (!confirm(`오늘 못 한 일 ${targets.length}건을 내일(${tomorrowIso})로 옮길까요?`)) return;
  const { error } = await sb.from('work_tasks').update({ task_date: tomorrowIso, updated_at: new Date().toISOString() }).in('id', targets);
  if (error) return alert(error.message || '옮기지 못했습니다.');
  await load();
}

// Web Speech API 음성 입력 → 제목 필드에 붙여넣기
function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return alert('이 브라우저는 음성 입력을 지원하지 않습니다. Chrome/Safari 에서 사용해 주세요.');
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const btn = $('#micBtn');
  btn.classList.add('listening');
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript || '';
    const cur = $('#title').value;
    $('#title').value = cur ? `${cur} ${text}` : text;
  };
  rec.onerror = (e) => { if (e.error !== 'no-speech') alert('음성 인식 오류: ' + e.error); };
  rec.onend = () => btn.classList.remove('listening');
  try { rec.start(); } catch (_) { btn.classList.remove('listening'); }
}

// 노트 카드가 켜져 있을 때만 부른다. 꺼져 있으면 work_notes 조회 자체를 안 한다.
async function refreshNotes() {
  const err = await loadNotes();
  setNoteStatus(err ? '노트를 불러오지 못했습니다. Supabase에 work_notes SQL을 적용했는지 확인해 주세요.' : '');
  renderNotesCard();
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
  applyNotesVisibility();
  if (state.settings.showNotes) await refreshNotes();
  applyMarketVisibility();
  syncShareFamilyForProject();
  if (!$('.market-card').hidden) { loadMarket(); startTicker(); }
  openDateFromWidget();
}

// 홈화면 위젯을 누르면 ?d=오늘 로 들어온다. 일정이 다 들어온 뒤 그 날 창을 띄운다.
function openDateFromWidget() {
  const d = dateFromQuery(location.search);
  if (!d) return;
  state.selectedDate = d;
  openDayDialog(d);
  // d 만 지운다 — 새로고침에 다시 뜨지 않게. 다른 파라미터는 남긴다.
  const url = new URL(location.href);
  url.searchParams.delete('d');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
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
  if (!$('.market-card').hidden) { loadMarket(); startTicker(); } else stopTicker();
});
$('#setNotes').addEventListener('change', async e => {
  const err = await setShowNotes(e.target.checked);
  if (err) { alert(err.message || '설정을 저장하지 못했습니다.'); e.target.checked = !e.target.checked; return; }
  applyNotesVisibility();
  if (state.settings.showNotes) await refreshNotes();
  else closeNoteDialog();
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
$('#settingsRenameMe').onclick = onSettingsRenameMe;
$('#settingsLeaveFamily').onclick = onSettingsLeaveFamily;
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
  // 주간 뷰: 종일/기간 세그먼트 또는 시간 이벤트 클릭 → 편집.
  const ev = e.target.closest('.wv-event, .wv-seg');
  if (ev) { editTask(ev.dataset.taskId); return; }
  // 주간 뷰: 시간 슬롯 클릭 → 그 시각으로 일정 추가.
  const slot = e.target.closest('.wv-slot');
  if (slot) {
    state.selectedDate = slot.dataset.date;
    openTaskDialog('add');
    $('#date').value = slot.dataset.date;
    $('#time').value = slot.dataset.time;
    $('#allDay').checked = false;
    setAllDay(false);
    $('#title').focus();
    return;
  }
  // 주간 뷰: 헤더의 날짜 클릭 → 그 날짜 상세.
  const head = e.target.closest('.wv-head');
  if (head) { selectDate(head.dataset.date); return; }
  const day = e.target.closest('.wk-cell');
  if (day?.dataset.date) selectDate(day.dataset.date);
});
$('#projectChips').addEventListener('click', handleTaskAction);
$('#closeTaskDialog').onclick = closeTaskDialog;
$('#addTaskBtn').onclick = () => openTaskDialog('add');
$('#fabAdd').onclick = () => openTaskDialog('add');
$('#allDay').addEventListener('change', e => setAllDay(e.target.checked));
$('#date').addEventListener('change', updateLunarPreview);
$('#isLunar').addEventListener('change', updateLunarPreview);
$('#project').addEventListener('change', syncShareFamilyForProject);
$('#prev').onclick = () => {
  if (state.calMode === 'week') {
    state.weekStart = new Date(state.weekStart); state.weekStart.setDate(state.weekStart.getDate() - 7);
  } else {
    state.view.setMonth(state.view.getMonth() - 1);
  }
  calendar();
};
$('#next').onclick = () => {
  if (state.calMode === 'week') {
    state.weekStart = new Date(state.weekStart); state.weekStart.setDate(state.weekStart.getDate() + 7);
  } else {
    state.view.setMonth(state.view.getMonth() + 1);
  }
  calendar();
};
$('#thisMonth').onclick = () => {
  if (state.calMode === 'week') state.weekStart = weekStartOf(today);
  else state.view = new Date(today.getFullYear(), today.getMonth(), 1);
  state.selectedDate = iso(today);
  $('#date').value = state.selectedDate;
  calendar();
};
$('#calMonth').onclick = () => { state.calMode = 'month'; localStorage.setItem('calMode', 'month'); calendar(); };
$('#calWeek').onclick = () => { state.calMode = 'week'; localStorage.setItem('calMode', 'week'); if (!state.weekStart) state.weekStart = weekStartOf(today); calendar(); };
$('#addProject').onclick = onAddProject;
$('#familyBody').addEventListener('click', handleFamilyAction);
$('#familyBody').addEventListener('keydown', e => {
  if (e.target.id === 'joinCode' && e.key === 'Enter') { e.preventDefault(); $('#joinFamily')?.click(); }
});
$('#refreshMarket').onclick = loadMarket;
$('#tickerRefresh').onclick = refreshTicker;
$('#dayDialogClose').onclick = closeDayDialog;
$('#dayDialogAdd').onclick = () => {
  const iso = state.selectedDate;
  closeDayDialog();
  openTaskDialog('add');
  if (iso) $('#date').value = iso;
  $('#title').focus();
};
$('#dayDialogList').addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'dt-toggle') {
    await toggleTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  if (e.target.dataset.action === 'dt-del') {
    await removeTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  const edit = e.target.closest('[data-action="dt-edit"]');
  if (!edit) return;
  closeDayDialog();
  editTask(edit.dataset.id);
});
$('#projectDialogClose').onclick = closeProjectDialog;
$('#projectDialogList').addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'dt-toggle') {
    await toggleTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  if (e.target.dataset.action === 'dt-del') {
    await removeTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  const edit = e.target.closest('[data-action="dt-edit"]');
  if (!edit) return;
  closeProjectDialog();
  editTask(edit.dataset.id);
});
$('#projectsView').addEventListener('click', (e) => {
  const btn = e.target.closest('.project-btn');
  if (!btn) return;
  openProjectDialog(btn.dataset.project);
});
// 검색
$('#searchBtn').onclick = openSearchDialog;
$('#searchClose').onclick = closeSearchDialog;
$('#searchInput').addEventListener('input', (e) => renderSearchResults(e.target.value));
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearchDialog(); });
$('#searchResults').addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'dt-toggle') {
    await toggleTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  if (e.target.dataset.action === 'dt-del') {
    await removeTask(e.target.dataset.id);
    refreshOpenDialogs();
    return;
  }
  const edit = e.target.closest('[data-action="dt-edit"]');
  if (!edit) return;
  closeSearchDialog();
  editTask(edit.dataset.id);
});
// 음성 입력
$('#micBtn').onclick = startVoiceInput;
// 저녁 배너의 "내일로 넘기기" (동적으로 생기므로 위임)
$('#dueAlerts').addEventListener('click', (e) => {
  if (e.target.id === 'pushToTomorrow') pushOverdueToTomorrow();
});
$('#reactionsClose').onclick = closeReactionsDialog;
$('#reactionsPalette').addEventListener('click', async (e) => {
  const btn = e.target.closest('.react-cell');
  if (!btn) return;
  const taskId = $('#reactionsTaskId').value;
  await toggleReaction(taskId, btn.dataset.emoji);
  openReactionsFor(taskId);   // refresh palette state
  render();                    // refresh task rows
});
// ---- 아이디어 노트 ----
$('#noteSearch').addEventListener('input', renderNotesCard);
$('#noteList').addEventListener('click', e => {
  const b = e.target.closest('[data-action="open-note-id"]');
  if (b) openNote(b.dataset.id, true);
});
$('#noteDialog').addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'open-note-id') openNote(b.dataset.id, true);
  if (b.dataset.action === 'open-note') openNoteByTitle(b.dataset.title);
  if (b.dataset.action === 'preview-image') openImagePreview(b.dataset.url, b.dataset.name);
});
$('#noteTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setNoteTab(b.dataset.tab); });
$('#noteFileAdd').onclick = () => $('#noteFileInput').click();
$('#noteFileInput').addEventListener('change', onNoteFilesPicked);
$('#noteEditFiles').addEventListener('click', onEditFilesClick);
$('#noteEdit').addEventListener('change', e => { if (e.target.name === 'kind') onKindChange(); });
$('#imgClose').onclick = closeImagePreview;
$('#imgDialog').addEventListener('click', e => { if (e.target === e.currentTarget) closeImagePreview(); }); // 바깥(backdrop) 탭
$('#noteBack').onclick = goBackNote;
$('#noteClose').onclick = closeNoteDialog;
$('#noteDeleteBtn').onclick = onDeleteCurrentNote;
$('#noteDialog').addEventListener('close', () => { state.noteStack = []; });
$('#noteAddBtn').onclick = () => openNoteEditor(null, state.noteTab);
$('#noteEditBtn').onclick = () => openNoteEditor(currentNoteId());
$('#noteEdit').addEventListener('submit', onNoteFormSubmit);
$('#noteCancel').onclick = cancelNoteEdit;
$('#noteBody').addEventListener('input', onNoteBodyInput);
$('#noteBody').addEventListener('click', onNoteBodyInput);
$('#noteBody').addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) onNoteBodyInput(); });
$('#noteBody').addEventListener('keydown', onNoteBodyKeydown);
// 즉시 숨기지 않는다 — iOS Safari는 팝업 항목 탭 때 blur가 click보다 먼저 와서 mention이 지워지면 선택이 죽는다.
// 잠깐 뒤 포커스가 textarea로 안 돌아왔을 때만 닫는다(pickMention은 끝에 ta.focus()로 돌아온다).
$('#noteBody').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('#noteBody')) hideMention(); }, 200));
$('#noteMention').addEventListener('mousedown', e => e.preventDefault()); // textarea 포커스 유지
$('#noteMention').addEventListener('click', onMentionClick);

sb.auth.onAuthStateChange((_event, session) => { if (session && !state.user) start(); });
start();
// 투자 지표 관심 목록 편집
$('#watchEditBtn').onclick = openWatchDialog;
$('#watchClose').onclick = closeWatchDialog;
$('#watchReset').onclick = onWatchReset;
$('#watchQuery').addEventListener('input', onWatchQueryInput);
$('#watchDialog').addEventListener('click', onWatchDialogClick);
