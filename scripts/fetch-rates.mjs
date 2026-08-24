#!/usr/bin/env node
/**
 * fetch-rates.mjs — 实时汇率抓取工具 (v1.0.4)
 *
 * 从公开免费汇率 API 多源轮换抓取实时汇率，输出与 profit_calculator.py 内置
 * FX_RATES 完全兼容的格式（基准 CNY：1 单位外币 = X 人民币）。
 *
 * 真实数据化原则（反幻觉）：
 *   - 只输出 API 真实返回的汇率，绝不编造/内插缺失币种
 *   - 输出带 fetchedAt（抓取时间）+ source（实际命中的源）+ disclaimer
 *   - 所有数据源都失败 → exit 1 + JSON 错误，由调用方降级到内置快照并明示"非实时"
 *
 * 用法：
 *   node scripts/fetch-rates.mjs --json              # 全量输出
 *   node scripts/fetch-rates.mjs --base CNY --json   # 指定基准（默认 CNY）
 *
 * 依赖：Node ≥18（全局 fetch）；无 API key 要求。
 */

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].toUpperCase() : 'CNY';
})();
const wantJson = process.argv.includes('--json');

// 多源轮换：公开、免费、无需 key。顺序即优先级。
const SOURCES = [
  {
    name: 'open.er-api.com (free, no key)',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (j) => j?.result === 'success' && j?.rates ? j.rates : null,
  },
  {
    name: 'api.frankfurter.app (ECB data)',
    url: 'https://api.frankfurter.app/latest?from=USD',
    parse: (j) => j?.rates ? j.rates : null,
  },
  {
    name: 'api.exchangerate-api.com (free, no key)',
    url: 'https://api.exchangerate-api.com/v4/latest/USD',
    parse: (j) => j?.rates ? j.rates : null,
  },
];

const TIMEOUT_MS = 8000;

async function fetchSource(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src.url, { signal: ctrl.signal, headers: { 'User-Agent': 'global-ecommerce-intelligence/1.0.4' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const rates = src.parse(j);
    if (!rates || typeof rates !== 'object') throw new Error('响应格式异常');
    return rates;
  } finally {
    clearTimeout(timer);
  }
}

function fail(message) {
  const payload = { ok: false, error: message, hint: '请使用 profit_calculator.py 内置快照（标注"示例值,非实时"），或稍后重试 --json' };
  if (wantJson) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  else console.error('❌ 汇率抓取失败: ' + message);
  process.exit(1);
}

(async () => {
  let ratesUSD = null;
  let sourceName = null;
  const errors = [];
  for (const src of SOURCES) {
    try {
      ratesUSD = await fetchSource(src);
      sourceName = src.name;
      break;
    } catch (e) {
      errors.push(src.name + ': ' + (e.name === 'AbortError' ? '超时' : e.message));
    }
  }
  if (!ratesUSD) fail('所有数据源不可用 [' + errors.join(' | ') + ']');

  // USD 为中间货币，换算到基准（默认 CNY）：1 外币 = (1 USD 兑换基准) / (1 USD 兑换外币)
  const usdPerBase = BASE === 'USD' ? 1 : (ratesUSD[BASE] ?? null);
  if (usdPerBase === null || typeof usdPerBase !== 'number') {
    fail('数据源不含基准货币 ' + BASE + '（可用币种数: ' + Object.keys(ratesUSD).length + '）');
  }

  // 与 profit_calculator 内置 FX_RATES 键集对齐（不编造缺失币种，缺失就跳过并提示）
  const SUPPORTED = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'THB', 'MYR', 'PHP', 'VND', 'IDR', 'BRL', 'MXN', 'AUD', 'CAD', 'AED', 'SAR', 'INR', 'TRY'];
  const rates = {};
  const missing = [];
  for (const code of SUPPORTED) {
    const perUSD_fx = ratesUSD[code];
    if (typeof perUSD_fx === 'number' && perUSD_fx > 0) {
      rates[code] = Number((perUSD_fx / usdPerBase).toFixed(6));
    } else {
      missing.push(code);
    }
  }
  if (BASE !== 'USD') rates[BASE] = 1;

  const result = {
    ok: true,
    base: BASE,
    rates,
    fetchedAt: new Date().toISOString(),
    source: sourceName,
    missingInSource: missing.length ? missing : undefined,
    disclaimer: '实时汇率（抓取时间见 fetchedAt）；profit_calculator 内置 FX_RATES 为历史快照，两者不一致时以本输出为准；实际交易汇率请以银行/支付渠道为准',
  };
  if (wantJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    console.log(`\n💱 实时汇率 (基准 ${BASE}) — ${sourceName}`);
    console.log('═'.repeat(48));
    for (const [k, v] of Object.entries(rates)) {
      console.log('  ' + k.padEnd(5) + ' = ' + v.toFixed(4) + ' ' + BASE);
    }
    console.log('  ───────────────────────────────');
    console.log('  抓取时间: ' + result.fetchedAt);
    if (result.missingInSource) console.log('  ⚠️ 源缺失币种: ' + result.missingInSource.join(', '));
    console.log('═'.repeat(48));
  }
  process.exit(0);
})().catch((e) => fail(e.message));
