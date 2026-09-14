# 양돈 시세 당일 반영 + 저표본일 제외 — 설계

2026-09-15 · 사용자 확정 ("2!!!" 저녁 크론 + 4번 저표본 제외 포함)

## 배경

- 축평원 `pigGrade` API는 당일 저녁(21시 확인)에 이미 그날 경락가를 돌려준다 (9/14 등외제외 7,947원 / 3,322두).
- 기존 크론(`pig-farm-log` Vercel `0 2 * * *` = 11:00 KST)은 "어제부터 되감아 첫 영업일 1건"이라 당일 값이 다음날 11시에야 들어온다.
- 토요일은 경매가 거의 없어 30두짜리 평균(5,365)이 헤드라인·전일 대비를 망친다. 평일은 2,000~3,300두.

## 변경

### A. pig-farm-log — 크론 라우트 (`app/api/cron/pig-price/route.ts`)
- 쿼리 `today=1`이면 되감기 시작을 `i=0`(오늘)으로. 없으면 지금처럼 `i=1`.
- 오늘 데이터가 없으면(일·공휴일) 기존대로 어제로 되감아 같은 값을 다시 upsert → 200. 실패 처리 변경 없음.
- 응답 JSON은 그대로.

### B. pig-farm-log — GitHub Actions `.github/workflows/pig-price-evening.yml` (새)
- `market-alert.yml`과 같은 꼴. `cron: '0 11 * * 1-6'` (월~토 20:00 KST) + `workflow_dispatch`.
- `curl -H "Authorization: Bearer $CRON_SECRET" "https://masan-farm.vercel.app/api/cron/pig-price?today=1"`, HTTP 200 아니면 실패.
- 저녁 값이 덜 찬 집계여도 다음날 11:00 기존 크론이 어제 것을 다시 받아 `onConflict(price_date,grade)`로 덮는다. 기존 크론·`vercel.json`은 손대지 않는다.
- **커밋 author 이메일 `jskim1@woosung.kr`** (아니면 Vercel이 배포 안 함). GH Actions 파일은 Vercel과 무관하지만 라우트 변경은 배포가 필요하다.

### C. my-work-desk — 표시 (`market.js`, `lib.js`)
- `pig_price` 조회에 `head_count` 포함.
- 순수 함수 `filterPigSeries(rows, minHead = 300)` (lib.js): `head_count`가 `null`이거나 `>= minHead`인 행만 남긴다. 헤드라인·스파크라인·전일/전주/전년 **모두** 이 걸러진 계열로 계산한다 (저표본일은 화면에서 완전히 빠진다 — 절벽 그래프도 사라진다).
- 상태 줄: `돼지 도매(등외제외) 2026-09-14 기준 · 축산물품질평가원 · 300두 미만 경매일 제외`.
- 걸러서 0건이면 기존 "데이터가 아직 없습니다" 분기.

## 테스트
- `tests/lib.test.mjs`: `filterPigSeries` — (1) 30두 행 제외, 3,000두 행 유지 (2) `head_count null` 유지 (3) 경계 300 유지·299 제외.
- 라우트: `today=1`로 로컬/프로덕션 호출해 `days`에 오늘 날짜가 오는지. GH Actions `workflow_dispatch`로 한 번 수동 실행해 200 확인.
- 데스크 앱: 헤드라인이 9/14 값, 전일 대비가 금요일(7,499) 기준 ▲ 수백 원, 스파크라인 절벽 없음.

## 범위 밖
- 한우·산란·육계 실데이터, 시세 알림 임계값 변경, 토요일 데이터 삭제(저장은 하되 표시만 제외).
