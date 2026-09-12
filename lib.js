// DOM·Supabase에 의존하지 않는 순수 함수. node --test 로 검증한다.

export const PROJECT_DEFAULTS = ['회사 업무', '개인 일정', '투자 · 자산', 'Work Station'];

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

// 1회 이관용: 이 기기의 localStorage 목록 + 업무에 실제 쓰인 이름. 순서 유지, 공백 정리, 중복 제거.
export function mergeProjectNames(local, fromTasks) {
  return [...new Set([...local, ...fromTasks].map(s => String(s || '').trim()).filter(Boolean))];
}
