import { sb } from './supabase.js';
import { state } from './state.js';

// 계정별 설정. 행이 없거나 조회 실패면 기본값(시세·투자·노트 모두 숨김).
export async function loadSettings() {
  const { data, error } = await sb.from('work_settings').select('show_market,show_notes').eq('user_id', state.user.id).maybeSingle();
  if (error) { state.settings = { showMarket: false, showNotes: false }; return error; }
  state.settings = { showMarket: !!data?.show_market, showNotes: !!data?.show_notes };
  return null;
}

// upsert는 merge-duplicates라 보내지 않은 컬럼은 기존 값을 유지한다 — 두 함수 모두 자기 컬럼만 보낸다.
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
