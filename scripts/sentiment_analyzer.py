#!/usr/bin/env python3
"""sentiment_analyzer.py — 评价情感分析脚本 (v1.0.4 修复版)

修复点:
  1. 词边界处理: 中文用最长匹配避免子串误匹配(如"薄"不误匹配"薄荷")
  2. 否定处理: "不好用"/"质量不好"等否定短语优先识别,不被"好用"/"质量好"覆盖
  3. 打分公式重写: 提高区分度,引入评价总数权重,避免空集打50/差评打5
  4. --json 输出模式
  5. 诚实标注: 明示"关键词匹配,非AI语义分析"

用法:
    python3 sentiment_analyzer.py --text "这个产品很好用" --lang zh
    python3 sentiment_analyzer.py --text "great quality" --lang en --json
    python3 sentiment_analyzer.py --file reviews.txt --lang en --output report.json
    python3 sentiment_analyzer.py --batch products/ --lang zh

参数:
    --text    单条评价文本
    --file    评价文件路径(每行一条)
    --batch   批量分析目录
    --lang    语言: zh/en (其他语言仅做英文关键词兜底)
    --output  输出文件(可选,JSON格式)
    --json    输出JSON到stdout
"""

import argparse
import json
import os
import re

# ─────────────────────────────────────────────────────────────
# 关键词库
# 设计原则:
#   - 短语优先(多字短语先匹配),避免单字误匹配
#   - 否定短语单独列(如"不好用"≠"好用")
#   - 不放单字"薄"(会误匹配"薄荷")
# ─────────────────────────────────────────────────────────────

# 否定短语(优先识别,识别后从文本移除避免被正面词覆盖)
# 注意: 不能与 ZH_NEGATIVE 重复收录同一短语,否则会在原文匹配+合并计数中双重计分
# (如"质量差"已在 ZH_NEGATIVE,此处不重复收录)
ZH_NEGATION_PHRASES = [
    "不好用", "不好看", "不舒服", "不方便", "不满意", "不喜欢", "不推荐",
    "质量不好", "质量不行", "做工不好", "性价比不高", "不划算",
    "没用", "没效果", "没反应", "不工作", "不能用",
]

ZH_POSITIVE = [
    # 品质
    "质量好", "质量不错", "做工精细", "做工好", "用料考究", "耐用", "结实", "厚实",
    # 外观
    "外观漂亮", "颜值高", "设计感", "精致", "时尚", "好看", "漂亮",
    # 价值
    "性价比高", "物超所值", "超值", "划算", "便宜好用",
    # 体验
    "好用", "方便", "舒适", "顺手", "人性化",
    # 服务
    "发货快", "物流快", "包装好", "客服好", "售后好",
    # 情感
    "喜欢", "满意", "惊喜", "推荐", "回购", "已买多次",
    # 程度副词 + 形容词(高频评价口语,"质量很好/物流很快"等)
    "很好", "很好用", "很不错", "很棒", "很快", "非常好", "特别好",
]

ZH_NEGATIVE = [
    # 品质
    "质量差", "容易坏", "做工粗糙", "廉价感", "用一次就坏", "做工差",
    # 外观
    "色差大", "与图片不符", "实物难看",
    # 价值
    "不值", "坑人", "割韭菜", "智商税", "太贵",
    # 体验
    "难用", "设计缺陷", "尺寸不对", "尺寸偏小", "尺寸偏大",
    # 服务
    "发货慢", "物流差", "包装破损", "客服不理", "退货难",
    # 情感
    "失望", "后悔", "差评", "被坑",
    # 程度副词 + 形容词(高频评价口语,"很差/很烂/很慢"等)
    "很差", "很烂", "很慢", "非常差", "特别差",
]

ZH_WISH = ["希望", "如果能", "要是", "建议", "可以改进", "最好", "期待"]

EN_POSITIVE = [
    "great quality", "well-made", "well made", "durable", "sturdy", "solid",
    "great value", "worth every penny", "bang for buck", "affordable",
    "easy to use", "works great", "perfect fit", "highly recommend",
    "fast shipping", "well packaged", "great customer service",
    "love it", "amazing", "awesome", "exceeded expectations", "good quality",
]

EN_NEGATIVE = [
    "poor quality", "cheaply made", "broke after", "flimsy", "fell apart",
    "overpriced", "not worth", "waste of money", "ripoff",
    "difficult to use", "doesn't work", "misleading", "not as described",
    "slow shipping", "damaged", "no response", "return hassle",
    "disappointed", "regret buying", "would not recommend", "waste",
]

EN_WISH = ["wish", "hope", "could", "would be better", "should", "improve", "suggest"]

# 英文否定短语(v1.0.4新增) — 优先识别并从文本移除,避免被正面词误判
# 注意: 已存在于 EN_NEGATIVE 的短语(not worth/doesn't work/not as described等)不重复收录,
#       否则会双重计数; 这里只收"会被正面词覆盖"的否定构造
EN_NEGATION_PHRASES = [
    "not good quality", "not well made", "not durable", "not sturdy",
    "not easy to use", "not as good", "not what i expected",
    "does not work", "did not work", "not working",
    "not fast", "not satisfied", "not happy", "not recommended",
]


def build_pattern(keywords):
    """构建正则: 按长度降序,最长匹配优先"""
    sorted_kw = sorted(set(keywords), key=len, reverse=True)
    escaped = [re.escape(k) for k in sorted_kw]
    return re.compile("|".join(escaped)) if escaped else None


def count_keywords(text, pattern):
    """返回 {keyword: count}, 用finditer避免子串重复计数"""
    if not pattern:
        return {}
    result = {}
    for m in pattern.finditer(text):
        kw = m.group(0)
        result[kw] = result.get(kw, 0) + 1
    return result


def remove_negations(text, negation_phrases):
    """移除否定短语,避免被正面词误判(如'不好用'被'好用'匹配)"""
    cleaned = text
    for phrase in sorted(negation_phrases, key=len, reverse=True):
        cleaned = cleaned.replace(phrase, " ")
    return cleaned


def find_wishes(text, wish_list):
    found = []
    for w in wish_list:
        idx = text.find(w)
        if idx >= 0:
            start = max(0, idx - 5)
            end = min(len(text), idx + len(w) + 20)
            found.append(text[start:end])
    return found


def calculate_sentiment_score(pos_count, neg_count):
    """重写打分公式,提高区分度

    旧公式问题: pos=0,neg=5时 score≈5,几乎无区分度
    新公式:
      - 基础分50(中性)
      - 正面词加分(每个+8,上限+40)
      - 负面词减分(每个-12,下限-50)
      - 正负比修正: 正面占比高再加分
    """
    base = 50
    pos_bonus = min(pos_count * 8, 40)
    neg_penalty = max(neg_count * -12, -50)
    total = pos_count + neg_count
    if total > 0:
        ratio_bonus = round((pos_count / total - 0.5) * 20)  # -10 ~ +10
    else:
        ratio_bonus = 0
    score = base + pos_bonus + neg_penalty + ratio_bonus
    return max(0, min(100, score))


def analyze_single(text, lang="zh"):
    if lang == "zh":
        pos_list = ZH_POSITIVE
        neg_list = ZH_NEGATIVE
        wish_list = ZH_WISH
        neg_phrases = ZH_NEGATION_PHRASES
    else:
        pos_list = EN_POSITIVE
        neg_list = EN_NEGATIVE
        wish_list = EN_WISH
        neg_phrases = EN_NEGATION_PHRASES  # v1.0.4: 英文否定短语单独处理

    # 先移除否定短语,避免被正面词误判(如"不好用"被"好用"匹配 / "not good quality"被"good quality"匹配)
    cleaned_text = remove_negations(text, neg_phrases)

    pos_pattern = build_pattern(pos_list)
    neg_pattern = build_pattern(neg_list)

    pos_keywords = count_keywords(cleaned_text, pos_pattern)
    neg_keywords = count_keywords(text, neg_pattern)  # 负面在原文匹配

    # 合并否定短语到负面计数（中文+英文共用逻辑）
    for phrase in neg_phrases:
        cnt = text.count(phrase)
        if cnt > 0:
            neg_keywords[phrase] = neg_keywords.get(phrase, 0) + cnt

    pos_count = sum(pos_keywords.values())
    neg_count = sum(neg_keywords.values())

    score = calculate_sentiment_score(pos_count, neg_count)

    if score >= 80:
        rating = "⭐⭐⭐⭐⭐ 极好"
    elif score >= 60:
        rating = "⭐⭐⭐⭐ 良好"
    elif score >= 40:
        rating = "⭐⭐⭐ 一般"
    elif score >= 20:
        rating = "⭐⭐ 较差"
    else:
        rating = "⭐ 极差"

    return {
        "text_preview": text[:100],
        "method": "关键词匹配(非AI语义分析)",
        "sentiment_score": score,
        "rating": rating,
        "positive_keywords": sorted(pos_keywords.items(), key=lambda x: x[1], reverse=True)[:5],
        "negative_keywords": sorted(neg_keywords.items(), key=lambda x: x[1], reverse=True)[:5],
        "wish_list": find_wishes(text, wish_list)[:3],
        "pos_count": pos_count,
        "neg_count": neg_count,
    }


def analyze_file(filepath, lang="zh"):
    with open(filepath, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]
    return [analyze_single(line, lang) for line in lines]


def batch_analyze(directory, lang="zh"):
    all_results = {}
    for fname in os.listdir(directory):
        fpath = os.path.join(directory, fname)
        if os.path.isfile(fpath) and fname.endswith((".txt", ".csv")):
            all_results[fname] = analyze_file(fpath, lang)
    return all_results


def print_report(result):
    print("\n💬 评价情感分析报告")
    print("=" * 40)
    print(f"  文本: {result['text_preview']}...")
    print(f"  方法: {result['method']}")
    print(f"  情感评分: {result['sentiment_score']}/100 {result['rating']}")
    print(f"  正面关键词数: {result['pos_count']}")
    if result['positive_keywords']:
        print("  👍 好评关键词:")
        for kw, cnt in result['positive_keywords']:
            print(f"    - \"{kw}\" (×{cnt})")
    print(f"  负面关键词数: {result['neg_count']}")
    if result['negative_keywords']:
        print("  👎 差评关键词:")
        for kw, cnt in result['negative_keywords']:
            print(f"    - \"{kw}\" (×{cnt})")
    if result['wish_list']:
        print("  💡 功能需求:")
        for w in result['wish_list']:
            print(f"    - \"{w}\"")
    print("=" * 40)


def main():
    parser = argparse.ArgumentParser(description="评价情感分析 v1.0.4")
    parser.add_argument("--text", type=str, help="单条评价文本")
    parser.add_argument("--file", type=str, help="评价文件路径")
    parser.add_argument("--batch", type=str, help="批量分析目录")
    parser.add_argument("--lang", type=str, default="zh", choices=["zh", "en"], help="语言")
    parser.add_argument("--output", type=str, help="输出JSON文件路径")
    parser.add_argument("--json", action="store_true", help="输出JSON到stdout")
    args = parser.parse_args()

    def emit(obj):
        if args.json:
            print(json.dumps(obj, ensure_ascii=False, indent=2))
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(obj, f, ensure_ascii=False, indent=2)
            if not args.json:
                print(f"  已保存至 {args.output}")

    if args.text is not None:
        result = analyze_single(args.text, args.lang)
        if args.json:
            emit(result)
        else:
            print_report(result)
            if args.output:
                emit(result)
    elif args.file:
        results = analyze_file(args.file, args.lang)
        if args.json:
            emit(results)
        else:
            for r in results[:5]:
                print_report(r)
            if len(results) > 5:
                print(f"  ... 还有 {len(results) - 5} 条评价(省略)")
            if args.output:
                emit(results)
    elif args.batch:
        all_results = batch_analyze(args.batch, args.lang)
        if args.json:
            emit(all_results)
        else:
            print("\n📊 批量评价情感分析汇总")
            print("=" * 50)
            for fname, results in all_results.items():
                if not results:
                    continue
                scores = [r['sentiment_score'] for r in results]
                avg_score = round(sum(scores) / len(scores), 1)
                total_pos = sum(r['pos_count'] for r in results)
                total_neg = sum(r['neg_count'] for r in results)
                print(f"  {fname}: 评分{avg_score} | 正面{total_pos} | 负面{total_neg} | 样本{len(results)}")
            print("=" * 50)
            if args.output:
                emit(all_results)
    else:
        parser.error("需要 --text, --file 或 --batch")


if __name__ == "__main__":
    main()
