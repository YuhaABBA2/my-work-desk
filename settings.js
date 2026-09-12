import { sb } from './supabase.js';
import { state } from './state.js';

// 계정별 설정. 행이 없으면 기본값(시세·투자 숨김).
export async function loadSettings() {
  const { data, error } = await sb.from('work_settings').select('show_market').eq('user_id', state.user.id).maybeSingle();
  if (error) return error;
  state.settings = { showMarket: !!data?.show_market };
  return null;
}

export async function setShowMarket(on) {
  const { error } = await sb.from('work_settings')
    .upsert({ user_id: state.user.id, show_market: !!on, updated_at: new Date().toISOString() });
  if (error) return error;
  state.settings.showMarket = !!on;
  return null;
}
