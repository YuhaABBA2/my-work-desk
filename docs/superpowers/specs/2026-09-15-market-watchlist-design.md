# 투자 지표 실시간 타일 + 관심 목록 편집 — 설계

2026-09-15 · 사용자 확정 (A: pig-farm-log 프록시 / 기존 "투자 지표 조회" 카드 안 / 종목·지표 추가·삭제 가능)

## 목적
코스피·코스닥·필라델피아반도체·VIX·S&P500·달러/원·달러/엔을 데스크 앱에서 1분 단위로 보고, 원하는 주식·지표를 계정별로 더하고 뺀다.

## 데이터 소스
- Yahoo Finance 비공개 API (키 없음, 서버에서만 호출 — 브라우저는 CORS로 막힘):
  - 시세: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=5m` → `meta.regularMarketPrice`, `meta.chartPreviousClose`, `meta.marketState`, `meta.regularMarketTime`, `indicators.quote[0].close[]`
  - 검색(영문): `https://query1.finance.yahoo.com/v1/finance/search?q=…&quotesCount=8&newsCount=0`
- 한글 종목명 검색은 Yahoo가 못 하므로 KRX KIND 상장목록을 정적 JSON으로 앱에 둔다: `krx-list.json` = `[["삼성전자","005930","KS"], …]` (2,686행, 88KB). 코스피 `.KS`, 코스닥 `.KQ`. 갱신은 수동(스크립트 `scripts/build-krx-list.py`).

## 기본 목록 (심볼 → 표시 이름)
`^KS11` 코스피 · `^KQ11` 코스닥 · `^SOX` 필라델피아 반도체 · `^VIX` VIX · `^GSPC` S&P 500 · `KRW=X` 달러/원 · `JPY=X` 달러/엔

## 저장
```sql
alter table public.work_settings add column if not exists market_symbols jsonb;
```
- `null` = 기본 목록. 값은 `[{ "symbol": "^KS11", "name": "코스피" }, …]`, 최대 20개. 같은 `settings.js` upsert 패턴.

## 서버 (pig-farm-log)
### `GET /api/market/quotes?symbols=^KS11,005930.KS`
- 심볼 검증 `^[A-Za-z0-9^=.\-]{1,15}$`, 최대 20개. 위반 400.
- 병렬 조회(`Promise.allSettled`), 60초 메모리 캐시(심볼별) + `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`.
- 응답 `{ asOf: ISO, items: [{ symbol, price, prevClose, change, pct, marketState, time, spark: number[] }] }`. 실패한 심볼은 `{ symbol, error: true }`.
- CORS: `Access-Control-Allow-Origin` = `https://my-work-desk.vercel.app` (환경변수 `DESK_ORIGIN`으로 덮어쓰기 가능, 로컬 `http://localhost:*`도 허용). OPTIONS 204.
- 인증 없음(공개 지표). Yahoo 요청에 UA 헤더.

### `GET /api/market/search?q=nvda`
- `q` 1~40자. Yahoo search 프록시, `quoteType`이 EQUITY/INDEX/ETF/CURRENCY/FUTURE인 것만 `[{ symbol, name, exch, type }]` 최대 8개. 60초 캐시. 같은 CORS.

## 클라 (my-work-desk)
### 카드 안 배치
"투자 지표 조회" 카드 머리 바로 아래, 검색칸 위:
```
[상태줄] 실시간 지표 · 32초 전 갱신 · 장중/마감은 타일에         [편집]
[타일 grid] 코스피 6,684.37 ▼225.54 -3.26% [스파크]  코스닥 …  (폰 2열, PC 4열)
```
- 타일: 이름 / 값 / 등락(절대·%) / 당일 5분봉 스파크라인(`sparklineSVG` 재사용) / 장중이면 이름 옆 초록 점.
- 상승 빨강(`.up`) 하락 파랑(`.down`) — 기존 클래스.
- 값 자리수: `fmtIndex(v)` — |v| ≥ 1000 → 소수 2자리 천단위, 100~1000 → 2자리, 그 밖(환율·VIX 등) → 2자리. 즉 전부 소수 2자리 + 천단위 구분. 주식(원화)은 정수: 심볼이 `.KS`/`.KQ`면 소수 0자리.
- 갱신: 카드가 보이고(`!hidden`) 탭이 보이는 동안(`document.visibilityState === 'visible'`) 60초마다. 숨겨지면 타이머 정지, 다시 보이면 즉시 1회 + 재시작. 시세·투자 토글로 카드가 켜질 때 시작.
- 에러: 서버 실패 시 상태줄에 "지표를 불러오지 못했습니다" + 이전 타일 유지. 심볼 단위 실패는 타일에 "—".

### 편집 다이얼로그 (`<dialog id="watchDialog">`)
- 현재 목록: 이름 · 심볼 · ✕. 20개 차면 검색칸 비활성 + 안내.
- 검색칸: 입력 즉시 (200ms 디바운스)
  - 한글 또는 숫자 → `krx-list.json`(첫 검색 때 fetch, 이후 메모리)에서 이름 부분일치·코드 전방일치, 최대 8개 → `{symbol: code + '.KS'|'.KQ', name}`
  - 영문 포함 → `/api/market/search` 결과, `name`은 Yahoo 이름 그대로
  - 이미 목록에 있는 것은 "추가됨" 표시, 탭 불가
- 항목 탭 → 즉시 저장(`setMarketSymbols`) → 목록·타일 갱신. ✕도 즉시 저장.
- [기본값으로] → `market_symbols = null` 저장 → 기본 7종.
- 순서 변경은 안 함. 새 항목은 맨 뒤.

### 순수 함수 (lib.js, 테스트)
| 함수 | 역할 |
|---|---|
| `indexDelta(price, prevClose)` | `{ diff, pct, cls: 'up'|'down'|'flat' }`, prevClose 없거나 0이면 `null` |
| `fmtIndex(v, symbol)` | 위 자리수 규칙 문자열 |
| `krxSearch(list, q, limit=8)` | 이름 부분일치(대소문자 무시)·코드 전방일치, 이름 일치 우선, `{symbol, name}` |
| `normalizeWatchlist(v, defaults)` | 저장값 검증: 배열 아니거나 빈 배열이면 defaults, 각 항목 `symbol` 문자열·`name` 문자열, 중복 제거, 20개 절단 |

## 파일
- pig-farm-log: `app/api/market/quotes/route.ts`, `app/api/market/search/route.ts`, `lib/market-cors.ts`(공통 CORS·캐시 헬퍼)
- my-work-desk: `market.js`(타일·타이머·편집), `settings.js`(`marketSymbols` 로드/저장), `lib.js`+`tests/lib.test.mjs`, `index.html`(타일 영역·편집 버튼·다이얼로그), `styles.css`, `krx-list.json`, `scripts/build-krx-list.py`, `supabase-setup.sql`, `SESSION_HANDOFF.md`

## 완료 기준
1. `npm test` 통과(위 함수 4개)
2. 프로덕션: 카드에 기본 7타일이 값·등락과 함께 뜨고 60초 뒤 "n초 전"이 리셋됨
3. 편집에서 `삼성전자` 검색 → 추가 → 타일에 삼성전자 현재가(정수) → 새로고침 후 유지 → ✕ 삭제 → 기본값으로 복귀
4. `NVDA` 검색(영문) → 추가됨

## 범위 밖
- 알림·임계값, 히스토리 저장, 순서 변경, 종목별 상세 차트, 한국 ETF 전용 검색(KIND 목록에 없는 것은 코드 직접 입력)
