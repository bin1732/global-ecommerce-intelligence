#!/usr/bin/env node
/**
 * deploy.mjs — 全球电商全链路智能系统 一键部署（跨平台 Node 版）
 *
 * 跨平台 Node 版：Windows 原生无需 bash / WSL。
 * 为各 AI host 在 Skill 根目录生成一个"引用入口文件",指向本 Skill 的
 * SKILL.md / references / scripts。host 启动时读取对应目录拿到上下文。
 *
 * 版本号/名称/描述读取自 ../SKILL.md 的 YAML frontmatter（业界标准入口），
 * 避免硬编码漂移；不依赖额外清单文件。
 *
 * 用法:
 *   node scripts/deploy.mjs                    # generic 模式 (exports 目录生成一套通用入口)
 *   node scripts/deploy.mjs --target all       # 所有 target
 *   node scripts/deploy.mjs --target claude,openclaw,codex,chatgpt,deepseek,gemini,kimi
 *   node scripts/deploy.mjs --target coze,bailian,skillhub   # 国内平台规范入口
 *   node scripts/deploy.mjs --target custom --out /path/to/custom_dir
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(__dirname, '..');

// 从 SKILL.md frontmatter 解析 name/version/description（业界标准元数据入口）
function readFrontmatter() {
  let content;
  try {
    content = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  } catch (e) {
    process.stderr.write(JSON.stringify({ ok: false, error: '无法读取 SKILL.md: ' + e.message, code: 'E_SKILL_READ' }) + '\n');
    process.exit(2);
  }
  const fm = content.split('---')[1] || '';
  const get = (key) => {
    const m = fm.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    name: get('name'),
    version: get('version'),
    description: get('description'),
  };
}
const meta = readFrontmatter();
const SKILL_NAME = meta.name || 'global-ecommerce-intelligence';
const SKILL_VERSION = meta.version || '1.0.4';
const SKILL_DESC = meta.description || '';

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
}
const targetRaw = getArg('target') || 'generic';
const targets = targetRaw.split(',').map((s) => s.trim()).filter(Boolean);
const customOut = getArg('out') || null;
const dryRun = args.includes('--dry-run');

const ALL_TARGETS = ['claude', 'openclaw', 'codex', 'chatgpt', 'deepseek', 'gemini', 'kimi', 'coze', 'bailian', 'skillhub'];
const ALLOWED_TARGETS = new Set(['generic', 'custom', ...ALL_TARGETS, 'all']);
const badTargets = targets.filter((t) => !ALLOWED_TARGETS.has(t));
if (badTargets.length) {
  const msg = '未知 target: ' + badTargets.join(', ') + ' (可选: all | ' + ALL_TARGETS.join(' | ') + ' | generic | custom)';
  process.stderr.write(JSON.stringify({ ok: false, error: msg, code: 'E_BAD_TARGET' }) + '\n');
  process.exit(2);
}
if (targets.includes('custom') && !customOut) {
  process.stderr.write(JSON.stringify({ ok: false, error: '--target custom 需要 --out <目录>', code: 'E_CUSTOM_NO_OUT' }) + '\n');
  process.exit(2);
}
const effectiveTargets = targets.includes('all')
  ? (targets.includes('generic') ? [...ALL_TARGETS, 'generic'] : ALL_TARGETS)
  : targets;

function ensureDir(d) {
  if (!dryRun && !existsSync(d)) mkdirSync(d, { recursive: true });
}

function writeFile(p, content) {
  if (dryRun) {
    // dry-run 诊断信息走 stderr, 不污染 stdout 的 JSON 输出
    process.stderr.write('[dry-run] would write ' + p + ' (' + content.length + ' bytes)\n');
  } else {
    writeFileSync(p, content, 'utf8');
  }
}

const deploys = [];

/* ———————————————————————— generic / exports 目录通用入口 ———————————————————————— */
if (effectiveTargets.includes('generic')) {
  const expDir = join(SKILL_DIR, 'exports');
  ensureDir(expDir);
  deploys.push({ target: 'generic', kind: 'exports 目录生成 5 份 host 入口', count: 0 });
  // 命名必须与 exports/ 预置文件完全一致，否则 deploy 会生成重复/覆盖文件
  // （gemini/kimi 预置名是 *-instructions.md，不是 *-system-prompt.md）
  const genericSet = {
    'README.md':
      '# 全球电商全链路智能系统 · 部署指引\n\n' +
      '版本: ' + SKILL_VERSION + '\n\n' +
      '本目录为各 AI 编程助手（host）提供 Skill 引用入口文件模板。\n' +
      '选你正在用的 host,将其对应入口复制到 host 的"自定义指令 / Skill / 项目指令"输入框即可。\n\n' +
      '- claude: 部署时生成 `.claude/SKILL_REFERENCE.md`\n' +
      '- openclaw: 部署时生成 `.openclaw/skill.yaml`\n' +
      '- codex: 部署时生成 `.codex/instructions.md`\n' +
      '- chatgpt / deepseek / gemini / kimi: 见同目录对应 md\n',
    'chatgpt-instructions.md':
      '# ChatGPT Custom Instructions · 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
      '当对话涉及电商选品、平台合规、定价、利润、跨境、评价分析、竞品监控、Listing/PPC/库存任一主题时,\n' +
      '先加载以下知识层,再输出结构化回答:\n\n' +
      '1. 引擎协议层（见 references/engine/ 下 4 份 md）: 反幻觉 / 执行降级 / 专家团 / 自演化\n' +
      '2. 知识库（按入口选 5 份内,见 references/）\n' +
      '3. 需要计算时调用 scripts/ 下对应工具（profit/BSR/情感/价格弹性/竞品清单/env-check/sop巡检/知识过滤）\n',
  };
  // 补齐 deepseek/gemini/kimi 入口（文件名与预置一致: deepseek-system-prompt.md / gemini-instructions.md / kimi-instructions.md）
  const hostPrompts = {
    'deepseek-system-prompt.md': 'DeepSeek',
    'gemini-instructions.md': 'Gemini',
    'kimi-instructions.md': 'Kimi',
  };
  for (const [fname, host] of Object.entries(hostPrompts)) {
    genericSet[fname] =
      '# ' + host + ' System Prompt · 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
      'Skill 根目录: ' + SKILL_DIR + '\n\n' +
      '核心指令同 chatgpt-instructions.md。涉及平台合规时必须走 references/engine/expert-panel.md 合规专家一票否决流程。\n';
  }
  // 幂等: 已存在的预置文件(内容为人工精心编写)不覆盖,仅补齐缺失文件,避免 deploy 清掉手写内容
  for (const [name, body] of Object.entries(genericSet)) {
    const full = join(expDir, name);
    if (existsSync(full) && !dryRun) {
      deploys[deploys.length - 1].note += ' (跳过已存在: ' + name + ')';
      continue;
    }
    writeFile(full, body);
    deploys[deploys.length - 1].count++;
  }
}

/* ———————————————————————— Claude Code (.claude/SKILL_REFERENCE.md) ———————————————————————— */
if (effectiveTargets.includes('claude')) {
  const dir = join(SKILL_DIR, '.claude');
  ensureDir(dir);
  const body =
    '# 电商 Skill 引用\n' +
    '主文件: ' + SKILL_DIR + '/SKILL.md\n' +
    '参考: ' + SKILL_DIR + '/references/\n' +
    '脚本: ' + SKILL_DIR + '/scripts/\n';
  writeFile(join(dir, 'SKILL_REFERENCE.md'), body);
  deploys.push({ target: 'claude', kind: 'Claude Code 引用入口已写入 .claude/', count: 1 });
}

/* ———————————————————————— OpenClaw (.openclaw/skill.yaml) ———————————————————————— */
if (effectiveTargets.includes('openclaw')) {
  const dir = join(SKILL_DIR, '.openclaw');
  ensureDir(dir);
  // 注意: 统一为 SKILL.md frontmatter 的 version 避免版本漂移
  const yml =
    'name: ' + SKILL_NAME + '\n' +
    'version: ' + SKILL_VERSION + '\n' +
    'description: ' + JSON.stringify(SKILL_DESC) + '\n' +
    'entry: ' + SKILL_DIR + '/SKILL.md\n' +
    'references: ' + SKILL_DIR + '/references/\n' +
    'scripts: ' + SKILL_DIR + '/scripts/\n' +
    'sop: ' + SKILL_DIR + '/references/sop/\n' +
    'tags: [ecommerce, cross-border, global, business, retail, multilingual]\n';
  writeFile(join(dir, 'skill.yaml'), yml);
  deploys.push({ target: 'openclaw', kind: 'OpenClaw skill.yaml 已写入（version=' + SKILL_VERSION + '，跟随 SKILL.md frontmatter 防漂移）', count: 1 });
}

/* ———————————————————————— Codex CLI (.codex/instructions.md) ———————————————————————— */
if (effectiveTargets.includes('codex')) {
  const dir = join(SKILL_DIR, '.codex');
  ensureDir(dir);
  const body =
    '# 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
    '参考文件: ' + SKILL_DIR + '/SKILL.md\n' +
    '脚本目录: ' + SKILL_DIR + '/scripts/\n' +
    '知识库: ' + SKILL_DIR + '/references/\n' +
    '引擎协议: ' + SKILL_DIR + '/references/engine/\n';
  writeFile(join(dir, 'instructions.md'), body);
  deploys.push({ target: 'codex', kind: 'Codex CLI 指令入口已写入 .codex/', count: 1 });
}

/* ———————————————————————— ChatGPT / DeepSeek / Gemini / Kimi（写 ~/.aihosts/${host} 目录模板） ———————————————————————— */
const HOME_HOSTS = {
  chatgpt: 'ChatGPT 自定义 GPT / GPTs knowledge 文件模板',
  deepseek: 'DeepSeek 自定义指令模板',
  gemini: 'Gemini / Google AI Studio 项目指令模板',
  kimi: 'Kimi / Moonshot 自定义指令模板',
};
for (const host of ALL_TARGETS.filter((t) => ['chatgpt', 'deepseek', 'gemini', 'kimi'].includes(t))) {
  if (!effectiveTargets.includes(host)) continue;
  const dir = join(SKILL_DIR, '.' + host);
  ensureDir(dir);
  const body =
    '# ' + HOME_HOSTS[host] + ' v' + SKILL_VERSION + '\n\n' +
    'SKILL: ' + SKILL_DIR + '/SKILL.md\n' +
    '引擎协议: ' + SKILL_DIR + '/references/engine/\n' +
    '知识库(按需选入口加载 ≤5 份): ' + SKILL_DIR + '/references/\n' +
    'SOP: ' + SKILL_DIR + '/references/sop/\n' +
    '执行脚本: ' + SKILL_DIR + '/scripts/\n\n' +
    '使用方式: 将 SKILL.md 全文作为系统提示或 GPTs Instructions 上传,\n' +
    'references/ 按知识过滤脚本的 loaded[] 结果按需加载,避免上下文溢出。\n';
  writeFile(join(dir, 'instructions.md'), body);
  deploys.push({ target: host, kind: host + ' 指令入口已写入 .' + host + '/', count: 1 });
}

/* ———————————————————————— Coze 扣子（技能包规范入口） ———————————————————————— */
if (effectiveTargets.includes('coze')) {
  const dir = join(SKILL_DIR, '.coze');
  ensureDir(dir);
  const body =
    '# Coze 扣子 · 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
    '本技能包根目录已包含规范要求的 SKILL.md（name/description 元数据 + 执行指令）。\n' +
    '上传方式：将本技能包打包为 .zip（根目录须含 SKILL.md），通过扣子编程「上传技能包」导入，\n' +
    '或生成 .skill 文件后在本地上传至编程技能列表。平台会自动做安全检测与重新打包。\n\n' +
    '联网说明：核心功能离线可用；实时汇率/税率需联网获取（联网为可选增强）。\n';
  writeFile(join(dir, 'SKILL_REFERENCE.md'), body);
  deploys.push({ target: 'coze', kind: 'Coze 上传指引已写入 .coze/（zip 根目录含 SKILL.md 即符合规范）', count: 1 });
}

/* ———————————————————————— 阿里百炼 / 通义灵码 ———————————————————————— */
if (effectiveTargets.includes('bailian')) {
  // 通义灵码约定路径: .lingma/skills/<slug>/SKILL.md（自动发现）
  const dir = join(SKILL_DIR, '.lingma', 'skills', 'global-ecommerce-intelligence');
  ensureDir(dir);
  const body =
    '# 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
    '阿里百炼：将本技能包打包为 .zip（根目录须含 SKILL.md，YAML 声明 name/description，≤10MB）\n' +
    '后在百炼控制台「技能 → 自定义」上传，审查通过后挂载到智能体并指定版本号。\n' +
    '通义灵码：本目录即 .lingma/skills/ 约定路径，按约定目录自动发现。\n\n' +
    '联网说明：核心功能离线可用；实时汇率/税率需联网获取（联网为可选增强）。\n';
  writeFile(join(dir, 'SKILL.md'), body);
  deploys.push({ target: 'bailian', kind: '阿里百炼/通义灵码入口已写入 .lingma/skills/', count: 1 });
}

/* ———————————————————————— 腾讯 SkillHub / 智能体开发平台 ———————————————————————— */
if (effectiveTargets.includes('skillhub')) {
  const dir = join(SKILL_DIR, '.skillhub');
  ensureDir(dir);
  const body =
    '# 腾讯 SkillHub · 全球电商全链路智能系统 v' + SKILL_VERSION + '\n\n' +
    '本技能包根目录包含符合规范的 SKILL.md（frontmatter 含 name/description/version/category/platforms）。\n' +
    '上传方式：将本技能包打包为 .zip（≤10MB，根目录须含 SKILL.md），\n' +
    '在腾讯云智能体开发平台「新建 Skills → 导入 Skills 包」上传，平台自动进行格式校验 + YAML 校验 + 安全扫描。\n\n' +
    '联网说明：核心功能离线可用；实时汇率/税率需联网获取（联网为可选增强）。\n';
  writeFile(join(dir, 'SKILL_REFERENCE.md'), body);
  deploys.push({ target: 'skillhub', kind: '腾讯 SkillHub 上传指引已写入 .skillhub/', count: 1 });
}

/* ———————————————————————— custom out ———————————————————————— */
if (customOut) {
  const outDir = resolve(customOut);
  // 安全: 拒绝包含 ".." 的路径穿越, 并确保不写系统目录
  if (/\\\.\.\\|\/\.\.\/|^\.\.|[<>|]/.test(customOut) && !outDir.includes(SKILL_DIR)) {
    const msg = '拒绝可疑路径穿越(..): ' + customOut;
    process.stderr.write(JSON.stringify({ ok: false, error: msg, code: 'E_PATH_TRAVERSAL' }) + '\n');
    process.exit(2);
  }
  ensureDir(outDir);
  const body =
    '# 全球电商全链路智能系统 · custom target v' + SKILL_VERSION + '\n\n' +
    'SKILL: ' + SKILL_DIR + '/SKILL.md\n' +
    'engine: ' + SKILL_DIR + '/references/engine/\n' +
    'references: ' + SKILL_DIR + '/references/\n' +
    'sop: ' + SKILL_DIR + '/references/sop/\n' +
    'scripts: ' + SKILL_DIR + '/scripts/\n';
  writeFile(join(outDir, 'skill-entry.md'), body);
  deploys.push({ target: 'custom', kind: 'custom 出口写入 ' + outDir, count: 1 });
}

const result = {
  ok: true,
  skillName: SKILL_NAME,
  skillVersion: SKILL_VERSION,
  skillDir: SKILL_DIR,
  effectiveTargets,
  deploys,
  totalWrites: deploys.reduce((s, d) => s + d.count, 0),
  dryRun: !!dryRun,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(0);
