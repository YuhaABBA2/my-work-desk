export const today = new Date();
today.setHours(0, 0, 0, 0);

export const state = {
  view: new Date(today.getFullYear(), today.getMonth(), 1),
  tasks: [],
  user: null,
  editId: null,
  selectedDate: null,
  projects: [],        // 프로젝트 이름 목록 (Task 3부터 Supabase)
  projectsReady: false, // work_projects 조회 성공 여부
  family: null,         // { id, code, ownerId, isAdmin, members: [{ userId, name }] } | null
  settings: { showMarket: false }, // work_settings (계정별)
  calMode: localStorage.getItem('calMode') === 'week' ? 'week' : 'month',
  weekStart: null   // 주간 뷰에서 보여지는 주의 일요일(Date). 최초 렌더에서 초기화
};

// 기기별 취향은 localStorage 유지
export const settings = {
  get hideDone() { return localStorage.getItem('hideDone') === '1'; },
  set hideDone(v) { localStorage.setItem('hideDone', v ? '1' : '0'); },
  get dark() { return localStorage.getItem('darkMode') === '1'; },
  set dark(v) { localStorage.setItem('darkMode', v ? '1' : '0'); }
};
