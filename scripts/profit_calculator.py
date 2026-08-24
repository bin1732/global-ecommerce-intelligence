#!/usr/bin/env python3
"""profit_calculator.py — 电商利润计算器 (v1.0.4 升级版)

升级点 (v1.0.4 真实数据化):
  1. --fx-live: 自动调用 scripts/fetch-rates.mjs 抓取实时汇率（失败诚实降级到内置快照并标注"非实时"）
  2. --fx-rates <json|文件>: 手动注入实时汇率（格式 {"base":"CNY","rates":{...},"source":"...","fetchedAt":"..."}）
  3. 输出新增"汇率来源"与"汇率抓取时间"字段，杜绝把静态快照当实时数据
  4. 盈亏平衡公式: 纳入初始投入(首批库存+开店+杂费),不再"1个月回本"
  5. --json 输出模式
  6. 诚实标注: 利润为模型计算,实际受退货/损耗/广告波动影响

用法:
    python3 profit_calculator.py --price 199 --cost 80 --commission 15 --logistics 30 --json
    python3 profit_calculator.py --price 199 --cost 80 --commission 15 --fx-live --json
    python3 profit_calculator.py --price 29.99 --cost 8.50 --commission 15 --currency USD --fx-rates fx.json --json
    python3 profit_calculator.py --price 199 --cost 80 --commission 15 --model compare

参数:
    --price         售价
    --cost          产品成本
    --commission    平台佣金比例(%)
    --logistics     物流费用
    --currency      货币(默认CNY)
    --fx-live       抓取实时汇率(调用 fetch-rates.mjs,失败降级快照)
    --fx-rates      注入实时汇率: JSON 字符串或文件路径
    --tax           关税(可选)
    --marketing     营销费用(可选)
    --return-rate   退货率%(可选)
    --monthly-sales 月销量(可选,用于52周预测+盈亏平衡)
    --initial-invest 初始投入(可选,首批库存+开店+杂费,用于盈亏平衡)
    --model         模式: basic/compare
    --json          输出JSON
"""

import argparse
import json
import os
import subprocess
import sys

# ⚠️ 示例汇率快照 — 非实时值（v1.0.4: 优先用 --fx-live/--fx-rates 的实时汇率）
# 最后更新: 2026-08-23
# 来源: 公开汇率信息整理(示例值)
# 实际使用必须以实时汇率为准,profit计算前提示用户核实
FX_RATES = {
    "CNY": 1.0, "USD": 7.25, "EUR": 7.85, "GBP": 9.15, "JPY": 0.048,
    "KRW": 0.0053, "SGD": 5.35, "THB": 0.20, "MYR": 1.55, "PHP": 0.13,
    "VND": 0.00029, "IDR": 0.00047, "BRL": 1.45, "MXN": 0.42, "AUD": 4.70,
    "CAD": 5.30, "AED": 1.97, "SAR": 1.93, "INR": 0.087, "TRY": 0.21,
}
FX_UPDATED = "2026-08-23"
FX_SOURCE = "内置快照(示例值,非实时; 用 --fx-live 抓取实时汇率)"

# AI vs 传统团队成本对比 — 行业估算值,非实测
AI_COST_MONTHLY = {
    "选品分析": 200, "竞品监控": 0, "客服": 1200, "广告优化": 500,
    "合规检查": 0, "内容制作": 300, "数据分析": 0,
}
TRADITIONAL_COST_MONTHLY = {
    "选品分析": 8000, "竞品监控": 6000, "客服": 12000, "广告优化": 10000,
    "合规检查": 5000, "内容制作": 8000, "数据分析": 6000,
}


def convert_to_cny(amount, currency):
    rate = FX_RATES.get(currency, None)
    if rate is None:
        # v1.0.4 修复: 缺失币种不再静默按 1.0 换算（会造成假数据），抛错让调用方降级
        raise KeyError('汇率表中无该币种: ' + currency + '（可用: ' + ','.join(sorted(FX_RATES.keys())) + '）')
    return amount * rate


def calculate_profit(price, cost, commission_pct, logistics, tax=0, marketing=0, return_rate=0):
    commission = price * commission_pct / 100
    refund_cost = price * return_rate / 100
    total_cost = cost + commission + logistics + tax + marketing + refund_cost
    profit = price - total_cost
    margin = (profit / price) * 100 if price > 0 else 0
    roi = (profit / total_cost) * 100 if total_cost > 0 else 0
    return {
        "售价": round(price, 2),
        "产品成本": round(cost, 2),
        "平台佣金": round(commission, 2),
        "物流费用": round(logistics, 2),
        "关税": round(tax, 2),
        "营销费用": round(marketing, 2),
        "退货损耗": round(refund_cost, 2),
        "总成本": round(total_cost, 2),
        "净利润": round(profit, 2),
        "利润率": round(margin, 1),
        "ROI": round(roi, 1),
    }


def breakeven_months(initial_invest, profit_per_unit, monthly_sales):
    """重写盈亏平衡公式

    旧公式bug: fixed_monthly=0时返回1个月,忽略初始投入
    新公式: 回本月数 = 初始投入 / 月净利润
      - initial_invest: 首批库存+开店+杂费等一次性投入
      - profit_per_unit: 单件净利润
      - monthly_sales: 月销量
      - 月净利润 = profit_per_unit * monthly_sales
    """
    monthly_profit = profit_per_unit * monthly_sales
    if monthly_profit <= 0:
        return None  # 无法回本(亏损或无销量)
    if initial_invest <= 0:
        return None  # 未提供初始投入,无法计算
    return round(initial_invest / monthly_profit, 1)


def weekly_projection(profit_per_unit, monthly_sales, weeks=52):
    """52周预测(每4周一个采样点)

    ramp模型: 前12周爬坡(0.3→1.0),之后稳定
    注: ramp公式为经验假设,非真实销售曲线
    """
    weekly_sales = monthly_sales / 4.33
    results = []
    for w in range(1, weeks + 1, 4):
        ramp = min(1.0, 0.3 + 0.7 * (w / 12))
        adj_sales = weekly_sales * ramp * 4.33
        adj_profit = profit_per_unit * adj_sales
        results.append({
            "week": w,
            "monthly_sales": round(adj_sales),
            "monthly_profit": round(adj_profit, 2),
        })
    return results


def compare_mode(as_json=False):
    ai_total = sum(AI_COST_MONTHLY.values())
    trad_total = sum(TRADITIONAL_COST_MONTHLY.values())
    rows = []
    for key in TRADITIONAL_COST_MONTHLY:
        t = TRADITIONAL_COST_MONTHLY[key]
        a = AI_COST_MONTHLY[key]
        pct = round((1 - a / t) * 100) if t > 0 else 0
        rows.append({"item": key, "traditional": t, "ai": a, "saving_pct": pct})

    data = {
        "method": "行业估算值(非实测)",
        "rows": rows,
        "ai_total_monthly": ai_total,
        "traditional_total_monthly": trad_total,
        "saving_pct": round((1 - ai_total / trad_total) * 100),
        "annual_saving": (trad_total - ai_total) * 12,
    }
    if as_json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    print("\n📊 AI vs 传统团队 成本对比 (月) [行业估算,非实测]")
    print("=" * 50)
    print(f"  {'项目':<10} {'传统团队':>10} {'AI赋能':>10} {'节省':>8}")
    print(f"  {'─'*40}")
    for r in rows:
        print(f"  {r['item']:<10} ¥{r['traditional']:>8,} ¥{r['ai']:>8,} {r['saving_pct']:>6}%")
    print(f"  {'─'*40}")
    print(f"  {'合计':<10} ¥{trad_total:>8,} ¥{ai_total:>8,} {data['saving_pct']:>6}%")
    print(f"  年节省: ¥{data['annual_saving']:,}")
    print("=" * 50)


def load_fx_live():
    """调用 scripts/fetch-rates.mjs 抓取实时汇率；失败诚实降级到内置快照"""
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fetch-rates.mjs')
    if not os.path.exists(script):
        return None, None, 'fetch-rates.mjs 缺失,使用内置快照(示例值,非实时)'
    try:
        r = subprocess.run(
            ['node', script, '--json'],
            capture_output=True, text=True, timeout=20,
        )
        if r.returncode != 0:
            return None, None, 'fetch-rates.mjs 抓取失败(退出码 %d),使用内置快照: %s' % (r.returncode, (r.stdout or r.stderr or '').strip()[:120])
        data = json.loads(r.stdout)
        if not data.get('ok') or not data.get('rates'):
            return None, None, 'fetch-rates.mjs 返回异常,使用内置快照'
        return data['rates'], data.get('fetchedAt'), data.get('source') or '实时API'
    except Exception as e:
        return None, None, 'fetch-rates.mjs 调用异常,使用内置快照: %s' % e


def load_fx_rates_arg(raw):
    """--fx-rates: 接受 JSON 字符串或文件路径"""
    if os.path.exists(raw):
        with open(raw, 'r', encoding='utf-8') as f:
            return json.load(f)
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description="电商利润计算器 v1.0.4")
    parser.add_argument("--price", type=float, default=0, help="售价")
    parser.add_argument("--cost", type=float, default=0, help="产品成本")
    parser.add_argument("--commission", type=float, default=15, help="平台佣金比例(%)")
    parser.add_argument("--logistics", type=float, default=0, help="物流费用")
    parser.add_argument("--tax", type=float, default=0, help="关税")
    parser.add_argument("--marketing", type=float, default=0, help="营销费用")
    parser.add_argument("--currency", type=str, default="CNY", help="货币")
    parser.add_argument("--return-rate", type=float, default=0, help="退货率(%)")
    parser.add_argument("--monthly-sales", type=int, default=0, help="月销量")
    parser.add_argument("--initial-invest", type=float, default=0, help="初始投入(首批库存+开店+杂费)")
    parser.add_argument("--model", type=str, default="basic", choices=["basic", "compare"], help="模式")
    parser.add_argument("--fx-live", action="store_true", help="抓取实时汇率(调用 fetch-rates.mjs,失败降级快照)")
    parser.add_argument("--fx-rates", type=str, default=None,
                        help="注入实时汇率: JSON 字符串 {\"base\":\"CNY\",\"rates\":{...}} 或文件路径")
    parser.add_argument("--json", action="store_true", help="输出JSON")
    args = parser.parse_args()

    if args.model == "compare":
        compare_mode(as_json=args.json)
        return

    if args.price <= 0 or args.cost <= 0:
        parser.error("--price and --cost are required in basic mode")

    # —— 汇率来源决策（v1.0.4 真实数据化）：--fx-rates 注入 > --fx-live 实时抓取 > 内置快照
    global FX_RATES, FX_UPDATED, FX_SOURCE
    fx_note = None
    if args.fx_rates:
        try:
            injected = load_fx_rates_arg(args.fx_rates)
            rates = injected.get('rates') or injected
            base = injected.get('base', 'CNY')
            if not isinstance(rates, dict) or not rates:
                fx_note = '--fx-rates 内容无效,使用内置快照'
            else:
                # 统一换算为 1 外币 = X CNY（若注入基准不是 CNY）
                if base == 'CNY':
                    FX_RATES = {k: float(v) for k, v in rates.items() if k}
                else:
                    base_cny = float(rates.get('CNY') or rates.get(base) or 0)
                    if base_cny <= 0:
                        fx_note = '--fx-rates 缺基准换算值,使用内置快照'
                    else:
                        FX_RATES = {k: float(v) / base_cny for k, v in rates.items() if k and float(v) > 0}
                        FX_RATES[base] = 1.0
                FX_UPDATED = (injected.get('fetchedAt') or '实时注入')[:10]
                FX_SOURCE = injected.get('source') or '用户注入(--fx-rates)'
        except Exception as e:
            fx_note = '--fx-rates 解析失败(%s),使用内置快照' % e
    elif args.fx_live:
        live_rates, live_at, live_src = load_fx_live()
        if live_rates:
            FX_RATES = live_rates
            FX_UPDATED = (live_at or '')[:10]
            FX_SOURCE = live_src
        else:
            fx_note = live_src

    try:
        price_cny = convert_to_cny(args.price, args.currency)
        cost_cny = convert_to_cny(args.cost, args.currency)
        logistics_cny = convert_to_cny(args.logistics, args.currency)
        tax_cny = convert_to_cny(args.tax, args.currency)
        marketing_cny = convert_to_cny(args.marketing, args.currency)
    except KeyError as e:
        # v1.0.4 修复: 注入/快照缺币种时诚实报错，不静默按 1.0 换算
        if args.json:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False, indent=2))
        else:
            print('❌ ' + str(e))
        sys.exit(1)

    result = calculate_profit(
        price_cny, cost_cny, args.commission,
        logistics_cny, tax_cny, marketing_cny, args.return_rate
    )
    result["原币"] = args.currency
    result["汇率日期"] = FX_UPDATED
    result["汇率来源"] = FX_SOURCE
    result["汇率说明"] = fx_note or ('实时汇率(来源: %s)' % FX_SOURCE if args.fx_live or args.fx_rates else '内置快照(示例值,非实时,需实时核实)')
    result["计算方法"] = "全链路成本模型(售价-成本-佣金-物流-关税-营销-退货损耗)"

    # 盈亏平衡(需初始投入+月销量)
    breakeven = None
    if args.initial_invest > 0 and args.monthly_sales > 0 and result["净利润"] > 0:
        breakeven = breakeven_months(args.initial_invest, result["净利润"], args.monthly_sales)
        result["初始投入"] = args.initial_invest
        result["月净利润"] = round(result["净利润"] * args.monthly_sales, 2)
        result["盈亏平衡月数"] = breakeven
    elif args.monthly_sales > 0 and result["净利润"] > 0:
        result["月净利润"] = round(result["净利润"] * args.monthly_sales, 2)
        result["盈亏平衡月数"] = None
        result["盈亏平衡提示"] = "未提供--initial-invest,无法计算回本月数(需首批库存+开店等一次性投入)"

    # 52周预测
    if args.monthly_sales > 0 and result["净利润"] > 0:
        result["52周预测"] = weekly_projection(result["净利润"], args.monthly_sales)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print(f"\n📊 利润分析 (CNY, 原币: {args.currency})")
    print(f"  ⚠️ 汇率: {result['汇率来源']} ({result['汇率日期']}) {'— ' + result['汇率说明'] if result['汇率说明'] else ''}")
    print("=" * 35)
    for k, v in result.items():
        if k in ("52周预测", "原币", "汇率日期", "汇率来源", "汇率说明", "计算方法"):
            continue
        print(f"  {k}: {v}")
    print("=" * 35)
    print(f"  {'✅ 盈利' if result['净利润'] > 0 else '❌ 亏损'}")

    if "52周预测" in result:
        print("\n  📅 52周预测 (每4周, ramp模型为经验假设)")
        print(f"  {'周':>4} {'月销量':>8} {'月利润':>10}")
        print(f"  {'─'*25}")
        for p in result["52周预测"]:
            print(f"  {p['week']:>4} {p['monthly_sales']:>8} ¥{p['monthly_profit']:>9,}")
    print()


if __name__ == "__main__":
    main()
