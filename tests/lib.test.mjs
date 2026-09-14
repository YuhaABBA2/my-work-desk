import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iso, parseIso, occurrenceDates, repeatLabel, esc, sortTasks, mergeProjectNames, splitSeriesEdit,
  FIXED_PROJECTS, PROJECT_DEFAULTS, projectColor, sortProjects, dueDate, spansDay, daysBetween,
  dueState, shiftEndDate, fmtMd, isPersonalTask,
  CODE_ALPHABET, familyCodeFrom, isValidFamilyCode, familyIdFor, isFamilyProject, authorLabel, rpcErrorMessage,
  normTitle, noteLinks, noteBacklinks, renameNoteLinks, isValidNoteTitle
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

test('occurrenceDates: yearly (양력) 은 같은 월·일', () => {
  assert.deepEqual(occurrenceDates('2026-03-15', 'yearly', 3), ['2026-03-15', '2027-03-15', '2028-03-15']);
});

test('occurrenceDates: back 매개변수는 이전 회차를 앞에 붙인다', () => {
  assert.deepEqual(
    occurrenceDates('2026-09-14', 'weekly', 2, 2),
    ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']
  );
  assert.deepEqual(
    occurrenceDates('2026-03-15', 'yearly', 2, 3),
    ['2023-03-15', '2024-03-15', '2025-03-15', '2026-03-15', '2027-03-15']
  );
});

test('occurrenceDates: yearly-lunar 은 같은 음력일에 해당하는 양력', () => {
  // 2026-09-13 은 음력 8/3. 2027 의 음력 8/3 은 2027-09-03. 2028 의 음력 8/3 은 2028-09-20.
  const got = occurrenceDates('2026-09-13', 'yearly-lunar', 3);
  assert.equal(got[0], '2026-09-13');
  assert.equal(got.length, 3);
  // 각 결과의 음력 (M,D) 은 같아야 한다.
  const fmt = new Intl.DateTimeFormat('ko-u-ca-chinese', { month: 'numeric', day: 'numeric' });
  const lp = (s) => { const [y,m,d]=s.split('-').map(Number); const p=fmt.formatToParts(new Date(y,m-1,d)); return {M:p.find(x=>x.type==='month')?.value, D:p.find(x=>x.type==='day')?.value}; };
  const first = lp(got[0]);
  for (const s of got) assert.deepEqual(lp(s), first);
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
  assert.equal(projectColor('개인 일정'), '#f0730a');
  assert.equal(projectColor('가족 일정'), '#2f7a3d');
  assert.equal(projectColor('가족일정'), '#2f7a3d');
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

test('familyCodeFrom: 6자, 알파벳 내 문자만, 같은 바이트 → 같은 코드', () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(familyCodeFrom([0, 1, 2, 3, 4, 5]), 'ABCDEF');
  assert.equal(familyCodeFrom([255, 255, 255, 255, 255, 255]), '999999');
  assert.equal(familyCodeFrom(new Uint8Array([32, 33, 34, 35, 36, 37, 99, 100])), 'ABCDEF');
  const c = familyCodeFrom([7, 77, 177, 200, 13, 31]);
  assert.equal(c.length, 6);
  assert.ok([...c].every(ch => CODE_ALPHABET.includes(ch)));
  assert.ok(!/[01OI]/.test(CODE_ALPHABET));
});

test('isValidFamilyCode', () => {
  assert.equal(isValidFamilyCode('abc234'), true);
  assert.equal(isValidFamilyCode(' ABC234 '), true);
  assert.equal(isValidFamilyCode('ABC23'), false);
  assert.equal(isValidFamilyCode('ABC-234'), false);
  assert.equal(isValidFamilyCode(''), false);
  assert.equal(isValidFamilyCode(null), false);
});

test('isFamilyProject: 띄어쓰기 있든 없든 인식', () => {
  assert.equal(isFamilyProject('가족 일정'), true);
  assert.equal(isFamilyProject('가족일정'), true);
  assert.equal(isFamilyProject('개인 일정'), false);
  assert.equal(isFamilyProject(null), false);
});

test('familyIdFor: 가족 프로젝트이거나 사용자가 공유 켰을 때만 id', () => {
  const fam = { id: 'f1' };
  assert.equal(familyIdFor('가족 일정', fam), 'f1');
  assert.equal(familyIdFor('가족일정', fam), 'f1');
  assert.equal(familyIdFor('가족 일정', null), null);
  assert.equal(familyIdFor('개인 일정', fam), null);
  assert.equal(familyIdFor('개인 일정', fam, true), 'f1');   // 공유 태그 켬
  assert.equal(familyIdFor('개인 일정', null, true), null);   // 가족 없으면 무시
  assert.equal(familyIdFor(null, fam), null);
});

test('authorLabel: 내 것/가족 아님은 빈 문자열, 남의 가족 업무는 이름, 없으면 가족', () => {
  const members = [{ userId: 'me', name: '지수' }, { userId: 'w', name: '아내' }];
  assert.equal(authorLabel({ familyId: null, userId: 'w' }, 'me', members), '');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'me' }, 'me', members), '');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'w' }, 'me', members), '아내');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'gone' }, 'me', members), '가족');
  assert.equal(authorLabel({ familyId: 'f1', userId: 'w' }, 'me', []), '가족');
});

test('rpcErrorMessage', () => {
  assert.equal(rpcErrorMessage({ message: 'CODE_NOT_FOUND' }), '코드를 찾을 수 없습니다.');
  assert.equal(rpcErrorMessage({ message: 'P0001: ALREADY_MEMBER' }), '이미 가족에 속해 있습니다.');
  assert.equal(rpcErrorMessage({ message: 'network down' }), 'network down');
  assert.equal(rpcErrorMessage(null), '요청을 처리하지 못했습니다.');
});

// "내 업무" 판정 (2026-09-14, 회사 업무에 "가족과 공유"를 켜자 오늘 목록·배너·카운트에서 사라진 결함):
// 공유는 캘린더에서 같이 보이게 하는 것뿐이고, 내 업무는 그대로 내 프로세스를 탄다.
// 가족 프로젝트 건과 가족이 만든 공유 건만 내 목록에서 뺀다.
test('isPersonalTask: 공유 안 한 내 업무 → true', () => {
  assert.equal(isPersonalTask({ project: '회사 업무', familyId: null, userId: 'me' }, 'me'), true);
});

test('isPersonalTask: 회사 업무에 가족과 공유를 켜도 내가 만든 거면 true', () => {
  assert.equal(isPersonalTask({ project: '회사 업무', familyId: 'fam1', userId: 'me' }, 'me'), true);
});

test('isPersonalTask: 가족이 만든 공유 업무는 false', () => {
  assert.equal(isPersonalTask({ project: '회사 업무', familyId: 'fam1', userId: 'spouse' }, 'me'), false);
});

test('isPersonalTask: 가족 일정 프로젝트는 누가 만들었든 false (가족 카드로 간다)', () => {
  assert.equal(isPersonalTask({ project: '가족 일정', familyId: 'fam1', userId: 'me' }, 'me'), false);
  assert.equal(isPersonalTask({ project: '가족일정', familyId: 'fam1', userId: 'spouse' }, 'me'), false);
});

test('isPersonalTask: 가족이 없는 사용자의 가족 일정 업무(familyId null)는 내 업무로 남는다', () => {
  assert.equal(isPersonalTask({ project: '가족 일정', familyId: null, userId: 'me' }, 'me'), true);
});

test('isPersonalTask: 로그인 전(myId 없음)엔 공유 업무를 내 것으로 치지 않는다', () => {
  assert.equal(isPersonalTask({ project: '회사 업무', familyId: 'fam1', userId: undefined }, undefined), false);
});

// ---- 아이디어 노트: 링크 ----
test('noteLinks: [[제목]]을 순서대로, 중복(대소문자·공백 무시) 제거, 빈 링크 제외', () => {
  assert.deepEqual(noteLinks('a [[여신 아이디어]] b [[ 여신 아이디어 ]] c [[Hub]] [[hub]] [[ ]] d'), ['여신 아이디어', 'Hub']);
  assert.deepEqual(noteLinks(''), []);
  assert.deepEqual(noteLinks(null), []);
});

test('noteBacklinks: 나를 가리키는 노트만, 자기 자신은 제외', () => {
  const notes = [
    { id: '1', title: '허브', body: '[[A]] [[b]]' },
    { id: '2', title: 'A', body: '[[허브]] [[A]]' },
    { id: '3', title: 'B', body: '없음' }
  ];
  assert.deepEqual(noteBacklinks('a', notes).map(n => n.id), ['1']);
  assert.deepEqual(noteBacklinks('허브', notes).map(n => n.id), ['2']);
  assert.deepEqual(noteBacklinks('B', notes), []);
});

test('renameNoteLinks: 대소문자 무시로 치환, 다른 링크는 그대로', () => {
  assert.equal(renameNoteLinks('x [[old]] y [[OLD ]] z [[other]]', 'Old', 'New'), 'x [[New]] y [[New]] z [[other]]');
  assert.equal(renameNoteLinks('', 'a', 'b'), '');
});

test('isValidNoteTitle: 1~100자, [[ ]] 금지', () => {
  assert.equal(isValidNoteTitle('여신 아이디어'), true);
  assert.equal(isValidNoteTitle('   '), false);
  assert.equal(isValidNoteTitle('a]]b'), false);
  assert.equal(isValidNoteTitle('[[a'), false);
  assert.equal(isValidNoteTitle('x'.repeat(101)), false);
});
