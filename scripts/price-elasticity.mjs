#!/usr/bin/env node
/**
 * price-elasticity.mjs — 价格弹性计算工具
 *
 * 用两组价格-销量数据计算价格弹性系数,给出调价建议。
 * 公式: E = (ΔQ/Q_avg) / (ΔP/P_avg)
 *   |E| > 1 弹性大 → 降价提总收入
 *   |E| < 1 弹性小 → 提价提总收入
 *   |E| = 1 单位弹性
 *
 * 用法:
 *   node scripts/price-elasticity.mjs --p1 29.99 --q1 1000 --p2 27.99 --q2 1200 --json
 *   node scripts/price-elasticity.mjs --p1 29.99 --q1 1000 --p2 32.99 --q2 850 --json
 *
 * 参数:
 *   --p1, --q1  基准价格与销量
 *   --p2, --q2  调整后价格与销量
 *   --json      输出JSON
 */

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
function get(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? parseFloat(args[i + 1]) : NaN;
}
const p1 = get('p1'), q1 = get('q1'), p2 = get('p2'), q2 = get('q2');

function emit(obj) {
  if (wantJson) {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  } else {
    console.log(`\n📊 价格弹性分析`);
    console.log('═'.repeat(40));
    console.log(`  基准: 价格 ${obj.p1} × 销量 ${obj.q1}`);
    console.log(`  调整: 价格 ${obj.p2} × 销量 ${obj.q2}`);
    console.log(`  ─────────────────────────`);
    console.log(`  弹性系数 E = ${obj.elasticity}`);
    console.log(`  |E| = ${obj.absE}`);
    console.log(`  弹性类型: ${obj.elasticityType}`);
    console.log(`  ─────────────────────────`);
    console.log(`  收入变化: ${obj.revenue1} → ${obj.revenue2} (${obj.revenueChangePct >= 0 ? '+' : ''}${obj.revenueChangePct}%)`);
    console.log(`  💡 建议: ${obj.advice}`);
    console.log('═'.repeat(40));
  }
}

if ([p1, q1, p2, q2].some((v) => isNaN(v)) || p1 <= 0 || p2 <= 0 || q1 <= 0 || q2 <= 0) {
  console.error('用法: node scripts/price-elasticity.mjs --p1 <价> --q1 <量> --p2 <价> --q2 <量> [--json]');
  console.error('错误: 价格和销量必须为正数(销量为0无法计算弹性基准)');
  process.exit(1);
}

const pAvg = (p1 + p2) / 2;
const qAvg = (q1 + q2) / 2;
const dQ = q2 - q1;
const dP = p2 - p1;

if (dP === 0) {
  console.error('错误: 价格无变化, 无法计算弹性');
  process.exit(1);
}

const E = (dQ / qAvg) / (dP / pAvg);
const absE = Math.abs(E);

let elasticityType, advice;
if (absE > 1) {
  elasticityType = '高弹性 (|E|>1)';
  advice = dP < 0
    ? '降价有效: 销量增幅 > 价格降幅, 总收入增加。可继续观察是否进一步降价。'
    : '提价有害: 销量降幅 > 价格增幅, 总收入减少。建议回调价格。';
} else if (absE < 1) {
  elasticityType = '低弹性 (|E|<1)';
  advice = dP > 0
    ? '提价有效: 销量降幅 < 价格增幅, 总收入增加。可适度提价。'
    : '降价无效: 销量增幅 < 价格降幅, 总收入减少。建议回调价格。';
} else {
  elasticityType = '单位弹性 (|E|=1)';
  advice = '价格变动对总收入影响中性, 调价意义不大, 关注差异化。';
}

const revenue1 = p1 * q1;
const revenue2 = p2 * q2;
const revenueChangePct = Math.round((revenue2 / revenue1 - 1) * 1000) / 10;

emit({
  p1, q1, p2, q2,
  elasticity: Math.round(E * 100) / 100,
  absE: Math.round(absE * 100) / 100,
  elasticityType,
  revenue1: Math.round(revenue1 * 100) / 100,
  revenue2: Math.round(revenue2 * 100) / 100,
  revenueChangePct,
  advice,
  method: '中点法弹性公式 E = (ΔQ/Q_avg) / (ΔP/P_avg)',
  confidence: '基于两组数据的点弹性, 样本量小, 置信度:低',
});

process.exit(0);
