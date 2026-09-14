import { $ } from './ui.js';
import { state } from './state.js';
import { esc, indexDelta, fmtIndex, krxSearch, WATCHLIST_MAX } from './lib.js';
import { sparkline } from './market.js';
import { setWatchlist } from './settings.js';

// 투자 지표 카드 위쪽의 실시간 타일 + 관심 목록 편집.
// 시세는 pig-farm-log 의 공개 프록시(/api/market/quotes, Yahoo 60초 캐시)에서 받는다.
// 카드가 보이고 탭이 앞에 있는 동안 60초마다 갱신, 숨겨지면 멈춘다.

const API = 'https://masan-farm.vercel.app/api/market';
const INTERVAL_MS = 60_000;
const UP = '#c44536';

let timer = null;
let lastItems = new Map(); // symbol → item (갱신 실패 시 이전 값 유지)
let krxList = null;        // krx-list.json (편집창에서 처음 검색할 때 내려받음)
let searchSeq = 0;

function setStatus(msg) { const el = $('#tickerStatus'); if (el) el.textContent = msg; }

function tileHTML(w, it) {
  if (!it || it.error) {
    return `<div class="tk flat"><div class="tk-name">${esc(w.name)}</div><div class="tk-price">—</div><div class="tk-delta hint">${it ? '조회 실패' : '불러오는 중…'}</div></div>`;
  }
  const d = indexDelta(it.price, it.prevClose);
  const cls = d?.cls || 'flat';
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '·';
  const delta = d ? `${arrow}${fmtIndex(Math.abs(d.diff), w.symbol)} ${d.pct > 0 ? '+' : ''}${d.pct.toFixed(2)}%` : '-';
  const color = cls === 'up' ? UP : cls === 'down' ? 'var(--blue)' : 'var(--muted)';
  return `<div class="tk ${cls}"><div class="tk-name">${esc(w.name)}</div><div class="tk-price">${fmtIndex(it.price, w.symbol)}</div><div class="tk-delta">${delta}</div>${sparkline(it.spark, color)}</div>`;
}

function renderTiles() {
  const grid = $('#tickerGrid');
  if (!grid) return;
  grid.innerHTML = state.settings.watchlist.map(w => tileHTML(w, lastItems.get(w.symbol))).join('');
}

async function refresh() {
  const list = state.settings.watchlist;
  if (!list.length) return;
  try {
    const res = await fetch(`${API}/quotes?symbols=${encodeURIComponent(list.map(w => w.symbol).join(','))}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { items } = await res.json();
    for (const it of items || []) lastItems.set(it.symbol, it);
    renderTiles();
    setStatus(`실시간 지표 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 갱신 · 1분마다`);
  } catch {
    renderTiles();
    setStatus('지표를 불러오지 못했습니다. 잠시 후 다시 시도합니다.');
  }
}

function visible() {
  const card = $('.investment-card');
  return !!card && !card.hidden && document.visibilityState === 'visible';
}

export function startTicker() {
  stopTicker();
  renderTiles(); // 탭이 뒤에 있어도 골격은 그려 둔다 — 앞으로 오면 visibilitychange 가 채운다
  if (!visible()) return;
  refresh();
  timer = setInterval(refresh, INTERVAL_MS);
}

export function stopTicker() {
  if (timer) { clearInterval(timer); timer = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startTicker(); else stopTicker();
});

// ── 편집 다이얼로그 ─────────────────────────────────────────────
function inList(symbol) { return state.settings.watchlist.some(w => w.symbol === symbol); }

function renderWatchList() {
  const box = $('#watchList');
  const list = state.settings.watchlist;
  box.innerHTML = list.map(w => `<div class="watch-row"><div class="watch-row-main"><b>${esc(w.name)}</b><span class="hint">${esc(w.symbol)}</span></div><button type="button" class="text-button watch-del" data-symbol="${esc(w.symbol)}" aria-label="삭제">✕</button></div>`).join('');
  const full = list.length >= WATCHLIST_MAX;
  const q = $('#watchQuery');
  q.disabled = full;
  q.placeholder = full ? `최대 ${WATCHLIST_MAX}개입니다. 하나를 지우고 추가하세요.` : '종목명·코드·영문 티커 (삼성전자, 005930, NVDA)';
  $('#watchReset').hidden = !state.settings.watchlistCustom;
}

function renderResults(items, note) {
  const box = $('#watchResults');
  if (note) { box.innerHTML = `<div class="hint">${esc(note)}</div>`; return; }
  box.innerHTML = items.map(r => {
    const dup = inList(r.symbol);
    return `<button type="button" class="watch-hit" data-symbol="${esc(r.symbol)}" data-name="${esc(r.name)}" ${dup ? 'disabled' : ''}><b>${esc(r.name)}</b><span class="hint">${esc(r.symbol)}${r.exch ? ' · ' + esc(r.exch) : ''}${dup ? ' · 추가됨' : ''}</span></button>`;
  }).join('') || '<div class="hint">검색 결과가 없습니다.</div>';
}

async function loadKrx() {
  if (krxList) return krxList;
  const res = await fetch('./krx-list.json');
  krxList = res.ok ? await res.json() : [];
  return krxList;
}

async function search(q) {
  const seq = ++searchSeq;
  q = q.trim();
  if (!q) { $('#watchResults').innerHTML = ''; return; }
  const korean = /[가-힣]/.test(q) || /^\d/.test(q);
  try {
    let items;
    if (korean) {
      items = krxSearch(await loadKrx(), q);
    } else {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
      items = res.ok ? (await res.json()).items || [] : [];
    }
    if (seq === searchSeq) renderResults(items);
  } catch {
    if (seq === searchSeq) renderResults([], '검색에 실패했습니다.');
  }
}

let debounce = null;
export function onWatchQueryInput(e) {
  clearTimeout(debounce);
  debounce = setTimeout(() => search(e.target.value), 200);
}

async function save(list) {
  const err = await setWatchlist(list);
  if (err) { alert(err.message || '관심 목록을 저장하지 못했습니다.'); return false; }
  renderWatchList();
  if ($('#watchQuery').value.trim()) search($('#watchQuery').value); // "추가됨" 표시 갱신
  startTicker();
  return true;
}

export async function onWatchDialogClick(e) {
  const hit = e.target.closest('.watch-hit');
  if (hit && !hit.disabled) {
    await save([...state.settings.watchlist, { symbol: hit.dataset.symbol, name: hit.dataset.name }]);
    return;
  }
  const del = e.target.closest('.watch-del');
  if (del) {
    const next = state.settings.watchlist.filter(w => w.symbol !== del.dataset.symbol);
    // 마지막 하나를 지우면 저장값이 빈 배열이 되어 기본 목록으로 돌아간다 — 의도적으로 기본값 복귀와 같게 둔다.
    await save(next.length ? next : null);
  }
}

export async function onWatchReset() {
  if (!confirm('관심 목록을 기본 7종으로 되돌릴까요?')) return;
  await save(null);
}

export function openWatchDialog() {
  renderWatchList();
  $('#watchResults').innerHTML = '';
  $('#watchQuery').value = '';
  const d = $('#watchDialog');
  if (!d.open) d.showModal();
}

export function closeWatchDialog() { const d = $('#watchDialog'); if (d.open) d.close(); }
