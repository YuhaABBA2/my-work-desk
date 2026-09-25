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
// 반복 시리즈의 지난 미완료 회차. 생신처럼 "그날 지나면 끝"인 반복은 완료 체크 없이도 접는다 —
// 남은 업무 카운트·마감 임박·저녁 "오늘 못 한 일"에서 뺀다. 캘린더·상세엔 "지남" 배지로 그대로 남는다.
export function isStaleRepeat(t, todayIso) { return !!t.seriesId && !t.done && dueDate(t) < todayIso; }
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
// 빠지는 건 두 가지뿐: 가족에 묶인 가족 일정 프로젝트(달력·프로젝트 관리에서 본다) · 가족이 만든 공유 업무.
// 가족이 없는 사용자의 '가족 일정' 업무는 familyId가 null이라 내 업무로 남는다 — 가족이 없으니
// 여기서마저 빼면 목록 어디에도 안 보인다 (가족을 만들면 family.js가 소급 태그해 가족 일정이 된다).
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

// ── 노트 종류·첨부 ─────────────────────────────────────────────
export const NOTE_KINDS = Object.freeze([
  { key: 'idea', label: '아이디어' },
  { key: 'memo', label: '메모' },
  { key: 'meeting', label: '회의록' },
].map(Object.freeze));

export function kindLabel(kind) {
  return (NOTE_KINDS.find(k => k.key === kind) || NOTE_KINDS[0]).label;
}

// 회의록을 새로 만들 때 본문에 미리 넣는 틀. 항목은 사용자 확정(일시·참석자·아젠다·내용).
export function noteTemplate(kind, todayIso) {
  if (kind !== 'meeting') return '';
  return `일시: ${fmtMdDow(todayIso)}\n참석자: \n아젠다: \n내용: \n`;
}

// 카드 탭 필터. 종류 컬럼이 없던 시절 노트(kind 없음)는 아이디어로 본다.
export function filterNotesByKind(notes, tab) {
  if (!tab || tab === 'all') return notes;
  return notes.filter(n => (n.kind || 'idea') === tab);
}

export function isImageMime(mime) { return /^image\//.test(String(mime || '')); }

export function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// storage 객체 키에 붙일 확장자. Supabase Storage 는 한글·공백·괄호가 든 키를 "Invalid key"로 거부하므로
// (2026-09-15 프로덕션에서 확인) 경로엔 uuid + 확장자만 쓰고 원래 파일명은 work_note_files.name 에만 둔다.
export function fileExt(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

// 위젯이 ?d=2026-09-23 처럼 날짜를 실어 보낸다. 달력에 없는 날짜(13월·2월 30일)는 통과시키지 않는다.
export function dateFromQuery(search) {
  const raw = new URLSearchParams(search || '').get('d');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return iso(parseIso(raw)) === raw ? raw : null;
}

// 아이폰 위젯(Scriptable) 코드에 내 위젯 주소를 끼운다. 템플릿은 widget/ios/home-desk.js.
// JSON.stringify 로 넣어 주소에 무엇이 들어 있어도 문자열 밖으로 새지 않는다.
export function iosWidgetScript(template, widgetUrl) {
  const slot = '"__WIDGET_URL__"';
  if (template.split(slot).length !== 2) throw new Error('위젯 코드 템플릿이 올바르지 않습니다');
  return template.replace(slot, () => JSON.stringify(widgetUrl));
}

// 달력 칸에 쓰는 짧은 공휴일 이름. 괄호 부분과 끝의 '연휴'를 뗀다 (대체공휴일 (추석) → 대체공휴일).
// 위젯 서버(pig-farm-log lib/widget-holidays.ts)도 같은 규칙이다 — 바꾸면 둘 다 고친다.
export function shortHolidayName(name) {
  return name.replace(/\s*\(.*\)\s*/, '').replace(/\s*연휴$/, '');
}

// 한 주(날짜 7개) 안의 공휴일 막대. 연휴처럼 같은 짧은 이름이 이어진 날들은 막대 하나로 묶는다
// (추석 추석 추석 → 24~26 막대 하나). 일정 막대와 같은 줄 배치에 맨 앞으로 들어간다.
// 위젯 서버(pig-farm-log lib/widget-calendar.ts weekSpanItems)도 같은 규칙이다.
export function holidaySpans(holidays, weekIsos) {
  const out = [];
  weekIsos.forEach((d, col) => {
    const name = holidays?.[d];
    if (!name) return;
    const label = shortHolidayName(name);
    const last = out[out.length - 1];
    if (last && last.label === label && last.endCol === col - 1) last.endCol = col;
    else out.push({ label, title: name, startCol: col, endCol: col });
  });
  return out;
}

// 마감 임박 배너 문구. 이름은 3개까지만 쓰고, 잘린 수를 "외 N건"으로 밝힌다
// (건수만 4건인데 이름이 3개면 하나가 사라진 것처럼 보인다).
export function dueBannerText(titles) {
  const shown = titles.slice(0, 3).join(', ');
  const rest = titles.length - 3;
  return `마감 임박 ${titles.length}건: ${shown}${rest > 0 ? ` 외 ${rest}건` : ''}`;
}

// 달력 넘기기 제스처. 가로로 충분히(60px) 빨리(0.7초 안) 밀었고 세로보다 확실히(1.5배) 가로면
// 'next'(왼쪽으로 밂)·'prev'(오른쪽), 아니면 null — 탭·세로 스크롤을 넘기기로 오해하지 않게.
export function swipeDirection(dx, dy, ms) {
  if (ms > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'prev';
}

// 접힌 「이번주 업무일정」 카드의 한 줄 요약. tasks 는 카드 목록과 같은 모집단(7일 안 미완료).
export function weekSummaryText(tasks, todayIso) {
  if (!tasks.length) return '7일 안에 처리할 일이 없습니다';
  const next = [...tasks].sort((a, b) => dueDate(a).localeCompare(dueDate(b)))[0];
  const diff = daysBetween(todayIso, dueDate(next));
  const when = diff <= 0 ? '오늘' : diff === 1 ? '내일' : diff === 2 ? '모레' : fmtMd(dueDate(next));
  return `${tasks.length}건 · 가장 가까운 마감: ${next.title} (${when})`;
}

// 접힌 「노트」 카드의 한 줄 요약 — 개수와 가장 최근에 고친 노트.
export function notesSummaryText(notes) {
  if (!notes.length) return '아직 노트가 없습니다';
  const latest = [...notes].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
  return `노트 ${notes.length}개 · 최근: ${latest.title}`;
}

// 화면 탭(일정 / 시세·지표). 시세 패널을 끈 사람은 탭이 없으니 늘 일정 —
// 켰을 때 시세 탭에 있다가 끈 사람이 빈 화면에 갇히지 않게 한다.
export function resolveView(saved, showMarket) {
  return showMarket && saved === 'market' ? 'market' : 'desk';
}
