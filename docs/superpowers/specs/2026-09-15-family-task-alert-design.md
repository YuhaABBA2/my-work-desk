# 가족 일정 등록 알림 + 반복 일정 지난 회차 접기 — 설계

2026-09-15 · 사용자 확정 (수신자: 가족 구성원, 등록자 제외 / SQL은 Claude가 Chrome으로 실행)

## 1. 가족 일정 등록 알림 (pig-farm-log + Supabase 트리거)

- 트리거: `work_tasks` AFTER INSERT FOR EACH ROW → `supabase_functions.http_request('https://masan-farm.vercel.app/api/hooks/task-created', 'POST', …)`.
- 서버 `app/api/hooks/task-created/route.ts`:
  1. body `record.id`만 쓰고 행은 service role로 **재조회** (`id,title,user_id,family_id,series_id,task_date,task_time`).
  2. `family_id` 없음 → `{skipped:'personal'}`.
  3. `series_id` 있으면 그 시리즈에서 `task_date` 최소 행이 아니면 `{skipped:'not-first'}` (반복은 1건만).
  4. 수신자 = `family_members(family_id)` 중 `user_id != 등록자`. 등록자 이름 = `family_members.display_name`.
  5. 수신자마다 `notification_log(task_id=row.id, user_id, reminder_kind='new')` 없을 때만 발송·기록. 구독 없어도 기록.
  6. 410/404 구독은 삭제 (notify-tasks와 동일).
- 문구: title `📌 ${등록자}님이 가족 일정 등록`, body `${title} · M/D(요일)[ HH:MM][ · 반복]`, tag `new-${id}`, url `/`.
- `middleware.ts`: `/api/hooks` 로그인 면제 (라우트가 스스로 검증).
- 보안: 시크릿 없음(Vercel env 접근 불가). payload 신뢰 안 함 + 실재 UUID 필요 + 중복 로그. 추후 `HOOK_SECRET` env 추가 시 헤더 검증.
- SQL:
  ```sql
  alter table public.notification_log drop constraint if exists notification_log_reminder_kind_check;
  alter table public.notification_log add constraint notification_log_reminder_kind_check check (reminder_kind in ('1h','1d','new'));
  create or replace trigger work_tasks_created_hook after insert on public.work_tasks
    for each row execute function supabase_functions.http_request(
      'https://masan-farm.vercel.app/api/hooks/task-created', 'POST', '{"Content-Type":"application/json"}', '{}', '5000');
  ```
- 테스트: 순수 함수 `taskAlertBody(row)`(문구) 단위 테스트; 실제로는 데스크에서 가족 일정 1건 등록 → 다른 구성원 폰 알림 + `notification_log`에 `'new'` 행.

## 2. 반복 일정 지난 회차 접기 (my-work-desk)

- `isStaleRepeat(t, todayIso)` = `!!t.seriesId && !t.done && dueDate(t) < todayIso`.
- 제외 대상: 남은 업무 카운트(`openCount`), 마감 임박 배너, 저녁 "오늘 못 한 일" 배너, 일요일 회고의 미완료 수(있으면). 즉 `personalOpen`에서 뺀다.
- 그대로 두는 곳: 캘린더 셀, 날짜 상세, 검색, 완료 목록. 표시는 기존 "지남" 배지.
- 테스트: `isStaleRepeat` 3 케이스.
