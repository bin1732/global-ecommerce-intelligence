#!/usr/bin/env node
/**
 * knowledge-filter.mjs — 知识加载过滤工具
 *
 * 按入口/优先级精准加载 references 下的文件,避免上下文爆炸。
 * 单次交互加载上限: 5个文件(P0必看+P1常用),超出仅记路径。
 * --entry 返回的 loaded 数组含 content 字段,可直接拼进 LLM 上下文。
 *
 * 用法:
 *   node scripts/knowledge-filter.mjs --list --json
 *   node scripts/knowledge-filter.mjs --entry selection --json
 *   node scripts/knowledge-filter.mjs --entry cross-border --json --max 3
 *   node scripts/knowledge-filter.mjs --entry pricing --json   # 返回 loaded[] 含 content 全文
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFS_DIR = join(__dirname, '..', 'references');
const SKILL_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const listMode = args.includes('--list');

function getArg(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
}
const entry = getArg('entry');
const maxRaw = parseInt(getArg('max') || '5', 10);
const MAX = Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= 20 ? maxRaw : 5;
// v1.0.4: 超过上下文预算默认值(5)时给出警告,避免 AI 助手把整个知识库塞进上下文
const OVER_LIMIT_WARNING = MAX > 5
  ? `⚠️ --max ${MAX} 超过默认预算 5, 单次加载过多会挤占上下文窗口; 建议 ≤5, 其余文件按需读取`
  : null;

// 入口 → 文件优先级映射
// P0: 必加载  P1: 当前任务涉及时加载  P2: 按需/用户主动问
const ENTRY_MAP = {
  selection: {
    name: '智能选品',
    P0: ['references/product-selection.md', 'references/product-categories.md'],
    P1: ['references/world-ecommerce.md', 'references/2026-ecommerce-trends.md'],
    P2: ['references/pricing-analysis.md', 'references/daily-price-monitor.md'],
  },
  compliance: {
    name: '平台合规',
    P0: ['references/platform-rules.md'],
    P1: ['references/cross-border-guide.md'],
    P2: ['references/us-sales-tax.md'],
  },
  pricing: {
    name: '定价分析',
    P0: ['references/pricing-analysis.md', 'references/daily-price-monitor.md'],
    P1: ['references/product-categories.md'],
    P2: ['references/world-ecommerce.md'],
  },
  profit: {
    name: '利润计算',
    P0: ['references/pricing-analysis.md'],
    P1: ['references/cross-border-guide.md', 'references/us-sales-tax.md'],
    P2: ['references/product-categories.md'],
  },
  'cross-border': {
    name: '跨境指导',
    P0: ['references/cross-border-guide.md', 'references/us-sales-tax.md'],
    P1: ['references/platform-rules.md', 'references/world-ecommerce.md'],
    P2: ['references/2026-ecommerce-trends.md'],
  },
  review: {
    name: '评价情感分析',
    P0: ['references/review-sentiment.md'],
    P1: ['references/product-selection.md'],
    P2: ['references/daily-price-monitor.md'],
  },
  monitor: {
    name: '竞品价格监控',
    P0: ['references/daily-price-monitor.md', 'references/pricing-analysis.md'],
    P1: ['references/product-selection.md'],
    P2: ['references/2026-ecommerce-trends.md'],
  },
  trends: {
    name: '市场趋势分析',
    P0: ['references/2026-ecommerce-trends.md', 'references/world-ecommerce.md'],
    P1: ['references/product-categories.md'],
    P2: ['references/product-selection.md'],
  },
  listing: {
    name: 'Listing优化',
    P0: ['references/listing-optimization.md'],
    P1: ['references/product-categories.md', 'references/pricing-analysis.md'],
    P2: ['references/review-sentiment.md'],
  },
  ppc: {
    name: 'PPC广告',
    P0: ['references/ppc-advertising.md'],
    P1: ['references/pricing-analysis.md', 'references/daily-price-monitor.md'],
    P2: ['references/product-selection.md'],
  },
  inventory: {
    name: '库存管理',
    P0: ['references/inventory-management.md'],
    P1: ['references/cross-border-guide.md'],
    P2: ['references/pricing-analysis.md'],
  },
  beginner: {
    name: '新手引导',
    P0: ['references/beginner-guide.md', 'references/language-guide.md'],
    P1: ['references/product-selection.md'],
    P2: ['references/world-ecommerce.md'],
  },
};

function listFilesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md'));
}

function listAll() {
  const files = listFilesIn(REFS_DIR).map((f) => 'references/' + f);
  const entries = Object.entries(ENTRY_MAP).map(([k, v]) => ({ entry: k, name: v.name }));
  return {
    totalFiles: files.length,
    refsCount: files.length,
    files,
    entries,
    loadLimit: MAX,
    note: '单次交互加载上限' + MAX + '个(P0+P1优先),P2仅记路径按需读; loaded[] 含 content 字段可直接拼上下文',
  };
}

/**
 * 根据 "references/x.md" 这种相对 Skill 根的路径读文件。
 * 加路径越界保护: 解析后的绝对路径必须还在 SKILL_ROOT 下。
 */
function readSafe(rel) {
  const abs = resolve(SKILL_ROOT, rel);
  if (!abs.startsWith(SKILL_ROOT + sep)) {
    return { ok: false, error: '路径越界: ' + rel };
  }
  if (!existsSync(abs)) return { ok: false, error: '文件不存在: ' + rel };
  try {
    return { ok: true, content: readFileSync(abs, 'utf-8') };
  } catch (e) {
    return { ok: false, error: '读文件失败: ' + rel + ' ' + e.message };
  }
}

function fileRelToBasename(rel) {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(i + 1) : rel;
}

function resolveEntry(entryName) {
  const map = ENTRY_MAP[entryName];
  if (!map) {
    return { error: '未知入口: ' + entryName, available: Object.keys(ENTRY_MAP) };
  }
  // 加载策略: P0全部 + P1前若干, 上限 MAX
  const ordered = [];
  for (const f of map.P0 || []) ordered.push({ rel: f, tier: 'P0' });
  for (const f of map.P1 || []) ordered.push({ rel: f, tier: 'P1' });
  const loadedPlan = ordered.filter((x, i, a) => a.findIndex((y) => y.rel === x.rel) === i).slice(0, MAX);
  const loadedNames = new Set(loadedPlan.map((x) => x.rel));
  const deferredRels = [];
  for (const f of map.P1 || []) if (!loadedNames.has(f)) deferredRels.push(f);
  for (const f of map.P2 || []) if (!loadedNames.has(f)) deferredRels.push(f);
  const dedupDeferred = deferredRels.filter((x, i, a) => a.indexOf(x) === i);

  const totalAvailable = (map.P0?.length || 0) + (map.P1?.length || 0) + (map.P2?.length || 0);
  const matched = loadedPlan.length + dedupDeferred.length;
  const loaded = [];
  const loadErrors = [];
  for (const item of loadedPlan) {
    const r = readSafe(item.rel);
    if (r.ok) {
      loaded.push({
        file: fileRelToBasename(item.rel),
        path: item.rel,
        tier: item.tier,
        content: r.content,
      });
    } else {
      loadErrors.push({ path: item.rel, tier: item.tier, error: r.error });
      // 仍然保留占位,避免 AI 助手认为 P0 必看文件已加载但实际缺
      loaded.push({
        file: fileRelToBasename(item.rel),
        path: item.rel,
        tier: item.tier,
        content: null,
        error: r.error,
      });
    }
  }

  return {
    ok: true,
    entry: entryName,
    name: map.name,
    maxLimit: MAX,
    warning: OVER_LIMIT_WARNING || undefined,
    matched,
    totalAvailable,
    loaded,
    loadedCount: loaded.length,
    deferred: dedupDeferred,
    loadErrors: loadErrors.length > 0 ? loadErrors : undefined,
  };
}

if (listMode) {
  const data = listAll();
  if (wantJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log('\n📚 知识库索引 (共' + data.totalFiles + '个文件)');
    console.log('═'.repeat(50));
    console.log('入口列表:');
    for (const e of data.entries) {
      console.log('  ' + e.entry.padEnd(18) + ' ' + e.name);
    }
    console.log('\n加载上限: ' + data.loadLimit + '个/次');
    console.log('说明: ' + data.note);
    console.log('═'.repeat(50));
  }
} else if (entry) {
  const data = resolveEntry(entry);
  if (data.error) {
    const payload = { ok: false, error: data.error, available: data.available };
    if (wantJson) {
      process.stderr.write(JSON.stringify(payload) + '\n');
    } else {
      console.error('错误: ' + data.error);
      console.error('可用入口: ' + data.available.join(', '));
    }
    process.exit(1);
  }
  if (wantJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log('\n📚 知识加载策略 — ' + data.name);
    console.log('═'.repeat(50));
    console.log('立即加载(' + data.loadedCount + '/' + data.maxLimit + '):');
    for (const f of data.loaded) {
      const mark = f.content ? '✅' : '❌';
      const err = f.error ? '  (' + f.error + ')' : '';
      console.log('  ' + mark + ' [' + f.tier + '] ' + f.path + err);
    }
    if (data.deferred.length) {
      console.log('按需加载(仅记路径,' + data.deferred.length + '个):');
      for (const f of data.deferred) console.log('  ⏳ ' + f);
    }
    console.log('\n上限: ' + data.maxLimit + '个/次  匹配总数: ' + data.matched + '/' + data.totalAvailable);
    if (data.warning) {
      console.log(data.warning);
    }
    if (data.loadErrors) {
      console.log('⚠️ 加载失败: ' + data.loadErrors.length + '项');
    }
    console.log('═'.repeat(50));
  }
} else {
  console.error('用法: node scripts/knowledge-filter.mjs --list --json | --entry <入口> [--max N] --json');
  console.error('入口: ' + Object.keys(ENTRY_MAP).join(', '));
  process.exit(1);
}
