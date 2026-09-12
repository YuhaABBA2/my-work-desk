// DOM·Supabase에 의존하지 않는 순수 함수. node --test 로 검증한다.

export const FIXED_PROJECTS = ['회사 업무', '개인 일정', '가족 일정'];
export const PROJECT_DEFAULTS = [...FIXED_PROJECTS];

// 프로젝트 색은 저장하지 않고 이름에서 정한다. 고정 3개는 지정색, 나머지는 이름 해시로 팔레트에서.
export const PROJECT_COLORS = {
  '회사 업무': '#0a84ff',
  '개인 일정': '#f0730a',
  '가족 일정': '#2f7a3d',
  '가족일정': '#2f7a3d'
};
export const PALETTE = ['#7c5cff', '#d63384', '#0aa5a0', '#b8860b', '#6b7280'];
export const UNSORTED_COLOR = '#6b7280';

export function projectColor(name) {
  if (!name) return UNSORTED_COLOR;
  if (PROJECT_COLORS[name]) return PROJECT_COLORS[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// 고정 프로젝트가 정해진 순서로 앞, 나머지는 들어온 순서.
export function sortProjects(names) {
  const fixed = FIXED_PROJECTS.filter(n => names.includes(n));
  const rest = names.filter(n => !FIXED_PROJECTS.includes(n));
  return [...fixed, ...rest];
}

export function iso(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

// 'YYYY-MM-DD' 를 로컬 자정 Date 로. new Date('YYYY-MM-DD') 는 UTC 자정이라 KST 서쪽 시간대에서 하루가 밀린다.
export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
export function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
export function pri(p) { return p === 'high' ? '중요' : p === 'middle' ? '보통' : '여유'; }
export function sortTasks(a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); }

export function repeatLabel(repeat) {
  return repeat === 'daily' ? '매일' : repeat === 'weekly' ? '매주' : repeat === 'monthly' ? '매월' : '';
}

export function occurrenceDates(startIso, repeat, count) {
  if (repeat === 'none') return [startIso];
  const start = parseIso(startIso);
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    if (repeat === 'daily') return iso(addDays(start, i));
    if (repeat === 'weekly') return iso(addDays(start, i * 7));
    if (repeat === 'monthly') return iso(addMonths(start, i));
    return startIso;
  });
}

// "이후 모두" 수정: 시작일·종료일은 편집 중인 회차에만, 나머지 필드는 시리즈 전체에 적용한다.
export function splitSeriesEdit(base) {
  const { task_date, end_date, ...seriesFields } = base;
  return { seriesFields, task_date, end_date };
}

// 1회 이관용: 이 기기의 localStorage 목록 + 업무에 실제 쓰인 이름. 순서 유지, 공백 정리, 중복 제거.
export function mergeProjectNames(local, fromTasks) {
  return [...new Set([...local, ...fromTasks].map(s => String(s || '').trim()).filter(n => n && n.length <= 50))];
}

// ---- 기간 일정 ----
// 마감일: 종료일이 있으면 종료일, 없으면 시작일.
export function dueDate(t) { return t.endDate || t.date; }
export function spansDay(t, dayIso) { return t.date <= dayIso && dayIso <= dueDate(t); }
export function daysBetween(aIso, bIso) { return Math.round((parseIso(bIso) - parseIso(aIso)) / 86400000); }

// 배지 판정. 'past' 지남 · 'today' 오늘 마감 · 'ongoing' 시작했고 마감 전 · 'soon:N' N일 뒤 마감(≤3) · '' 그 외
export function dueState(t, todayIso) {
  const diff = daysBetween(todayIso, dueDate(t));
  if (diff < 0) return 'past';
  if (diff === 0) return 'today';
  if (t.date <= todayIso) return 'ongoing';
  if (diff <= 3) return `soon:${diff}`;
  return '';
}

// 반복 회차마다 같은 길이의 기간을 유지한다.
export function shiftEndDate(startIso, endIso, newStartIso) {
  if (!endIso) return null;
  return iso(addDays(parseIso(newStartIso), daysBetween(startIso, endIso)));
}

export function fmtMd(isoStr) {
  const [, m, d] = isoStr.split('-').map(Number);
  return `${m}/${d}`;
}

// ---- 가족 공유 ----
// 초대 코드 알파벳: 혼동되는 0 O 1 I 를 뺀 32자. 바이트 하나가 문자 하나로 대응된다(32 = 256/8, 편향 없음).
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function familyCodeFrom(bytes) {
  return Array.from(bytes).slice(0, 6).map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isValidFamilyCode(code) {
  return /^[A-Z0-9]{6}$/.test(String(code || '').trim().toUpperCase());
}

// 가족 프로젝트 판정. "가족 일정" 뿐 아니라 띄어쓰기 없는 "가족일정" 도 인정한다(기존 사용자 데이터).
export function isFamilyProject(name) {
  return name === '가족 일정' || name === '가족일정';
}

// 저장 규칙: 가족 프로젝트이거나 사용자가 "가족과 공유"를 켰고, 내가 가족에 속해 있을 때만 family_id 를 붙인다.
export function familyIdFor(project, family, shareOverride) {
  const share = isFamilyProject(project) || !!shareOverride;
  return share && family ? family.id : null;
}

// 가족 업무인데 내가 만든 게 아니면 작성자 이름. 목록에 없으면(나간 사람) "가족".
export function authorLabel(task, myId, members) {
  if (!task.familyId || task.userId === myId) return '';
  return members.find(m => m.userId === task.userId)?.name || '가족';
}

export function rpcErrorMessage(err) {
  const m = String(err?.message || '');
  if (m.includes('CODE_NOT_FOUND')) return '코드를 찾을 수 없습니다.';
  if (m.includes('ALREADY_MEMBER')) return '이미 가족에 속해 있습니다.';
  return m || '요청을 처리하지 못했습니다.';
}
