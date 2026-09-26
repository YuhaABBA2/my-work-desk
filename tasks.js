import { sb } from './supabase.js';
import { state, today } from './state.js';
import { iso, addDays, sortTasks, occurrenceDates, splitSeriesEdit, shiftEndDate, dueDate, familyIdFor, daysBetween, parsePrepSteps, prepStepTasks } from './lib.js';
import { setPrepSteps } from './settings.js';
import { $, render, resetForm, fillEditForm, askSeriesScope, closeTaskDialog } from './ui.js';
import { loadReactions } from './reactions.js';

export async function load() {
  const { data, error } = await sb.from('work_tasks').select('*').order('task_date').order('task_time');
  if (error) return alert('업무 목록을 불러오지 못했습니다. Supabase 설정을 확인해 주세요.');
  state.tasks = data.map(x => ({
    id: x.id,
    title: x.title,
    date: x.task_date,
    priority: x.priority,
    project: x.project,
    time: x.task_time?.slice(0, 5) || '',
    note: x.note,
    done: x.done,
    seriesId: x.series_id || null,
    endDate: x.end_date || null,
    remind1h: !!x.remind_1h,
    remind1d: !!x.remind_1d,
    userId: x.user_id,
    familyId: x.family_id || null,
    leadDays: x.lead_days || null,
    waitingOn: x.waiting_on || null,
    bundleId: x.bundle_id || null
  }));
  await loadReactions();
  render();
}

function readForm() {
  const allDay = $('#allDay').checked;
  // 시간이 비어 있으면 체크 여부와 무관하게 하루종일이다. 하루종일이면 "1시간 전"은 의미가 없다.
  const task_time = allDay ? null : ($('#time').value || null);
  return {
    title: $('#title').value.trim(),
    task_date: $('#date').value,
    end_date: $('#endDate').value || null,
    priority: $('#priority').value,
    project: $('#project').value || null,
    family_id: familyIdFor($('#project').value || null, state.family, $('#shareFamily').checked),
    task_time,
    remind_1h: task_time ? $('#remind1h').checked : false,
    remind_1d: $('#remind1d').checked,
    note: $('#note').value.trim() || null,
    lead_days: Number($('#leadDays').value) || null,
    waiting_on: $('#waitingOn').value.trim() || null,
    updated_at: new Date().toISOString()
  };
}

export async function saveTask(e) {
  e.preventDefault();
  const base = readForm();
  if (base.end_date && base.end_date < base.task_date) return alert('종료일은 시작일보다 앞설 수 없습니다.');

  if (state.editId) {
    const current = state.tasks.find(t => t.id === state.editId);
    let scope = 'one';
    if (current?.seriesId) {
      scope = await askSeriesScope('edit');
      if (!scope) return;
    }
    if (scope === 'following') {
      const { seriesFields, task_date, end_date } = splitSeriesEdit(base);
      const r1 = await sb.from('work_tasks').update(seriesFields)
        .eq('series_id', current.seriesId).gte('task_date', current.date);
      if (r1.error) return alert('수정하지 못했습니다.');
      if (task_date !== current.date || end_date !== current.endDate) {
        const r2 = await sb.from('work_tasks').update({ task_date, end_date }).eq('id', state.editId);
        if (r2.error) { await load(); return alert('날짜를 수정하지 못했습니다.'); }
      }
    } else {
      const { error } = await sb.from('work_tasks').update(base).eq('id', state.editId);
      if (error) return alert('수정하지 못했습니다.');
      await moveBundle(current, base.task_date);
    }
    await load();
    closeTaskDialog();
    return;
  }

  const rawRepeat = $('#repeat').value;
  const isLunar = $('#isLunar')?.checked;
  const repeat = (rawRepeat === 'yearly' && isLunar) ? 'yearly-lunar' : rawRepeat;
  const count = repeat === 'none' ? 1 : Math.min(24, Math.max(1, Number($('#repeatCount').value || 1)));
  const back = repeat === 'none' ? 0 : Math.min(24, Math.max(0, Number($('#repeatBack')?.value || 0)));
  // 반복이면 시리즈 ID 하나를 모든 행에 붙인다. 회차 표시는 메모 대신 series_id 배지로 대신한다.
  const seriesId = repeat === 'none' ? null : crypto.randomUUID();
  const records = occurrenceDates(base.task_date, repeat, count, back).map(date => ({
    user_id: state.user.id,
    title: base.title,
    task_date: date,
    end_date: shiftEndDate(base.task_date, base.end_date, date),
    priority: base.priority,
    project: base.project,
    task_time: base.task_time,
    remind_1h: base.remind_1h,
    remind_1d: base.remind_1d,
    note: base.note,
    family_id: base.family_id,
    series_id: seriesId,
    lead_days: base.lead_days,
    waiting_on: base.waiting_on
  }));
  // 준비 단계 묶음: 반복 없는 일정에만. 본 일정과 단계들이 같은 bundle_id 를 가진다.
  // 오늘보다 이른 단계는 만들지 않는다(만들자마자 "지난 일" 이 되니까) — 남는 단계가 있을 때만 묶는다.
  const prepOn = repeat === 'none' && $('#prepOn').checked;
  const stepTasks = prepOn ? prepStepTasks(base.title, base.task_date, parsePrepSteps($('#prepSteps').value), iso(today)) : [];
  if (prepOn) setPrepSteps($('#prepSteps').value); // 다음에 다시 채운다 — 실패해도 일정 저장은 막지 않는다
  if (stepTasks.length) {
    const bundleId = crypto.randomUUID();
    records[0].bundle_id = bundleId;
    for (const s of stepTasks) {
      records.push({
        user_id: state.user.id, title: s.title, task_date: s.date, end_date: null,
        priority: base.priority, project: base.project, task_time: null,
        remind_1h: false, remind_1d: false, note: null, family_id: base.family_id,
        series_id: null, lead_days: null, waiting_on: null, bundle_id: bundleId,
      });
    }
  }
  const { error } = await sb.from('work_tasks').insert(records);
  if (error) return alert('저장하지 못했습니다. Supabase 테이블 설정을 확인해 주세요.');
  await load();
  closeTaskDialog();
}

// 준비 단계 묶음의 본 일정(묶음에서 가장 늦은 날) 날짜를 옮겼으면, 단계들도 같은 만큼 옮길지 묻는다.
async function moveBundle(current, newDate) {
  if (!current?.bundleId || newDate === current.date) return;
  const members = state.tasks.filter(t => t.bundleId === current.bundleId && t.id !== current.id);
  const isMain = members.every(t => t.date <= current.date);
  if (!isMain || !members.length) return;
  const delta = daysBetween(current.date, newDate);
  if (!confirm(`준비 단계 ${members.length}개도 ${delta > 0 ? delta + '일 뒤로' : -delta + '일 앞으로'} 같이 옮길까요?`)) return;
  for (const t of members) {
    const d = iso(addDays(new Date(t.date + 'T00:00:00'), delta));
    const { error } = await sb.from('work_tasks')
      .update({ task_date: d, end_date: shiftEndDate(t.date, t.endDate, d), updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (error) return alert('준비 단계를 다 옮기지 못했습니다. 새로고침 후 확인해 주세요.');
  }
}

export async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  const { error } = await sb.from('work_tasks').update({ done: !t.done, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('저장하지 못했습니다.');
  t.done = !t.done;
  render();
}

export function editTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) fillEditForm(t);
}

export async function removeTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  let query;
  if (t.seriesId) {
    const scope = await askSeriesScope('delete');
    if (!scope) return;
    query = scope === 'following'
      ? sb.from('work_tasks').delete().eq('series_id', t.seriesId).gte('task_date', t.date)
      : sb.from('work_tasks').delete().eq('id', id);
  } else {
    if (!confirm('이 업무를 삭제할까요?')) return;
    query = sb.from('work_tasks').delete().eq('id', id);
  }
  const { error } = await query;
  if (error) return alert('삭제하지 못했습니다.');
  await load();
}

export async function notifyDue() {
  const due = state.tasks.filter(t => !t.done && dueDate(t) <= iso(addDays(today, 3))).sort(sortTasks);
  if (!due.length) return alert('마감 임박 업무가 없습니다.');
  if (!('Notification' in window)) return alert('이 브라우저는 알림을 지원하지 않습니다.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return;
  new Notification('마감 임박 업무', { body: due.slice(0, 4).map(t => t.title).join(', ') });
}
