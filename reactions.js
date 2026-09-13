import { sb } from './supabase.js';
import { state } from './state.js';

// 응원 이모지 팔레트 (사모님과 남편이 서로 눌러주는 용도).
export const REACTION_EMOJIS = ['❤️', '👍', '🎉', '💪', '🙏', '✨'];

// state.reactions = { [taskId]: [{ userId, emoji }] }
export async function loadReactions() {
  if (!state.tasks?.length) { state.reactions = {}; return; }
  const familyTaskIds = state.tasks.filter(t => t.familyId).map(t => t.id);
  if (familyTaskIds.length === 0) { state.reactions = {}; return; }

  const map = {};
  // Supabase in() 은 페이로드 한도 안에서 넉넉히 처리해도 되지만 안전하게 100개씩.
  for (let i = 0; i < familyTaskIds.length; i += 100) {
    const chunk = familyTaskIds.slice(i, i + 100);
    const { data, error } = await sb.from('task_reactions')
      .select('task_id,user_id,emoji').in('task_id', chunk);
    if (error) { console.warn('reactions load:', error.message); continue; }
    for (const r of data || []) {
      (map[r.task_id] ??= []).push({ userId: r.user_id, emoji: r.emoji });
    }
  }
  state.reactions = map;
}

// 내 반응 토글 (있으면 지우고 없으면 넣는다).
export async function toggleReaction(taskId, emoji) {
  const uid = state.user?.id;
  if (!uid) return;
  const list = state.reactions[taskId] || [];
  const mine = list.find(r => r.userId === uid && r.emoji === emoji);
  if (mine) {
    const { error } = await sb.from('task_reactions').delete()
      .eq('task_id', taskId).eq('user_id', uid).eq('emoji', emoji);
    if (error) return alert(error.message || '반응을 지우지 못했습니다.');
    state.reactions[taskId] = list.filter(r => !(r.userId === uid && r.emoji === emoji));
  } else {
    const { error } = await sb.from('task_reactions').insert({ task_id: taskId, user_id: uid, emoji });
    if (error) return alert(error.message || '반응을 저장하지 못했습니다.');
    (state.reactions[taskId] ??= []).push({ userId: uid, emoji });
  }
}

// 이모지별 카운트 요약 문자열.
export function summarizeReactions(taskId) {
  const list = state.reactions?.[taskId];
  if (!list?.length) return '';
  const counts = {};
  for (const r of list) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  return Object.entries(counts).map(([e, n]) => `<span class="react-chip"${n > 1 ? '' : ''}>${e}${n > 1 ? ` <b>${n}</b>` : ''}</span>`).join('');
}
