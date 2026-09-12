import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, parseIso, occurrenceDates, repeatLabel, esc, sortTasks, mergeProjectNames, splitSeriesEdit } from '../lib.js';

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
});

test('splitSeriesEdit: task_date 만 분리하고 나머지는 그대로', () => {
  const base = { title: 'A', task_date: '2026-09-12', priority: 'high', project: null, task_time: '09:00', note: 'n', updated_at: 'u' };
  const { seriesFields, task_date } = splitSeriesEdit(base);
  assert.equal(task_date, '2026-09-12');
  assert.deepEqual(seriesFields, { title: 'A', priority: 'high', project: null, task_time: '09:00', note: 'n', updated_at: 'u' });
  assert.equal('task_date' in seriesFields, false);
});
