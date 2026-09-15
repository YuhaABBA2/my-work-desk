import { esc, filterPigSeries } from './lib.js';
import { $ } from './ui.js';

// 돼지 시세: Supabase pig_price 를 직접 읽는다(가족 이용자 인증 필요 없음 — RLS 는 authenticated 에게 select 허용).
// 앱 안에서 바로 볼 수 있는 것만 둔다 — 외부 사이트 링크는 2026-09-15에 전부 뺐다.
export async function loadMarket() {
  const status = $('#marketStatus');
  const grid = $('#marketGrid');
  status.textContent = '축산물 시세를 조회하는 중입니다.';
  grid.innerHTML = skeleton(['양돈']);
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
    status.textContent = pig.status;
    grid.innerHTML = pig.html;
  } catch (err) {
    status.textContent = '시세를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    grid.innerHTML = '';
  }
}

function skeleton(names) {
  return names.map(n => `<div class="market-item"><b>${esc(n)}</b><span>불러오는 중…</span></div>`).join('');
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
    return { status: '돼지 시세 데이터가 아직 없습니다.', html: '' };
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
