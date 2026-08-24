#!/usr/bin/env python3
"""bsr_analyzer.py — BSR销量估算 (v1.0.4 修复版)

修复点:
  1. 诚实标注: 所有系数为"经验估算,未经真实数据校准"
  2. 置信区间标注: "经验区间,非统计置信区间"
  3. --json 输出模式
  4. 模型来源说明: Amazon用对数回归,淘宝/Shopee/京东为参数化假设(无真实数据标定)

⚠️ 重要声明:
  本脚本所有系数(base_sales/decay/coeff)均为经验估算值,
  未经真实销售数据校准。输出仅供量级参考,不可作为精确预测。
  实际销量受季节/促销/评价/广告/Listing质量等多因素影响。

用法:
    python3 bsr_analyzer.py --bsr 1500 --category home --json
    python3 bsr_analyzer.py --bsr 500 --category electronics --price 29.99 --market amazon --json
    python3 bsr_analyzer.py --bsr 3000 --category clothing --price 19.99 --market taobao --season summer --json
    python3 bsr_analyzer.py --bsr 2000 --category clothing --market temu --json   # v1.0.4新增: 置信度极低

参数:
    --bsr       排名
    --category  品类
    --price     售价(可选)
    --market    市场: amazon/taobao/shopee/jd/temu/shein/tiktok（v1.0.4 新增后三者,置信度极低）
    --season    季节(可选)
    --json      输出JSON
"""

import argparse
import json
import math

# ─────────────────────────────────────────────────────────────
# 品类系数 — 经验估算值,无真实数据标定
# 来源: 行业经验+公开BSR-销量关系讨论整理
# 用途: 不同品类BSR-销量曲线斜率差异的近似
# ─────────────────────────────────────────────────────────────
CATEGORY_COEFF = {
    "electronics": 1.5, "home": 1.2, "kitchen": 1.2, "toys": 1.0,
    "sports": 1.1, "beauty": 0.9, "clothing": 0.8, "books": 0.7,
    "tools": 1.3, "pet": 1.4, "default": 1.0,
    "automotive": 1.1, "grocery": 1.6, "health": 1.3, "garden": 1.0,
    "office": 0.9, "music": 0.6, "outdoor": 1.2, "baby": 1.1,
}

# 季节因子 — 经验估算
SEASON_FACTOR = {
    "spring": 1.0,
    "summer": {"clothing": 1.3, "sports": 1.4, "outdoor": 1.5, "beauty": 1.2, "toys": 0.8, "default": 1.0},
    "fall": {"clothing": 1.1, "home": 1.2, "kitchen": 1.3, "default": 1.0},
    "winter": {"clothing": 1.4, "toys": 1.8, "electronics": 1.3, "health": 1.2, "home": 1.1, "default": 1.0},
}

# 各市场模型 — ⚠️ 参数化假设,非真实数据拟合
# Amazon: 对数回归(base=50000, decay=0.55)为业界常用经验公式
# 淘宝/Shopee/京东: 无公开BSR-销量数据,系数为推测值,置信度极低
# Temu/SHEIN/TikTok(v1.0.4新增): 平台无公开BSR体系,以下为量级参考的参数化假设,置信度极低
TAOBAO_MODEL = {"coeff": 0.85, "base_sales": 15000, "decay": 0.65}
SHOPEE_MODEL = {"coeff": 0.6, "base_sales": 8000, "decay": 0.55}
JD_MODEL = {"coeff": 0.9, "base_sales": 12000, "decay": 0.62}
TEMU_MODEL = {"coeff": 0.5, "base_sales": 6000, "decay": 0.5}
SHEIN_MODEL = {"coeff": 0.45, "base_sales": 5000, "decay": 0.5}
TIKTOK_MODEL = {"coeff": 0.4, "base_sales": 4000, "decay": 0.5}

MODEL_DISCLAIMER = {
    "amazon": "对数回归经验公式,业界常用,置信度:中",
    "taobao": "参数化假设,无真实数据标定,置信度:低",
    "shopee": "参数化假设,无真实数据标定,置信度:低",
    "jd": "参数化假设,无真实数据标定,置信度:低",
    "temu": "参数化假设,平台无公开BSR体系,仅供量级参考,置信度:极低",
    "shein": "参数化假设,平台无公开BSR体系,仅供量级参考,置信度:极低",
    "tiktok": "参数化假设,平台无公开BSR体系,仅供量级参考,置信度:极低",
}


def log_regression_sales(bsr, base, decay, coeff):
    if bsr <= 0:
        bsr = 1
    return max(round(base * math.pow(bsr, -decay) * coeff), 1)


def estimate_sales_amazon(bsr, category="default", season=None):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    base_sales = log_regression_sales(bsr, 50000, 0.55, coeff)
    if season and season in SEASON_FACTOR:
        sf = SEASON_FACTOR[season]
        if isinstance(sf, dict):
            factor = sf.get(category, sf.get("default", 1.0))
        else:
            factor = sf
        base_sales = max(round(base_sales * factor), 1)
    return base_sales


def estimate_sales_taobao(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = TAOBAO_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def estimate_sales_shopee(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = SHOPEE_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def estimate_sales_jd(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = JD_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def estimate_sales_temu(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = TEMU_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def estimate_sales_shein(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = SHEIN_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def estimate_sales_tiktok(bsr, category="default"):
    coeff = CATEGORY_COEFF.get(category, 1.0)
    m = TIKTOK_MODEL
    return log_regression_sales(bsr, m["base_sales"], m["decay"], coeff * m["coeff"])


def confidence_interval(sales, bsr):
    """经验区间 — 非统计置信区间,无数据支撑,仅供量级参考"""
    if bsr <= 100:
        low, high = 0.6, 1.4
    elif bsr <= 1000:
        low, high = 0.65, 1.35
    elif bsr <= 5000:
        low, high = 0.7, 1.3
    elif bsr <= 20000:
        low, high = 0.75, 1.25
    else:
        low, high = 0.8, 1.2
    return {
        "low": max(round(sales * low), 1),
        "mid": sales,
        "high": max(round(sales * high), 1),
        "interval_type": "经验区间(非统计置信区间)",
    }


def build_report(bsr, category, price, market, season):
    if market == "taobao":
        sales = estimate_sales_taobao(bsr, category)
        market_name = "淘宝"
    elif market == "shopee":
        sales = estimate_sales_shopee(bsr, category)
        market_name = "Shopee"
    elif market == "jd":
        sales = estimate_sales_jd(bsr, category)
        market_name = "京东"
    elif market == "temu":
        sales = estimate_sales_temu(bsr, category)
        market_name = "Temu"
    elif market == "shein":
        sales = estimate_sales_shein(bsr, category)
        market_name = "SHEIN"
    elif market == "tiktok":
        sales = estimate_sales_tiktok(bsr, category)
        market_name = "TikTok Shop"
    else:
        sales = estimate_sales_amazon(bsr, category, season)
        market_name = "Amazon"

    ci = confidence_interval(sales, bsr)
    coeff = CATEGORY_COEFF.get(category, 1.0)
    disclaimer = MODEL_DISCLAIMER.get(market, "")

    report = {
        "市场": market_name,
        "排名": bsr,
        "品类": category,
        "品类系数": coeff,
        "模型": "对数回归(经验估算)",
        "模型置信度": disclaimer,
        "月销量估算": {
            "保守": ci["low"],
            "中性": ci["mid"],
            "乐观": ci["high"],
        },
        "日销量估算": {
            "保守": round(ci["low"] / 30, 1),
            "中性": round(ci["mid"] / 30, 1),
            "乐观": round(ci["high"] / 30, 1),
        },
        "区间类型": ci["interval_type"],
        "季节": season,
    }

    if price:
        report["售价"] = price
        report["月收入估算"] = {
            "保守": round(ci["low"] * price, 2),
            "中性": round(ci["mid"] * price, 2),
            "乐观": round(ci["high"] * price, 2),
        }

    # 竞争区位判断
    if bsr < 500:
        report["竞争区位"] = "🏆 竞争激烈区(头部卖家)"
    elif bsr < 5000:
        report["竞争区位"] = "📈 增长潜力区"
    elif bsr < 50000:
        report["竞争区位"] = "🔍 长尾市场区"
    else:
        report["竞争区位"] = "⚠️ 低销量区(需评估)"

    return report


def print_report(report):
    print(f"\n📊 BSR 销量分析 — {report['市场']}")
    print("=" * 40)
    print(f"  排名: {report['排名']}")
    print(f"  品类: {report['品类']} (系数: {report['品类系数']})")
    print(f"  模型: {report['模型']}")
    print(f"  ⚠️ {report['模型置信度']}")
    print("  ─────────────────────────")
    print("  月销量估算:")
    print(f"    🔴 保守: {report['月销量估算']['保守']} 单")
    print(f"    🟡 中性: {report['月销量估算']['中性']} 单")
    print(f"    🟢 乐观: {report['月销量估算']['乐观']} 单")
    print("  日销量估算:")
    print(f"    🔴 保守: {report['日销量估算']['保守']} 单")
    print(f"    🟡 中性: {report['日销量估算']['中性']} 单")
    print(f"    🟢 乐观: {report['日销量估算']['乐观']} 单")
    if "售价" in report:
        print("  ─────────────────────────")
        print(f"  售价: {report['售价']}")
        print("  月收入估算:")
        print(f"    🔴 保守: {report['月收入估算']['保守']}")
        print(f"    🟡 中性: {report['月收入估算']['中性']}")
        print(f"    🟢 乐观: {report['月收入估算']['乐观']}")
    print("  ─────────────────────────")
    print(f"  {report['竞争区位']}")
    print("  ─────────────────────────")
    print(f"  ⚠️ 区间类型: {report['区间类型']}")
    print("=" * 40)


def main():
    parser = argparse.ArgumentParser(description="BSR销量估算 v1.0.4")
    parser.add_argument("--bsr", type=int, required=True, help="排名")
    parser.add_argument("--category", type=str, default="default", help="品类")
    parser.add_argument("--price", type=float, default=0, help="售价")
    parser.add_argument("--market", type=str, default="amazon",
                        choices=["amazon", "taobao", "shopee", "jd", "temu", "shein", "tiktok"], help="市场")
    parser.add_argument("--season", type=str, default=None,
                        choices=["spring", "summer", "fall", "winter"], help="季节")
    parser.add_argument("--json", action="store_true", help="输出JSON")
    args = parser.parse_args()

    if args.bsr <= 0:
        parser.error("--bsr 必须为正整数（排名1为最佳）")

    report = build_report(args.bsr, args.category, args.price, args.market, args.season)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_report(report)


if __name__ == "__main__":
    main()
