import { sb } from './supabase.js';
import { state } from './state.js';
import { PROJECT_DEFAULTS, mergeProjectNames } from './lib.js';

const LOCAL_KEY = 'deskProjects';

export async function loadProjects() {
  const { data, error } = await sb.from('work_projects')
    .select('id,name,sort_order')
    .order('sort_order')
    .order('created_at');
  if (error) {
    state.projects = [];
    state.projectsReady = false;
    return error;
  }
  state.projects = data.map(p => p.name);
  state.projectsReady = true;
  return null;
}

// 첫 로그인 1회: work_projects 가 비어 있으면 localStorage 목록(없으면 기본 4개) + 업무에 쓰인 이름을 넣는다.
// 호출 전제: loadProjects() 성공, load() 로 state.tasks 채워짐.
export async function migrateLocalProjects() {
  if (!state.projectsReady) return null;
  let local;
  try {
    local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') ?? [...PROJECT_DEFAULTS];
  } catch (_err) {
    local = [...PROJECT_DEFAULTS];
  }
  if (state.projects.length === 0) {
    const names = mergeProjectNames(local, state.tasks.map(t => t.project));
    if (names.length) {
      const { error } = await sb.from('work_projects')
        .insert(names.map((name, i) => ({ user_id: state.user.id, name, sort_order: i })));
      if (error) return error;
      const reload = await loadProjects();
      if (reload) return reload;
    }
  }
  localStorage.removeItem(LOCAL_KEY);
  return null;
}

export async function addProject(name) {
  name = name.trim();
  if (!name) return null;
  if (name.length > 50) return new Error('프로젝트 이름은 50자 이내여야 합니다.');
  const { error } = await sb.from('work_projects')
    .insert({ user_id: state.user.id, name, sort_order: state.projects.length });
  if (error) return error.code === '23505' ? new Error('이미 있는 프로젝트입니다.')
    : error.code === '23514' ? new Error('프로젝트 이름은 50자 이내여야 합니다.') : error;
  return loadProjects();
}

export async function deleteProject(name) {
  const { error } = await sb.from('work_projects').delete().eq('name', name);
  if (error) return error;
  return loadProjects();
}
