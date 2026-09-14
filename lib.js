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
export function addYears(d, n) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }

// 양력 iso → { M, D } 음력 (한자력, Chinese calendar in ICU).
const _lunarFmt = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
  ? new Intl.DateTimeFormat('ko-u-ca-chinese', { month: 'numeric', day: 'numeric' })
  : null;
export function lunarParts(iso) {
  if (!_lunarFmt) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const p = _lunarFmt.formatToParts(new Date(y, m - 1, d));
  const M = p.find(x => x.type === 'month')?.value;
  const D = p.find(x => x.type === 'day')?.value;
  return (M && D) ? { M, D } : null;
}

// 주어진 양력 년도 안에서 (lunarM, lunarD) 에 해당하는 양력 날짜(iso). 없으면 null.
// 브루트 포스로 365일을 훑는다 (save 시 몇 번만 호출).
export function solarForLunarInYear(year, lunarM, lunarD) {
  if (!_lunarFmt) return null;
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const p = _lunarFmt.formatToParts(new Date(year, m, d));
      const M = p.find(x => x.type === 'month')?.value;
      const D = p.find(x => x.type === 'day')?.value;
      if (M === String(lunarM) && D === String(lunarD)) return iso(new Date(year, m, d));
    }
  }
  return null;
}
export function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
export function pri(p) { return p === 'high' ? '중요' : p === 'middle' ? '보통' : '여유'; }
export function sortTasks(a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); }

export function repeatLabel(repeat) {
  return repeat === 'daily' ? '매일'
    : repeat === 'weekly' ? '매주'
    : repeat === 'monthly' ? '매월'
    : repeat === 'yearly' ? '매년'
    : repeat === 'yearly-lunar' ? '매년 (음력)'
    : '';
}

export function occurrenceDates(startIso, repeat, count, back = 0) {
  if (repeat === 'none') return [startIso];
  const start = parseIso(startIso);
  const forward = Math.max(1, count);
  const backward = Math.max(0, Number(back) || 0);
  // 회차별 offset: -backward … -1, 0, 1 … forward-1 (총 backward+forward 개, 시간 순).
  const offsets = [];
  for (let i = -backward; i < forward; i++) offsets.push(i);
  // 음력 매년: 시작일의 음력 (M,D) 을 뽑아 매년 그 음력에 해당하는 양력 날짜.
  if (repeat === 'yearly-lunar') {
    const lp = lunarParts(startIso);
    if (!lp) return [startIso];
    const startYear = start.getFullYear();
    return offsets.map(i => solarForLunarInYear(startYear + i, lp.M, lp.D) || startIso);
  }
  return offsets.map(i => {
    if (repeat === 'daily') return iso(addDays(start, i));
    if (repeat === 'weekly') return iso(addDays(start, i * 7));
    if (repeat === 'monthly') return iso(addMonths(start, i));
    if (repeat === 'yearly') return iso(addYears(start, i));
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

// "내 업무" 판정 — 오늘 해야 할 일·이번 주 마감·남은 업무 카운트·마감 임박 배너의 모집단.
// "가족과 공유"는 캘린더에서 같이 보이게 하는 표시일 뿐, 내 업무를 가족 일정으로 바꾸지 않는다.
// 빠지는 건 두 가지뿐: 가족에 묶인 가족 일정 프로젝트(가족 카드로 간다) · 가족이 만든 공유 업무.
// 가족이 없는 사용자의 '가족 일정' 업무는 familyId가 null이라 내 업무로 남는다 — 가족 카드가 숨겨져 있어
// 여기서마저 빼면 어디에도 안 보인다 (가족을 만들면 family.js가 소급 태그해 카드로 넘어간다).
// (2026-09-14: 회사 업무에 공유를 켜자 오늘 목록·배너에서 사라져 캘린더에만 남던 결함)
export function isPersonalTask(t, myId) {
  if (!t.familyId) return true;
  if (isFamilyProject(t.project)) return false;
  return !!myId && t.userId === myId;
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

// ---- 아이디어 노트 ----
// 링크 문법은 본문 안의 [[제목]] 하나. 링크 표는 없고 노트 전체를 훑어 연결·백링크를 계산한다.
const LINK_RE = /\[\[([^\[\]]+?)\]\]/g;

export function normTitle(s) { return String(s || '').trim().toLowerCase(); }

export function noteLinks(body) {
  const out = [], seen = new Set();
  for (const m of String(body || '').matchAll(LINK_RE)) {
    const t = m[1].trim();
    const k = normTitle(t);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  return out;
}

export function noteBacklinks(title, notes) {
  const k = normTitle(title);
  return (notes || []).filter(n => normTitle(n.title) !== k && noteLinks(n.body).some(l => normTitle(l) === k));
}

export function renameNoteLinks(body, oldTitle, newTitle) {
  const k = normTitle(oldTitle);
  return String(body || '').replace(LINK_RE, (m, t) => normTitle(t) === k ? `[[${newTitle}]]` : m);
}

export function isValidNoteTitle(title) {
  const t = String(title || '').trim();
  // 대괄호는 링크 문법과 충돌 — 하나만 있어도 [[제목]]으로 못 가리킨다
  return t.length >= 1 && t.length <= 100 && !/[\[\]]/.test(t);
}

// 커서 앞의 "@검색어". @는 줄 시작이나 공백 뒤에서만(이메일 주소를 건드리지 않는다), 줄바꿈을 넘지 않는다.
export function mentionQuery(text, caret) {
  const s = String(text || '').slice(0, caret);
  const at = s.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(s[at - 1])) return null;
  const query = s.slice(at + 1);
  if (query.includes('\n')) return null;
  return { start: at, query };
}

export function applyMention(text, start, caret, title) {
  const s = String(text || '');
  const ins = `[[${title}]] `;
  return { text: s.slice(0, start) + ins + s.slice(caret), caret: start + ins.length };
}

export function searchNotes(notes, q) {
  const k = String(q || '').trim().toLowerCase();
  return (notes || [])
    .filter(n => !k || String(n.title || '').toLowerCase().includes(k) || String(n.body || '').toLowerCase().includes(k))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function renderNoteBody(body, titles) {
  const s = String(body || '');
  let out = '', last = 0;
  for (const m of s.matchAll(LINK_RE)) {
    out += esc(s.slice(last, m.index));
    const t = m[1].trim();
    out += titles.has(normTitle(t))
      ? `<button type="button" class="note-link" data-action="open-note" data-title="${esc(t)}">${esc(t)}</button>`
      : `<span class="note-link broken">${esc(t)}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(s.slice(last));
  return out.replace(/\n/g, '<br>');
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtMdDow(isoStr) {
  return `${fmtMd(isoStr)}(${DOW[parseIso(isoStr).getDay()]})`;
}

// 양돈 시세 표시용 계열. 토요일처럼 경매 두수가 극히 적은 날(30두 등)은 평균이 널뛰어 헤드라인·전일 대비·그래프를
// 망치므로 minHead 미만인 날은 뺀다. 두수 미상(null)은 옛 백필 행이라 남긴다.
export function filterPigSeries(rows, minHead = 300) {
  return (rows || []).filter(r => r.head_count == null || r.head_count >= minHead);
}

// ── 투자 지표 관심 목록 ─────────────────────────────────────────────
export const DEFAULT_WATCHLIST = Object.freeze([
  { symbol: '^KS11', name: '코스피' },
  { symbol: '^KQ11', name: '코스닥' },
  { symbol: '^SOX', name: '필라델피아 반도체' },
  { symbol: '^VIX', name: 'VIX' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: 'KRW=X', name: '달러/원' },
  { symbol: 'JPY=X', name: '달러/엔' },
].map(Object.freeze));
export const WATCHLIST_MAX = 20;

// 등락. prevClose 가 없거나 0이면 비교 불가 → null.
export function indexDelta(price, prevClose) {
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0) return null;
  const diff = Math.round((price - prevClose) * 100) / 100;
  const pct = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
  return { diff, pct, cls: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}

// 값 표시. 한국 주식(.KS/.KQ)은 원 단위 정수, 나머지(지수·환율)는 소수 2자리.
export function fmtIndex(v, symbol) {
  if (!Number.isFinite(v)) return '-';
  const krStock = /\.(KS|KQ)$/i.test(String(symbol || ''));
  const digits = krStock ? 0 : 2;
  return v.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// KRX 목록([이름, 코드, 'KS'|'KQ']) 검색. 이름 부분일치(대소문자 무시) 우선, 코드 전방일치 다음.
export function krxSearch(list, q, limit = 8) {
  const k = String(q || '').trim().toLowerCase();
  if (!k) return [];
  const byName = [], byCode = [];
  for (const [name, code, mkt] of list || []) {
    if (name.toLowerCase().includes(k)) byName.push({ symbol: `${code}.${mkt}`, name });
    else if (code.toLowerCase().startsWith(k)) byCode.push({ symbol: `${code}.${mkt}`, name });
    if (byName.length >= limit) break;
  }
  return byName.concat(byCode).slice(0, limit);
}

// work_settings.market_symbols 저장값 → 안전한 목록. 이상하면 기본 목록.
export function normalizeWatchlist(v) {
  if (!Array.isArray(v)) return DEFAULT_WATCHLIST;
  const seen = new Set(), out = [];
  for (const it of v) {
    const symbol = typeof it?.symbol === 'string' ? it.symbol.trim() : '';
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : symbol });
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out.length ? out : DEFAULT_WATCHLIST;
}
