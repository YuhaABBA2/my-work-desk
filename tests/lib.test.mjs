import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iso, parseIso, occurrenceDates, repeatLabel, esc, sortTasks, mergeProjectNames, splitSeriesEdit,
  FIXED_PROJECTS, PROJECT_DEFAULTS, projectColor, sortProjects, dueDate, spansDay, daysBetween,
  dueState, shiftEndDate, fmtMd
} from '../lib.js';

test('parseIso → iso 왕복', () => {
  assert.equal(iso(parseIso('2026-09-12')), '2026-09-12');
  assert.equal(iso(parseIso('2026-01-01')), '2026-01-01');
});

test('occurrenceDates: none은 시작일 하나', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'none', 5), ['2026-09-12']);
});

test('occurrenceDates: daily/weekly/monthly', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'daily', 3), ['2026-09-12', '2026-09-13', '2026-09-14']);
  assert.deepEqual(occurrenceDates('2026-09-12', 'weekly', 3), ['2026-09-12', '2026-09-19', '2026-09-26']);
  assert.deepEqual(occurrenceDates('2026-01-31', 'monthly', 3), ['2026-01-31', '2026-03-03', '2026-03-31']);
});

test('occurrenceDates: count 최소 1', () => {
  assert.deepEqual(occurrenceDates('2026-09-12', 'daily', 0), ['2026-09-12']);
});

test('repeatLabel', () => {
  assert.equal(repeatLabel('daily'), '매일');
  assert.equal(repeatLabel('weekly'), '매주');
  assert.equal(repeatLabel('monthly'), '매월');
  assert.equal(repeatLabel('none'), '');
});

test('esc escapes html', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('sortTasks: 날짜 → 시간 순', () => {
  const a = { date: '2026-09-12', time: '09:00' };
  const b = { date: '2026-09-12', time: '' };
  const c = { date: '2026-09-11', time: '23:00' };
  assert.deepEqual([a, b, c].sort(sortTasks), [c, b, a]);
});

test('mergeProjectNames: 로컬 우선, 업무에서 온 이름 추가, 중복·빈값 제거', () => {
  assert.deepEqual(
    mergeProjectNames(['회사 업무', '개인 일정'], ['개인 일정', null, '  ', '농장', '회사 업무']),
    ['회사 업무', '개인 일정', '농장']
  );
  assert.deepEqual(mergeProjectNames([], []), []);
  assert.deepEqual(mergeProjectNames([' 공백 '], []), ['공백']);
  assert.deepEqual(mergeProjectNames(['a'.repeat(51), 'b'.repeat(50)], []), ['b'.repeat(50)]);
});

test('splitSeriesEdit: task_date 와 end_date 만 분리하고 나머지는 그대로', () => {
  const base = { title: 'A', task_date: '2026-09-12', end_date: '2026-09-14', priority: 'high', project: null, task_time: '09:00', remind_1h: true, remind_1d: false, note: 'n', updated_at: 'u' };
  const { seriesFields, task_date, end_date } = splitSeriesEdit(base);
  assert.equal(task_date, '2026-09-12');
  assert.equal(end_date, '2026-09-14');
  assert.deepEqual(seriesFields, { title: 'A', priority: 'high', project: null, task_time: '09:00', remind_1h: true, remind_1d: false, note: 'n', updated_at: 'u' });
  assert.equal('task_date' in seriesFields, false);
  assert.equal('end_date' in seriesFields, false);
});

test('FIXED_PROJECTS / PROJECT_DEFAULTS', () => {
  assert.deepEqual(FIXED_PROJECTS, ['회사 업무', '개인 일정', '가족 일정']);
  assert.deepEqual(PROJECT_DEFAULTS, FIXED_PROJECTS);
  assert.notEqual(PROJECT_DEFAULTS, FIXED_PROJECTS); // 복사본
});

test('projectColor: 고정 3색, 결정적, 미분류는 회색', () => {
  assert.equal(projectColor('회사 업무'), '#0a84ff');
  assert.equal(projectColor('개인 일정'), '#248a5b');
  assert.equal(projectColor('가족 일정'), '#f0730a');
  assert.equal(projectColor(null), '#6b7280');
  assert.equal(projectColor(''), '#6b7280');
  const a = projectColor('투자 · 자산');
  assert.equal(projectColor('투자 · 자산'), a);
  assert.match(a, /^#[0-9a-f]{6}$/);
  assert.ok(['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280'].includes(a));
});

test('sortProjects: 고정 3개가 정해진 순서로 앞, 나머지는 원래 순서', () => {
  assert.deepEqual(sortProjects(['Work Station', '가족 일정', '투자 · 자산', '개인 일정', '회사 업무']),
    ['회사 업무', '개인 일정', '가족 일정', 'Work Station', '투자 · 자산']);
  assert.deepEqual(sortProjects(['개인 일정']), ['개인 일정']);
  assert.deepEqual(sortProjects([]), []);
});

test('dueDate / spansDay', () => {
  const single = { date: '2026-09-14', endDate: null };
  const range = { date: '2026-09-14', endDate: '2026-09-16' };
  assert.equal(dueDate(single), '2026-09-14');
  assert.equal(dueDate(range), '2026-09-16');
  assert.equal(spansDay(single, '2026-09-14'), true);
  assert.equal(spansDay(single, '2026-09-15'), false);
  assert.equal(spansDay(range, '2026-09-13'), false);
  assert.equal(spansDay(range, '2026-09-14'), true);
  assert.equal(spansDay(range, '2026-09-15'), true);
  assert.equal(spansDay(range, '2026-09-16'), true);
  assert.equal(spansDay(range, '2026-09-17'), false);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-09-12', '2026-09-15'), 3);
  assert.equal(daysBetween('2026-09-15', '2026-09-12'), -3);
  assert.equal(daysBetween('2026-09-12', '2026-09-12'), 0);
});

test('dueState: 지남/오늘/진행중/N일/없음', () => {
  const today = '2026-09-12';
  assert.equal(dueState({ date: '2026-09-10', endDate: null }, today), 'past');
  assert.equal(dueState({ date: '2026-09-12', endDate: null }, today), 'today');
  assert.equal(dueState({ date: '2026-09-10', endDate: '2026-09-12' }, today), 'today');
  assert.equal(dueState({ date: '2026-09-10', endDate: '2026-09-14' }, today), 'ongoing');
  assert.equal(dueState({ date: '2026-09-12', endDate: '2026-09-14' }, today), 'ongoing');
  assert.equal(dueState({ date: '2026-09-14', endDate: null }, today), 'soon:2');
  assert.equal(dueState({ date: '2026-09-15', endDate: '2026-09-15' }, today), 'soon:3');
  assert.equal(dueState({ date: '2026-09-16', endDate: null }, today), '');
});

test('shiftEndDate: 기간 길이 유지, 종료일 없으면 null', () => {
  assert.equal(shiftEndDate('2026-09-14', '2026-09-16', '2026-09-21'), '2026-09-23');
  assert.equal(shiftEndDate('2026-09-14', null, '2026-09-21'), null);
  assert.equal(shiftEndDate('2026-09-14', '2026-09-14', '2026-10-01'), '2026-10-01');
});

test('fmtMd', () => {
  assert.equal(fmtMd('2026-09-04'), '9/4');
  assert.equal(fmtMd('2026-12-25'), '12/25');
});
