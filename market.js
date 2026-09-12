import { esc } from './lib.js';
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

export async function loadMarket() {
  const status = $('#marketStatus');
  const grid = $('#marketGrid');
  const names = ['양돈', '한우', '산란', '육계'];
  status.textContent = '축산물 시세를 조회하는 중입니다.';
  grid.innerHTML = names.map(n => marketCard(n, null)).join('');
  try {
    const url = 'https://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_cert_key=TEST&p_cert_id=TEST&p_returntype=json&p_product_cls_code=01&p_item_category_code=200';
    const res = await fetch(url);
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data.filter(x => typeof x === 'object') : [];
    status.innerHTML = rows.length ? 'KAMIS 축산물 가격정보를 불러왔습니다.' : 'KAMIS 테스트 키 응답에 상세 품목이 없어 공식 페이지 확인이 필요합니다. <a class="source-link" href="https://www.kamis.or.kr/customer/reference/openapi_list.do" target="_blank" rel="noreferrer">KAMIS Open API</a>';
    grid.innerHTML = names.map(n => marketCard(n, rows.find(r => JSON.stringify(r).includes(n)))).join('');
  } catch (err) {
    status.innerHTML = `브라우저에서 KAMIS 조회가 제한됐습니다. <a class="source-link" href="https://www.kamis.or.kr/customer/price/wholesale/item.do" target="_blank" rel="noreferrer">공식 가격정보 보기</a>`;
    grid.innerHTML = names.map(n => marketCard(n, null)).join('');
  }
}

function marketCard(name, row) {
  const text = row ? JSON.stringify(row) : '공식 데이터 연결 필요';
  const bars = [35, 52, 44, 63, 57, 70].map(v => `<i style="height:${v}%"></i>`).join('');
  return `<div class="market-item"><b>${name}</b><span>${esc(text).slice(0, 80)}</span><div class="spark">${bars}</div></div>`;
}
