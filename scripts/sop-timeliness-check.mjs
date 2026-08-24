#!/usr/bin/env node
/**
 * sop-timeliness-check.mjs — 数据文件 + SOP 文件时效巡检
 *
 * 扫描 references/ 下的 数据型 .md 文件（TIMELY_FILES）+ sop/ 下所有 .md SOP 文件。
 * 检查时效元数据 (头部 25 行内)：
 *   sopMeta JSON:  { sopVersion, owner, scope, lastUpdated, lastVerified, verifyCycleDays, nextVerifyAt }
 *   兼容旧格式:   > 最后更新 / 最后核实 / 核实周期 / 下次核实（YAML/中文注释形式）
 *
 * 状态: ok / due-soon(≤14天) / overdue / missing-meta / malformed-date
 * 健康度: 满分10, 存在 missing-meta/malformed-date 直接0分, overdue 扣5分
 *
 * 用法:
 *   node scripts/sop-timeliness-check.mjs --json
 *   node scripts/sop-timeliness-check.mjs --dir <dir> --json        # 仅扫单个子目录
 *   node scripts/sop-timeliness-check.mjs --threshold 21 --json    # due-soon窗口改为≤21天
 *   node scripts/sop-timeliness-check.mjs --refresh-next --json    # 将已有的due-soon/overdue刷新为今天+verifyCycleDays(写回文件)
 */

import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..');
const DEFAULT_REFS_DIR = join(SKILL_ROOT, 'references');
const DEFAULT_SOP_DIR = join(SKILL_ROOT, 'references', 'sop');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const refreshNext = args.includes('--refresh-next');
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
}
const singleDir = getArg('dir');
const thresholdRaw = parseInt(getArg('threshold') || '14', 10);
const thresholdDays = Number.isFinite(thresholdRaw) && thresholdRaw > 0 && thresholdRaw <= 180 ? thresholdRaw : 14;

// —— references/ 数据型文件（v1.0.4: 自动发现，替代硬编码清单）
// 判定标准: 头部 25 行内含完整时效元数据 (lastVerified + verifyCycleDays/核实周期 + nextVerifyAt)
// 凡含时效元数据的 refs 自动纳入巡检；方法论/分类体系文件(无元数据)自动跳过。
// 这样新增数据文件只需补上元数据头，无需改代码。当前实际命中 9 份数据文件。

// —— 路径越界保护：解析后必须还在 SKILL_ROOT 下
function assertInsideSkillRoot(p, label) {
  const abs = resolve(SKILL_ROOT, p);
  if (!abs.startsWith(SKILL_ROOT + sep)) {
    const msg = label + ' 路径越出 Skill 根目录,拒绝操作: ' + p;
    if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg, code: 'E_PATH_OUTSIDE_ROOT' }) + '\n');
    else console.error('❌ ' + msg);
    process.exit(2);
  }
  return abs;
}

const META_PATTERNS = {
  // 兼容 line-patterns ("最后更新: 2026-08-04") 和 sopMeta JSON块 (lastVerified: "2026-08-04")
  // 日期两侧可选双引号 / 中文冒号 / 英文冒号
  lastUpdated: /(?:最后更新|lastUpdated)[：:]\s*"?(\d{4}-\d{2}-\d{2})"?/,
  lastVerified: /(?:最后核实|lastVerified)[：:]\s*"?(\d{4}-\d{2}-\d{2})"?/,
  cycleZh: /核实周期[：:]\s*([^\n",]+)/,
  cycleDays: /verifyCycleDays[：:]\s*(\d+)/,
  nextVerify: /(?:下次核实|nextVerifyAt)[：:]\s*"?(\d{4}-\d{2}-\d{2})"?/,
};

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== parseInt(m[1]) || d.getMonth() + 1 !== parseInt(m[2]) || d.getDate() !== parseInt(m[3])) {
    return null;
  }
  return d;
}
function addDays(d, days) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * 尝试从 sopMeta JSON 块（<!-- sopMeta = {...} -->）或 sopMeta YAML 中解析;
 * 回退到旧的中文 "最后更新/核实/周期/下次核实" 行模式。
 * 
 * 兼容类 JSON 对象字面量（key 无引号）:  { sopVersion: "1.0.4", owner: "xxx" }
 * 通过正则给无引号的 identifier key 补双引号后再 JSON.parse
 */
function extractMeta(headLines) {
  const head = headLines.join('\n');
  // 块形式: <!-- sopMeta = { ... } -->
  const blockMatch = head.match(/sopMeta\s*[:=]\s*(\{[\s\S]*?\})/);
  if (blockMatch) {
    try {
      // 兼容无引号 key: 将 { key: "value" } 变为 { "key": "value" }
      // 正则: 在 { 或 , 后跟随 identifier: 时给 identifier 加双引号
      // 跳过字符串内部可能出现的冒号 (不处理嵌套字符串内部的匹配)
      let relaxed = blockMatch[1];
      relaxed = relaxed.replace(/(\{|\,)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\:/g, (_, pre, key) => `${pre}"${key}":`);
      // 再清理尾逗号
      relaxed = relaxed.replace(/,\s*([}\]])/g, '$1');
      const obj = JSON.parse(relaxed);
      if (obj && typeof obj === 'object') {
        return {
          sopVersion: obj.sopVersion || null,
          owner: obj.owner || null,
          scope: obj.scope || null,
          lastUpdated: obj.lastUpdated || null,
          lastVerified: obj.lastVerified || null,
          verifyCycleDays: typeof obj.verifyCycleDays === 'number' ? obj.verifyCycleDays : null,
          nextVerifyAt: obj.nextVerifyAt || null,
          format: 'sopMeta-json',
        };
      }
    } catch { /* fallthrough to line patterns */ }
  }
  // 回退: 行级中文模式
  const lu = head.match(META_PATTERNS.lastUpdated)?.[1] || null;
  const lv = head.match(META_PATTERNS.lastVerified)?.[1] || null;
  const nv = head.match(META_PATTERNS.nextVerify)?.[1] || null;
  let cd = null;
  const cdMatch = head.match(META_PATTERNS.cycleDays);
  if (cdMatch) cd = parseInt(cdMatch[1], 10);
  else {
    const zh = head.match(META_PATTERNS.cycleZh)?.[1]?.trim();
    if (zh) {
      if (/每季度|3个月/.test(zh)) cd = 90;
      else if (/每半年|6个月/.test(zh)) cd = 180;
      else if (/每年|12个月/.test(zh)) cd = 365;
      else if (/每月|1个月/.test(zh)) cd = 30;
      else if (/半月/.test(zh)) cd = 15;
    }
  }
  return { sopVersion: null, owner: null, scope: null, lastUpdated: lu, lastVerified: lv, verifyCycleDays: cd, nextVerifyAt: nv, format: 'line-patterns' };
}

function cycleFromFile(filename, existingCycle) {
  if (existingCycle) return existingCycle;
  // 启发式: SOP 04 合规 45 天，SOP 02/06/07/08/09 选品/评价/监控/PPC/库存 60 天，其它 90 天
  if (/^SOP-04-/.test(filename)) return 45;
  if (/^(SOP-02-|SOP-06-|SOP-07-|SOP-08-|SOP-09-)/.test(filename)) return 60;
  return 90;
}

function checkFile(filename, fullPath, fileKind /* 'ref' | 'sop' */) {
  const result = {
    file: filename,
    kind: fileKind,
    status: 'ok',
    sopMeta: null,
    note: '',
    refreshNeeded: false,
    refreshed: false,
  };
  let content;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch (e) {
    result.status = 'missing-meta';
    result.note = '无法读取: ' + e.message;
    return result;
  }
  const lines = content.split('\n').slice(0, 25);
  const meta = extractMeta(lines);
  result.sopMeta = meta;
  // 缺元数据检查 (3 关键): lastVerified + verifyCycleDays + nextVerifyAt
  if (!meta.lastVerified || !meta.verifyCycleDays || !meta.nextVerifyAt) {
    result.status = 'missing-meta';
    result.note = '缺时效元数据 (需 lastVerified / verifyCycleDays / nextVerifyAt 三项齐全)';
    return result;
  }
  // 日期合法性
  const lastV = parseDate(meta.lastVerified);
  const nextV = parseDate(meta.nextVerifyAt);
  if (!lastV || !nextV) {
    result.status = 'malformed-date';
    result.note = `日期解析失败 (lastVerified=${meta.lastVerified}, nextVerifyAt=${meta.nextVerifyAt})`;
    return result;
  }
  // 状态判断
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = daysBetween(today, nextV);
  if (days < 0) {
    result.status = 'overdue';
    result.note = `已过期${-days}天 (下次核实日${meta.nextVerifyAt})`;
    result.refreshNeeded = true;
  } else if (days <= thresholdDays) {
    result.status = 'due-soon';
    result.note = `${days}天后到期 (${meta.nextVerifyAt})`;
    result.refreshNeeded = true;
  } else {
    result.status = 'ok';
    result.note = `剩余${days}天 (${meta.nextVerifyAt})`;
  }
  // —— refresh: 写回文件, 替换 nextVerifyAt 和 lastVerified
  if (refreshNext && result.refreshNeeded) {
    try {
      const cycle = cycleFromFile(filename, meta.verifyCycleDays);
      const newLastV = today;
      const newNextV = addDays(today, cycle);
      let replaced = 0;
      const newContent = content
        .replace(/(lastVerified[：:]\s*)"?\d{4}-\d{2}-\d{2}"?/, (_, p1) => { replaced++; return p1 + '"' + fmtDate(newLastV) + '"'; })
        .replace(/(最后核实[：:]\s*)"?\d{4}-\d{2}-\d{2}"?/, () => { replaced++; return '最后核实: ' + fmtDate(newLastV); })
        .replace(/(nextVerifyAt[：:]\s*)"?\d{4}-\d{2}-\d{2}"?/, (_, p1) => { replaced++; return p1 + '"' + fmtDate(newNextV) + '"'; })
        .replace(/(下次核实[：:]\s*)"?\d{4}-\d{2}-\d{2}"?/, () => { replaced++; return '下次核实: ' + fmtDate(newNextV); });
      if (replaced > 0) {
        // 原子写: 写 tmp → rename
        const tmp = fullPath + '.tmp.' + Date.now();
        writeFileSync(tmp, newContent, 'utf-8');
        renameSync(tmp, fullPath);
        result.refreshed = true;
        result.status = 'ok';
        result.note = `已刷新: nextVerifyAt=${fmtDate(newNextV)}`;
      }
    } catch (e) {
      result.refreshError = e.message;
      result.note += ' (refresh 失败: ' + e.message + ')';
    }
  }
  return result;
}

/* ——————————————————————— main ——————————————————————— */
const scanTargets = []; // [{filename, fullPath, kind}]

if (singleDir) {
  // 只读扫描(无 --refresh-next) 允许任意目录(便于测试临时目录场景;
  // 写回模式(--refresh-next) 强制限制在 SKILL_ROOT 内避免误写系统目录
  const absDir = refreshNext
    ? assertInsideSkillRoot(singleDir, '--dir')
    : resolve(SKILL_ROOT, singleDir); // 仍从 SKILL_ROOT 解析，但允许跳出(临时目录绝对路径也可)
  // 如果用户给的是绝对路径（如系统临时目录），上面 resolve 不会拼 SKILL_ROOT, 直接用原路径
  const finalDir = existsSync(absDir) && statSync(absDir).isDirectory()
    ? absDir
    : (existsSync(singleDir) && statSync(singleDir).isDirectory() ? resolve(singleDir) : absDir);
  if (!existsSync(finalDir) || !statSync(finalDir).isDirectory()) {
    const msg = '--dir 不是目录或不存在: ' + finalDir;
    if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg, code: 'E_DIR_NOT_FOUND' }) + '\n');
    else console.error('❌ ' + msg);
    process.exit(2);
  }
  // 双重保险: 写回时再校验一次目录在 SKILL_ROOT 内
  if (refreshNext && !finalDir.startsWith(SKILL_ROOT + sep)) {
    const msg = '--dir + --refresh-next 拒绝写回 Skill 根目录外的文件: ' + finalDir;
    if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: msg, code: 'E_REFRESH_OUTSIDE_ROOT' }) + '\n');
    else console.error('❌ ' + msg);
    process.exit(2);
  }
  for (const f of readdirSync(finalDir).filter((x) => x.endsWith('.md'))) {
    scanTargets.push({ filename: f, fullPath: join(finalDir, f), kind: 'custom-dir' });
  }
} else {
  // 扫 references + sop 两个目录
  if (existsSync(DEFAULT_REFS_DIR)) {
    for (const f of readdirSync(DEFAULT_REFS_DIR)) {
      if (!f.endsWith('.md')) continue;
      // v1.0.4 自动发现: 头部含完整时效元数据(3项齐全)才纳入巡检
      let head = '';
      try {
        head = readFileSync(join(DEFAULT_REFS_DIR, f), 'utf-8').split('\n').slice(0, 25).join('\n');
      } catch { continue; }
      const hasLastV = META_PATTERNS.lastVerified.test(head);
      const hasCycle = META_PATTERNS.cycleDays.test(head) || META_PATTERNS.cycleZh.test(head);
      const hasNext = META_PATTERNS.nextVerify.test(head);
      if (!(hasLastV && hasCycle && hasNext)) continue; // 方法论/分类体系文件自动跳过
      scanTargets.push({ filename: f, fullPath: join(DEFAULT_REFS_DIR, f), kind: 'ref' });
    }
  }
  if (existsSync(DEFAULT_SOP_DIR)) {
    for (const f of readdirSync(DEFAULT_SOP_DIR)) {
      if (!f.endsWith('.md')) continue;
      scanTargets.push({ filename: f, fullPath: join(DEFAULT_SOP_DIR, f), kind: 'sop' });
    }
  }
}

const items = scanTargets.map((t) => checkFile(t.filename, t.fullPath, t.kind));

const statusDist = {};
for (const it of items) statusDist[it.status] = (statusDist[it.status] || 0) + 1;

const hasP0 = items.some((it) => it.status === 'missing-meta' || it.status === 'malformed-date');
const hasOverdue = items.some((it) => it.status === 'overdue');
const hasDueSoon = items.some((it) => it.status === 'due-soon');
let healthScore;
if (hasP0) healthScore = 0;
else if (hasOverdue) healthScore = Math.max(0, 10 - 5 * (statusDist.overdue || 0) - 2 * (statusDist['due-soon'] || 0));
else if (hasDueSoon) healthScore = Math.max(6, 10 - (statusDist['due-soon'] || 0));
else healthScore = 10;

const actionRequired = items.filter((it) => ['overdue', 'missing-meta', 'malformed-date'].includes(it.status));
const pendingRefresh = items.filter((it) => it.refreshNeeded && !it.refreshed);

const overall = hasP0 ? 'critical' : hasOverdue ? 'warning' : hasDueSoon ? 'attention' : 'healthy';
const report = {
  ok: true,
  scanMode: singleDir ? 'single-dir: ' + singleDir : 'refs + sops',
  thresholdDays,
  totalFiles: items.length,
  refCount: items.filter((x) => x.kind === 'ref').length,
  sopCount: items.filter((x) => x.kind === 'sop').length,
  refreshedCount: items.filter((x) => x.refreshed).length,
  status: overall,
  healthScore,
  maxHealthScore: 10,
  statusDistribution: statusDist,
  actionRequired,
  pendingRefresh,
  items,
  report: {
    summary:
      overall === 'healthy' ? '所有文件时效健康 ✅'
      : overall === 'attention' ? `${pendingRefresh.length} 份文件将在 ${thresholdDays} 天内到期，建议安排核实`
      : overall === 'warning' ? `${statusDist.overdue || 0} 份文件已过期，请立即核实并 --refresh-next`
      : `存在硬伤 ${statusDist['missing-meta'] || 0} 缺meta / ${statusDist['malformed-date'] || 0} 日期非法，请立即修复`,
    nextActions: [
      hasP0 ? 'P0: 补全 missing-meta / 修复 malformed-date 文件的 meta 头 25 行' : null,
      hasOverdue ? 'P0: 核实 overdue 文件，运行 `node scripts/sop-timeliness-check.mjs --refresh-next --json` 写回新日期' : null,
      pendingRefresh.length ? 'P1: 核实 due-soon 文件，确认无误后 refresh' : null,
      '每月首周一: 全量跑一次本脚本作为 SOP 生效性门禁',
    ].filter(Boolean),
  },
};

if (wantJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log('\n📅 数据文件 + SOP 时效巡检  v1.0.4');
  console.log('═'.repeat(64));
  console.log('  扫描模式: ' + report.scanMode + '   到期窗口: ≤' + thresholdDays + '天');
  console.log('  扫描文件: refs=' + report.refCount + '  sops=' + report.sopCount + '  合计=' + report.totalFiles + '   本次刷新: ' + report.refreshedCount);
  console.log('  总体: ' + overall + '   健康度: ' + healthScore + '/10');
  console.log('  分布: ' + Object.entries(statusDist).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('─'.repeat(64));
  for (const it of items) {
    const icon =
      it.status === 'ok' ? '✅'
      : it.status === 'due-soon' ? '⏰'
      : it.status === 'overdue' ? '🔴'
      : '❌';
    const metaBits = [];
    if (it.sopMeta?.sopVersion) metaBits.push('v' + it.sopMeta.sopVersion);
    if (it.sopMeta?.owner) metaBits.push(it.sopMeta.owner.split('(')[0]);
    console.log(
      '  ' + icon + ' [' + String(it.kind).padEnd(4) + '] ' + it.file.padEnd(36)
      + ' ' + it.status.padEnd(14) + ' ' + it.note
      + (metaBits.length ? '  {' + metaBits.join(' · ') + '}' : '')
    );
  }
  if (report.pendingRefresh.length) {
    console.log('─'.repeat(64));
    console.log('  ⏳ 待 refresh (' + report.pendingRefresh.length + ' 项): 加 --refresh-next 将 nextVerifyAt 推到今天 + verifyCycleDays');
  }
  if (actionRequired.length) {
    console.log('─'.repeat(64));
    console.log('  ⚠️ 需处理 ' + actionRequired.length + ' 项:');
    for (const it of actionRequired) console.log('    - [' + it.status + '] ' + it.file + ': ' + it.note);
  }
  console.log('─'.repeat(64));
  for (const a of report.report.nextActions) console.log('  👉 ' + a);
  console.log('═'.repeat(64));
}

process.exit(actionRequired.length > 0 ? 1 : 0);
