#!/usr/bin/env node
/**
 * competitor-checklist.mjs — 竞品分析与Listing质量检查清单（跨平台 Node 版）
 *
 * 跨平台 Node 版：Windows 原生无需 bash / WSL。
 * 纯文本输出 & --json 输出两种模式, 可直接打印给用户手填, 或让
 * LLM 按 checklist 逐项收集并生成报告。
 *
 * 用法:
 *   node scripts/competitor-checklist.mjs                     # 交互式清单打印
 *   node scripts/competitor-checklist.mjs --product B0XXXXXX   # 指定 ASIN / URL / 产品关键词
 *   node scripts/competitor-checklist.mjs --json              # 输出结构化 JSON
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const saveReport = args.includes('--save');

function getArg(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
}
const product = getArg('product') || 'unknown';
const platform = getArg('platform') || 'generic';
const outFile = getArg('out') || null;

const SECTIONS = [
  {
    key: 'listing_quality',
    title: 'Listing 质量评分',
    items: [
      '标题包含核心关键词（≤60字符 / 平台限额内,前后权重高）',
      '主图符合平台规范(白底1000px+,无水印/logo不遮挡,真实比例)',
      '副图≥5张,覆盖: 功能卖点 → 尺寸参数 → 使用场景 → 包装清单 → 竞品对比',
      '要点(Bullet Points / 五点描述)覆盖 5 个独立卖点,每条开头 2 字加粗强关键词',
      'A+页面 / EBC 内容已优化: 品牌故事 + 场景图 + 对比表 + FAQ',
      '主图视频 / 360° 视图已上传',
      '描述区 HTML 标签正确,无乱码、无违禁词',
    ],
  },
  {
    key: 'price_analysis',
    title: '价格分析',
    items: [
      '当前售价在同类 TOP10 价格区间的 [P25~P75] 内',
      '与 TOP10 竞品均值价差 ≤20%（否则需差异化卖点支撑）',
      '促销策略已配置: Coupon / Deal / LD / 7DD 节奏记录',
      '捆绑销售 / 变体 / 多件折扣 已评估',
      '运费 / FBA 配送费 已计入毛利对比',
    ],
  },
  {
    key: 'review_analysis',
    title: '评价 / 评分分析',
    items: [
      '总评价数已记录; 评分 ≥ 4.0 视为健康, < 3.5 为高危区',
      '近 30 天新增评价数 vs 竞品同指标对比（反应近期动销）',
      '差评 TOP5 原因已分类: 质量 / 尺寸 / 物流 / 客服 / 描述不符',
      '好评关键词 TOP5 已提取,用于 Listing & PPC 词库',
      'QA 区 TOP10 问题已覆盖到五点 / A+ / 描述',
      'Rating 波动近 7 天无异常陡降',
    ],
  },
  {
    key: 'competitive_landscape',
    title: '竞争格局',
    items: [
      '头部卖家数（近 30 天月销 > 1000）已统计（≤5 为蓝海,>20 为红海）',
      '平台自营(Amazon/天猫自营等)占比 ≤30% 为安全区',
      'TOP3 品牌集中度 CR3: 高 (>70%) / 中 (40~70%) / 低 (<40%)',
      '新品进入频率: 近 90 天 ≥3 个新进入者 → 热度高 / 风险并存',
      '广告位密度: 首页自然位 vs Sponsored 位占比',
      '品牌 / 专利 / 外观设计侵权风险已排查',
    ],
  },
  {
    key: 'ppc_ads',
    title: 'PPC / 广告数据',
    items: [
      '过去 14 天 ACOS ≤ 类目均值（记录数值）',
      'TACOS (总广告销售成本比) ≤ 15% 为健康',
      '核心大词自然排名已进首页前 20',
      '长尾关键词覆盖 ≥ 100 个,否定词库持续维护中',
      'SB / SD / DSP 等上层漏斗已启用 (品牌/展示/再营销)',
      'Search Term Report 定期(每周)复盘: 否词 + 加词',
    ],
  },
  {
    key: 'supply_chain',
    title: '供应链与库存',
    items: [
      'FBA 在途 + 可售 ≈ 90 天销量 (断货风险 ≤ 5%)',
      '冗余库存 (90 天滞销) 占比 ≤ 15%',
      '补货 Lead time 与海运/空运/快递 三档策略已定',
      '毛利率 ≥ 30% (按全部成本计,退货+广告+仓储已含)',
      '单一工厂依赖度 ≤ 60%（备选工厂至少 1 家已审厂）',
    ],
  },
  {
    key: 'compliance_risk',
    title: '合规 / 风险',
    items: [
      'Listing 文案无违禁词（绝对化用语 / 医疗宣称 / 平台红线词）',
      '图片无侵权 / 无网图无授权 / 无明星肖像 / 无水印拼接',
      '目标国认证已取得 (CE / FCC / UL / FDA / CPC / PSE 等)',
      '商标已注册或正在受理,品牌备案通过',
      '类目审核 / 危险品审核 / 婴童用品等特殊审核已过',
      '税务: 目标国 VAT / EORI / Sales Tax Permit 已配置',
    ],
  },
];

const report = {
  product,
  platform,
  generatedAt: new Date().toISOString(),
  checklistVersion: '1.0.4',
  totalSections: SECTIONS.length,
  totalItems: SECTIONS.reduce((s, x) => s + x.items.length, 0),
  sections: SECTIONS.map((s) => ({
    key: s.key,
    title: s.title,
    items: s.items.map((text) => ({ text, done: false, note: '' })),
  })),
};

if (saveReport) {
  // 先做 outFile 路径穿越检查，再创建任何目录（避免拒绝路径时仍产生 reports/ 残留）
  let target;
  if (outFile) {
    // 安全: 拒绝 ".." 路径穿越 (白名单: reports/ 或 绝对路径但不包含..)
    if (/\\\.\.\\|\/\.\.\/|^\.\.|[<>|]/.test(outFile)) {
      const msg = '拒绝可疑路径穿越: --out=' + outFile;
      if (wantJson) process.stderr.write(JSON.stringify({ ok: false, error: msg, code: 'E_PATH_TRAVERSAL' }) + '\n');
      else console.error('❌ ' + msg);
      process.exit(2);
    }
    target = resolve(process.cwd(), outFile);
    // 自定义 --out 的父目录可能不存在，需先创建（避免 writeFileSync ENOENT 崩溃）
    const outParent = dirname(target);
    if (!existsSync(outParent)) mkdirSync(outParent, { recursive: true });
  } else {
    const outDir = join(__dirname, '..', 'reports');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const fname =
      'competitor-checklist-' +
      product.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) +
      '-' +
      new Date().toISOString().slice(0, 10) +
      '.json';
    target = join(outDir, fname);
  }
  writeFileSync(target, JSON.stringify(report, null, 2), 'utf8');
  report.savedAs = target;
}

if (wantJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log('═'.repeat(70));
  console.log('📊 竞品分析检查清单  v1.0.4');
  console.log('产品: ' + product + '   平台: ' + platform + '   生成: ' + report.generatedAt);
  console.log('共 ' + report.totalSections + ' 节 / ' + report.totalItems + ' 项 — 每项填完再给最终结论');
  console.log('═'.repeat(70));
  let idx = 1;
  for (const s of report.sections) {
    console.log('\n▍' + s.title);
    console.log('─'.repeat(60));
    for (const it of s.items) {
      console.log('  [' + String(idx++).padStart(2, '0') + '] ☐ ' + it.text);
    }
  }
  console.log('\n' + '═'.repeat(70));
  console.log('💡 填完后, 将未打勾项按 "必做(7天内)/应该做(30天内)/可选" 分级排优先级。');
  if (report.savedAs) console.log('💾 JSON 报告另存为: ' + report.savedAs);
  console.log('═'.repeat(70));
}
process.exit(0);
