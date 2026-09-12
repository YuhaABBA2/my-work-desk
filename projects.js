import { state } from './state.js';
import { PROJECT_DEFAULTS } from './lib.js';

// Task 3 에서 Supabase work_projects 로 교체된다.
function read() {
  try {
    return JSON.parse(localStorage.getItem('deskProjects') || 'null') ?? [...PROJECT_DEFAULTS];
  } catch (_err) {
    return [...PROJECT_DEFAULTS];
  }
}
function write(v) { localStorage.setItem('deskProjects', JSON.stringify([...new Set(v.filter(Boolean))])); }

export async function loadProjects() {
  state.projects = read();
  state.projectsReady = true;
  return null;
}

export async function addProject(name) {
  name = name.trim();
  if (!name) return null;
  write([...read(), name]);
  return loadProjects();
}

export async function deleteProject(name) {
  write(read().filter(p => p !== name));
  return loadProjects();
}
