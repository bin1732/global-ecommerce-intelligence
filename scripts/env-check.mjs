#!/usr/bin/env node
/**
 * env-check.mjs — 环境验证脚本
 *
 * 检测 Python / Node 可用性、各脚本存在性，返回 JSON 报告。
 * 用于执行层前置检查，决定是否降级到纯知识模式。
 *
 * 用法：node scripts/env-check.mjs --json
 * 退出码：0 全部可用，1 Python不可用（部分脚本降级），2 严重缺失
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;

const args = process.argv.slice(2);
const wantJson = args.includes('--json');

function out(obj) {
  if (wantJson) {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  } else {
    console.log(`\n🔍 环境验证报告`);
    console.log('═'.repeat(40));
    console.log(`  Node.js: ${obj.node.available ? '✅ ' + obj.node.version : '❌ 不可用'}`);
    console.log(`  Python:  ${obj.python.available ? '✅ ' + obj.python.version : '❌ 不可用'}`);
    console.log(`\n  脚本状态:`);
    for (const [name, s] of Object.entries(obj.scripts)) {
      console.log(`    ${s.ok ? '✅' : '❌'} ${name} ${s.note ? '(' + s.note + ')' : ''}`);
    }
    console.log('\n  ' + obj.summary);
    console.log('═'.repeat(40));
  }
}

function checkCommand(cmd) {
  // 优先不用 shell:true (减少注入风险), Windows 下 spawnSync 直接传可执行文件名即可
  const args = ['--version'];
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
    if (r.status === 0 || (r.stdout && r.stdout.trim())) {
      return { available: true, version: (r.stdout || r.stderr || '').trim().split('\n')[0] };
    }
  } catch { /* fallthrough 到 shell 兜底 */ }
  // 兜底: 少数环境(如 Windows 下 PATH 别名)需要 shell 才能找到
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: true, timeout: 5000 });
    if (r.status === 0 || (r.stdout && r.stdout.trim())) {
      return { available: true, version: (r.stdout || r.stderr || '').trim().split('\n')[0] };
    }
  } catch { /* ignore */ }
  return { available: false, version: null };
}

const PY_SCRIPTS = ['profit_calculator.py', 'bsr_analyzer.py', 'sentiment_analyzer.py'];
const MJS_SCRIPTS = [
  'env-check.mjs',
  'fetch-rates.mjs',
  'price-elasticity.mjs',
  'knowledge-filter.mjs',
  'sop-timeliness-check.mjs',
  'competitor-checklist.mjs',
  'deploy.mjs',
];

const nodeInfo = checkCommand('node');
let pyInfo = checkCommand('python3');
if (!pyInfo.available) {
  pyInfo = checkCommand('python');
}

const scripts = {};
for (const f of PY_SCRIPTS) {
  const exists = existsSync(join(SCRIPTS_DIR, f));
  scripts[f] = {
    ok: exists && pyInfo.available,
    note: !exists ? '文件缺失' : (!pyInfo.available ? 'Python不可用，降级到知识模式' : null),
    lang: 'python',
  };
}
for (const f of MJS_SCRIPTS) {
  const exists = existsSync(join(SCRIPTS_DIR, f));
  scripts[f] = {
    ok: exists && nodeInfo.available,
    note: !exists ? '文件缺失' : null,
    lang: 'node',
  };
}
const pyOk = pyInfo.available;
const allMjsOk = MJS_SCRIPTS.every((f) => scripts[f].ok);
let summary;
let exitCode;
if (pyOk && allMjsOk) {
  summary = '✅ 全部工具可用，可执行完整分析';
  exitCode = 0;
} else if (allMjsOk) {
  summary = '⚠️ Python不可用，利润/BSR/情感分析脚本降级到知识模式';
  exitCode = 1;
} else {
  summary = '❌ 关键工具缺失，仅可用知识模式';
  exitCode = 2;
}

out({ node: nodeInfo, python: pyInfo, scripts, summary, exitCode });
process.exit(exitCode);
