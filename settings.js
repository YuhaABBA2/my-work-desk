import { sb } from './supabase.js';
import { state } from './state.js';
import { normalizeWatchlist, rpcErrorMessage, iosWidgetScript } from './lib.js';

function defaults() { return { showMarket: false, showNotes: false, watchlist: normalizeWatchlist(null), watchlistCustom: false }; }

// 계정별 설정. 행이 없거나 조회 실패면 기본값(시세·투자·노트 모두 숨김, 관심 목록은 기본 7종).
export async function loadSettings() {
  const { data, error } = await sb.from('work_settings').select('show_market,show_notes,market_symbols').eq('user_id', state.user.id).maybeSingle();
  if (error) { state.settings = defaults(); return error; }
  const custom = Array.isArray(data?.market_symbols) && data.market_symbols.length > 0;
  state.settings = {
    showMarket: !!data?.show_market,
    showNotes: !!data?.show_notes,
    watchlist: normalizeWatchlist(data?.market_symbols),
    watchlistCustom: custom,
  };
  return null;
}

// upsert는 merge-duplicates라 보내지 않은 컬럼은 기존 값을 유지한다 — 각 함수는 자기 컬럼만 보낸다.
export async function setShowMarket(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_market: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showMarket = !!on;
  return null;
}

export async function setShowNotes(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_notes: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showNotes = !!on;
  return null;
}

// 관심 지표 목록. null 이면 기본 목록으로 되돌린다.
export async function setWatchlist(list) {
  const value = list == null ? null : normalizeWatchlist(list);
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, market_symbols: value, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.watchlist = normalizeWatchlist(value);
  state.settings.watchlistCustom = value != null;
  return null;
}

// ---------- 홈화면 위젯 주소 ----------
// 위젯은 세션이 없어 주소의 토큰으로만 신원을 확인한다(pig-farm-log /api/widget).
// 토큰 값은 서버(issue_widget_token)가 고른다. 계정당 1개 — 새로 만들면 옛 주소는 즉시 막힌다.
const WIDGET_API = 'https://masan-farm.vercel.app/api/widget';

function widgetUrlFor(token) {
  return `${WIDGET_API}?token=${encodeURIComponent(token)}`;
}

function showWidgetToken(token) {
  const none = document.getElementById('widgetNone');
  const have = document.getElementById('widgetHave');
  const out = document.getElementById('widgetUrl');
  if (!none || !have || !out) return;
  out.textContent = token ? widgetUrlFor(token) : '';
  none.hidden = !!token;
  have.hidden = !token;
}

// 아이폰 위젯 코드 템플릿. 설정 창을 열 때 미리 받아 둔다 —
// iOS 사파리는 클릭 뒤 await 를 한 번 거치면 클립보드 쓰기를 막는다.
let iosTemplate = null;

export async function loadWidgetToken() {
  const { data } = await sb.from('widget_tokens').select('token').maybeSingle();
  showWidgetToken(data?.token || null);
  if (!iosTemplate) {
    iosTemplate = await fetch('/widget/ios/home-desk.js', { cache: 'no-store' })
      .then(r => (r.ok ? r.text() : null)).catch(() => null);
  }
}

async function issueWidgetToken() {
  const { data, error } = await sb.rpc('issue_widget_token');
  if (error) { alert(rpcErrorMessage(error)); return; }
  showWidgetToken(data);
}

async function revokeWidgetToken() {
  const { error } = await sb.rpc('revoke_widget_token');
  if (error) { alert(rpcErrorMessage(error)); return; }
  showWidgetToken(null);
}

export function bindWidgetCard() {
  document.getElementById('widgetIssue')?.addEventListener('click', issueWidgetToken);
  document.getElementById('widgetReissue')?.addEventListener('click', issueWidgetToken);
  document.getElementById('widgetRevoke')?.addEventListener('click', revokeWidgetToken);
  document.getElementById('widgetCopy')?.addEventListener('click', (e) => {
    const url = document.getElementById('widgetUrl')?.textContent || '';
    if (url) copyWithFeedback(e.currentTarget, url, '복사하지 못했습니다. 주소를 길게 눌러 직접 복사해 주세요.');
  });
  document.getElementById('widgetIosCopy')?.addEventListener('click', (e) => {
    const url = document.getElementById('widgetUrl')?.textContent || '';
    if (!url) return;
    if (!iosTemplate) { alert('위젯 코드를 아직 못 받았습니다. 설정을 닫았다 다시 열어 주세요.'); return; }
    copyWithFeedback(e.currentTarget, iosWidgetScript(iosTemplate, url), '복사하지 못했습니다. 다시 한 번 눌러 주세요.');
  });
}

async function copyWithFeedback(button, text, failMessage) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = '복사됨';
    setTimeout(() => { button.textContent = old; }, 1500);
  } catch {
    alert(failMessage);
  }
}
