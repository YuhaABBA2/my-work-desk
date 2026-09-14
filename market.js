import { esc, filterPigSeries } from './lib.js';
import { $ } from './ui.js';

const INVESTMENT_SOURCES = [
  {
    purpose: '시장 전체 체온',
    source: 'KRX 정보데이터시스템',
    url: 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y',
    metrics: ['KOSPI/KOSDAQ 등락률', '거래대금', '시가총액', '업종별 등락', 'PER/PBR/배당수익률']
  },
  {
    purpose: '수급',
    source: 'KRX 정보데이터시스템',
    url: 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y',
    metrics: ['외국인·기관·개인 거래실적', '순매수 상위종목', '프로그램매매', '공매도 거래']
  },
  {
    purpose: '개별 기업 원문',
    source: 'DART 전자공시',
    url: 'https://dart.fss.or.kr/',
    metrics: ['사업보고서', '분기·반기보고서', '주요사항보고서', '증자·감자', '전환사채', '최대주주 변경']
  },
  {
    purpose: '거래소 공시/상장 이슈',
    source: 'KIND',
    url: 'https://kind.krx.co.kr/',
    metrics: ['투자주의·경고·위험', '관리종목', '상장폐지 사유', '밸류업 투자지표']
  },
  {
    purpose: '실적·컨센서스',
    source: 'FnGuide / 네이버페이증권',
    url: 'https://comp.fnguide.com/',
    metrics: ['매출', '영업이익', '순이익', 'ROE', '부채비율', 'PER', 'PBR', '배당수익률', '컨센서스 변화']
  },
  {
    purpose: '금리·환율·유동성',
    source: '한국은행 ECOS',
    url: 'https://ecos.bok.or.kr/',
    metrics: ['기준금리', '국고채 3년/10년', '원달러 환율', 'M2', '국제수지', '심리지수']
  },
  {
    purpose: '국내 경기',
    source: 'KOSIS / 통계청',
    url: 'https://kosis.kr/',
    metrics: ['CPI', '실업률', '고용률', '산업생산', '소매판매', '설비투자', '경기동행·선행지수']
  },
  {
    purpose: '정책/규제',
    source: '금융위·금감원·산업부·기재부',
    url: 'https://www.fsc.go.kr/',
    metrics: ['공매도', '세제', '밸류업', '산업 지원책', '수출 규제', '보조금', '전력·반도체·배터리 정책']
  },
  {
    purpose: '글로벌 압력',
    source: 'FRED / Fed / Investing / TradingView',
    url: 'https://fred.stlouisfed.org/',
    metrics: ['미국 10년물', '달러인덱스', 'WTI', '구리', 'VIX', 'S&P500', 'NASDAQ', 'SOX 반도체지수']
  }
];

const STOCK_LINKS = [
  { label: 'KRX 시장 데이터', url: q => `https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?vsView=Y` },
  { label: 'DART 공시 검색', url: q => `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(q)}` },
  { label: 'KIND 공시', url: q => `https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain` },
  { label: '네이버페이증권', url: q => `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(q)}` },
  { label: 'FnGuide', url: q => `https://comp.fnguide.com/` },
  { label: 'ECOS', url: q => `https://ecos.bok.or.kr/` },
  { label: 'KOSIS', url: q => `https://kosis.kr/search/search.do?query=${encodeURIComponent(q)}` },
  { label: 'FRED', url: q => `https://fred.stlouisfed.org/searchresults/?search_type=series&search=${encodeURIComponent(q)}` },
  { label: 'TradingView', url: q => `https://www.tradingview.com/search/?query=${encodeURIComponent(q)}` }
];

export function renderInvestment() {
  const grid = $('#investmentGrid');
  if (!grid) return;
  grid.innerHTML = INVESTMENT_SOURCES.map(item => `
    <a class="indicator-card" href="${item.url}" target="_blank" rel="noreferrer">
      <span class="indicator-purpose">${esc(item.purpose)}</span>
      <b>${esc(item.source)}</b>
      <span>${item.metrics.map(esc).join(' · ')}</span>
    </a>
  `).join('');
  renderStockLinks();
}

export function renderStockLinks() {
  const box = $('#stockLinks');
  if (!box) return;
  const query = ($('#stockQuery')?.value || '').trim() || '삼성전자';
  box.innerHTML = STOCK_LINKS.map(link => `<a href="${link.url(query)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>`).join('');
}

// 돼지 시세: Supabase pig_price 를 직접 읽는다(가족 이용자 인증 필요 없음 — RLS 는 authenticated 에게 select 허용).
// 한우/산란/육계는 아직 데이터 소스가 없어 공식 페이지 링크로 남긴다.
export async function loadMarket() {
  const status = $('#marketStatus');
  const grid = $('#marketGrid');
  status.textContent = '축산물 시세를 조회하는 중입니다.';
  grid.innerHTML = skeleton(['양돈', '한우', '산란', '육계']);
  try {
    const { sb } = await import('./supabase.js');
    // 1년치 조금 넘게 — 전년 대비 계산 여유.
    const yearAgo = new Date(Date.now() - 380 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from('pig_price')
      .select('price_date,price_per_kg,head_count')
      .eq('grade', 'excl_utility')
      .gte('price_date', yearAgo)
      .order('price_date', { ascending: true });
    if (error) throw error;
    const pig = pigCard(filterPigSeries(data || []));
    status.innerHTML = pig.status;
    grid.innerHTML = [pig.html, linkCard('한우', 'https://www.ekapepia.com/v3/price/livestock/cow/producer.do', '축산유통정보 다봄'),
      linkCard('산란', 'https://www.ekapepia.com/supPrice/liveStock/distrPrice/sanji/hen.do', '양계협회 산지시세'),
      linkCard('육계', 'https://www.ekapepia.com/supPrice/liveStock/distrPrice/sanji/broilerchicken.do', '육계협회 산지시세')].join('');
  } catch (err) {
    status.innerHTML = `시세를 불러오지 못했습니다. <a class="source-link" href="https://www.ekapepia.com" target="_blank" rel="noreferrer">축산유통정보</a>`;
    grid.innerHTML = ['양돈','한우','산란','육계'].map(n => linkCard(n, 'https://www.ekapepia.com', '축산유통정보')).join('');
  }
}

function skeleton(names) {
  return names.map(n => `<div class="market-item"><b>${esc(n)}</b><span>불러오는 중…</span></div>`).join('');
}

function linkCard(name, url, label) {
  return `<div class="market-item"><b>${esc(name)}</b><span><a class="source-link" href="${url}" target="_blank" rel="noreferrer">${esc(label)} ↗</a></span></div>`;
}

// 스파크라인 SVG (단일 계열, 축·범례 없음). 값 배열을 받는다 — 양돈 시세와 투자 지표 타일이 같이 쓴다.
export function sparkline(vals, color = 'var(--blue)') {
  if (!vals || vals.length < 2) return '';
  const W = 220, H = 40, PAD = 4;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = i => PAD + (i * (W - PAD * 2)) / (vals.length - 1);
  const y = v => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vals.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" class="spark-svg" preserveAspectRatio="none">
    <path d="${line} L${x(last).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z" fill="${color}" fill-opacity="0.14"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}
function sparklineSVG(rows) { return sparkline(rows.map(r => r.price_per_kg)); }

function won(n) { return n == null ? '-' : n.toLocaleString('ko-KR'); }
function shift(iso, days) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function priceOnOrBefore(rows, iso) { let f = null; for (const r of rows) { if (r.price_date <= iso) f = r; else break; } return f; }

function pigCard(prices) {
  if (!prices.length) {
    return { status: '돼지 시세 데이터가 아직 없습니다.',
             html: linkCard('양돈', 'https://www.ekape.or.kr', '축산물품질평가원') };
  }
  const latest = prices[prices.length - 1];
  const spark = prices.slice(-14);
  const cmp = (label, ref) => {
    if (!ref) return `<span class="d-mini">${label} -</span>`;
    const diff = latest.price_per_kg - ref.price_per_kg;
    const arr = diff > 0 ? '▲' : diff < 0 ? '▼' : '·';
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    return `<span class="d-mini ${cls}">${label} ${arr}${Math.abs(diff).toLocaleString('ko-KR')}</span>`;
  };
  const prev = prices.length > 1 ? prices[prices.length - 2] : null;
  const wkAgo = priceOnOrBefore(prices, shift(latest.price_date, -7));
  const yrAgo = priceOnOrBefore(prices, shift(latest.price_date, -365));
  return {
    status: `돼지 도매(등외제외) ${latest.price_date} 기준 · 축산물품질평가원 · 300두 미만 경매일 제외`,
    html: `<div class="market-item wide-item"><div class="mi-head"><b>양돈</b><span class="mi-unit">등외제외 · 원/kg</span></div>
      <div class="mi-hero">${won(latest.price_per_kg)}</div>
      ${sparklineSVG(spark)}
      <div class="mi-deltas">${cmp('전일', prev)} ${cmp('전주', wkAgo)} ${cmp('전년', yrAgo)}</div>
    </div>`
  };
}
