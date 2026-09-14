import { sb } from './supabase.js';
import { state } from './state.js';
import { normalizeWatchlist } from './lib.js';

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
