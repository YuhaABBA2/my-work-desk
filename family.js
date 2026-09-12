import { sb } from './supabase.js';
import { state } from './state.js';
import { familyCodeFrom } from './lib.js';

function newCode() { return familyCodeFrom(crypto.getRandomValues(new Uint8Array(6))); }

export function defaultDisplayName(user) {
  const md = user?.user_metadata || {};
  const n = md.full_name || md.name || String(user?.email || '').split('@')[0] || '나';
  return String(n).trim().slice(0, 30) || '나';
}

// 내 가족 + 구성원. 없으면 state.family = null.
export async function loadFamily() {
  const me = await sb.from('family_members').select('family_id').eq('user_id', state.user.id).maybeSingle();
  if (me.error) return me.error;
  if (!me.data) { state.family = null; return null; }
  const fid = me.data.family_id;
  const [fam, mem] = await Promise.all([
    sb.from('families').select('id,code,owner_id').eq('id', fid).single(),
    sb.from('family_members').select('user_id,display_name,joined_at').eq('family_id', fid).order('joined_at')
  ]);
  if (fam.error) return fam.error;
  if (mem.error) return mem.error;
  state.family = {
    id: fam.data.id,
    code: fam.data.code,
    ownerId: fam.data.owner_id,
    isAdmin: fam.data.owner_id === state.user.id,
    members: mem.data.map(m => ({ userId: m.user_id, name: m.display_name }))
  };
  return null;
}

// 코드가 겹치면(23505) 새 코드로 최대 3회.
async function withFreshCode(attempt) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    const error = await attempt(newCode());
    if (!error) return null;
    last = error;
    if (error.code !== '23505') return error;
  }
  return last;
}

export async function createFamily(name) {
  const err = await withFreshCode(async code => (await sb.rpc('create_family', { p_code: code, p_name: name })).error);
  return err || loadFamily();
}

export async function joinFamily(code, name) {
  const { error } = await sb.rpc('join_family', { p_code: String(code).trim().toUpperCase(), p_name: name });
  return error || loadFamily();
}

export async function leaveFamily() {
  const { error } = await sb.from('family_members').delete().eq('user_id', state.user.id);
  if (error) return error;
  state.family = null;
  return null;
}

export async function regenerateCode() {
  const err = await withFreshCode(async code => (await sb.from('families').update({ code }).eq('id', state.family.id)).error);
  return err || loadFamily();
}

export async function renameMe(name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return new Error('이름을 입력해 주세요.');
  const { error } = await sb.from('family_members').update({ display_name: name }).eq('user_id', state.user.id);
  return error || loadFamily();
}
