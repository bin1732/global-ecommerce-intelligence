---
slug: global-ecommerce-intelligence
name: global-ecommerce-intelligence
description: 全球电商全链路智能系统 1.0.4 — 覆盖全球电商平台/品类。智能选品/平台合规/定价/利润/跨境/评价/竞品监控/量化评分+Listing/PPC/库存。集成10个执行工具+实时汇率抓取+反幻觉机制+6位专家团+10份SOP时效巡检+15份知识库精准过滤+12入口自由选择。全球语言自动适配。新手引导可关闭（说"下次不用了"永久关闭）。任何开发阶段可自由进入，不强制全流程。核心功能离线可用，联网为可选增强（实时汇率/税率需联网获取）。
category: 电商与商业
version: 1.0.4
license: MIT
platforms: [Claude Code, OpenClaw, Codex CLI, ChatGPT, DeepSeek, Gemini, Kimi, Coze, Aliyun Bailian, Tencent SkillHub]
instructions: 当对话涉及电商选品、平台合规、定价、利润、跨境、评价分析、竞品监控、Listing/PPC/库存任一主题时，加载本技能：先读引擎协议（references/engine/），再按需加载知识库（references/，单次≤5份），需要计算时调用 scripts/ 下对应工具并如实转达结果与置信度标注。所有估算值必须标注来源/日期/置信度，实时数据需联网获取（离线自动降级为内置快照）。
tags: [ecommerce, cross-border, global, business, intelligence, retail, multilingual, sentiment-analysis, price-monitoring, BSR-prediction, listing-optimization, ppc, inventory]
# —— 引擎协议（AI 助手每次触发 Skill 时都应加载并遵守）——
engine:
  anti-hallucination: ./references/engine/anti-hallucination.md
  execution-protocol: ./references/engine/execution-protocol.md
  expert-panel: ./references/engine/expert-panel.md
  evolution-protocol: ./references/engine/evolution-protocol.md
# —— 可执行脚本（AI 助手按需调用，禁止跳过返回码判断；键名即脚本文件名）——
scripts:
  env-check: ./scripts/env-check.mjs
  fetch-rates: ./scripts/fetch-rates.mjs
  profit_calculator: ./scripts/profit_calculator.py
  bsr_analyzer: ./scripts/bsr_analyzer.py
  sentiment_analyzer: ./scripts/sentiment_analyzer.py
  price-elasticity: ./scripts/price-elasticity.mjs
  knowledge-filter: ./scripts/knowledge-filter.mjs
  sop-timeliness-check: ./scripts/sop-timeliness-check.mjs
  competitor-checklist: ./scripts/competitor-checklist.mjs
  deploy: ./scripts/deploy.mjs
metadata:
  openclaw:
    source: file
    version: 1.0.4
    tags: [ecommerce, cross-border, global, business, retail, sentiment, pricing, ppc, inventory]
---

# 全球电商全链路智能系统 1.0.4

> 全球电商平台 · 全品类 · 智能全链路 · 反幻觉 · 6位专家团 · 10份SOP · 15份知识库精准过滤

---

## ⚙️ 新会话首次触发 — 强制执行 3 步

> 本 Skill 提供的所有内容，AI 助手**首次触发时必须按以下步骤加载**，否则视为输出不完整、不可信。

```
步骤 1 — 加载引擎协议（4 份，顺序固定不可调换）：
   1.1  references/engine/anti-hallucination.md   → 所有数据标注来源/日期/置信度，估算明示估算
   1.2  references/engine/execution-protocol.md   → L1工具→L2知识→L3诚实声明 三级降级 + 失败如实告知
   1.3  references/engine/expert-panel.md         → 6 专家合议机制 + 合规一票否决
   1.4  references/engine/evolution-protocol.md   → SOP时效巡检 + 用户反馈闭环

步骤 2 — 检测运行环境：
       node scripts/env-check.mjs --json
   退出码 0 → 全链路可用
   退出码 1 → Python 不可用，利润/BSR/情感脚本降级到知识模式（只给方法论 + 诚实标注"脚本未实际运算"）
   退出码 2 → Node/MJS 脚本也不可用，纯知识模式

步骤 3 — 新手引导（仅首次；用户说"下次不用了"后永久跳过）：
       展示「二、新手引导」模板（带 12 个入口 + 诚实声明）
```

---

## ⚖️ 专家团强制触发场景（6 类，不触发视为违规）

> 以下 6 类决策**必须**触发 references/engine/expert-panel.md 的「建议 → 少数派 → 主理人」3 轮合议流程，
> **不允许单专家直接拍板**（尤其是合规维度拥有一票否决权）：
>
> 1. **选品最终推荐**：对预算 ≥1万 或 SKU ≥3 的选品结论给出前（小预算可只过老选 + 合规 2 人）
> 2. **上架合规终审**：任何国家/平台的 Listing 上线前（平台违禁词 / 类目认证 / 目标国税务 / 侵权 4 关）
> 3. **定价调价策略**：调价幅度 ≥10% 或多 SKU 批量调价前（先过价格弹性 → 算账 → 监价 3 人交叉）
> 4. **跨境出海方案**：首次进入新目标国（跨境 + 合规 2 位一票否决权）
> 5. **广告预算 ≥月毛利 20%**：PPC 大预算分配前（PPC 专家 + 算账 + 监价 3 人交叉）
> 6. **库存补货 ≥60 天销量**：大金额采购前（库存 + 算账 + 跨境 3 人交叉）
>
> 合议结果必须在最终回答末尾附：
> ```
> 【专家团结论】6/6 人通过（合规未否决，跨境未否决，算账ROI≥阈值）
> 【异议记录】<如有少数派观点则简述，无则写"无异议">
> 【用户否决权】用户可一票推翻上述结论，推翻后给出替代方案需重新走 3 轮合议
> ```

---

## 一、版本定位

| 项目 | 说明 |
|------|------|
| **版本** | 1.0.4（锁定） |
| **覆盖范围** | 全球主流电商平台（详见第五章） |
| **语言** | 自动适配用户输入语言（60种语言映射，见 language-guide.md） |
| **入口** | 自由选择不绑架：智能选品/平台合规/定价/利润/跨境/Listing/PPC/库存 任意入口 |
| **新用户引导** | 首次触发，可选永久关闭（说"下次不用了"） |
| **联网要求** | 核心功能离线可用；实时汇率/税率等需联网获取（可选增强，离线自动降级为标注快照） |
| **反幻觉** | 所有数据标注来源+日期+置信度，估算明示为估算 |
| **专家团** | 6位专家（老选/合规/算账/跨境/评价/监价），合规一票否决 |
| **时效巡检** | 19个文件(9数据+10SOP)自动核实周期扫描，过期告警 |

---

## 二、新手引导

> 首次使用触发。说"下次不用了"永久关闭。

```
📖 欢迎使用「全球电商全链路智能系统 1.0.4」

能力入口：
🛒 智能选品   — "帮我分析宠物用品在亚马逊的机会"
📋 平台合规   — "淘宝有哪些违禁词"
💰 定价分析   — "帮我定价这款产品，成本50元"
🧮 利润计算   — "计算利润 成本80 售价199 平台佣金15%"
🌍 跨境指导   — "我想把产品卖到日本"
💬 评价分析   — "分析这个产品的评价情感"
📈 竞品监控   — "监控竞品每日价格变化"
🎯 量化评分   — "帮我给这个选品打分(0-100)"
📝 Listing优化 — "帮我优化Amazon标题"
📊 PPC广告   — "我的ACOS太高怎么办"
📦 库存管理   — "该补多少货"
📈 市场趋势   — "分析XX市场趋势"

支持语言：60种（自动检测，详见 language-guide.md）
覆盖平台：Amazon/Shopee/Lazada/TikTok/淘宝/京东/拼多多 等

🔌 联网说明（重要）：
  本技能核心功能完全离线可用（利润/BSR/情感/价格弹性/合规检查等均本地计算，无需联网）。
  联网为可选增强：
  · 联网 → 可抓取实时汇率（fetch-rates.mjs，公开汇率 API）与实时核实税率/平台规则
  · 离线 → 自动使用内置快照，所有估算值均标注"示例/置信度"，不影响主流程
  · 汇率/税率等实时数据必须联网获取，离线时请以标注为准，不要当作实时值

⚠️ 诚实声明：所有数据标注来源与置信度，估算明示为估算，不包装成精确值。
▶ 直接告诉我你想做什么。
```

---

## 三、自由入口

| 入口 | 触发词 | 模式 | 加载知识 |
|------|--------|------|---------|
| **智能选品** | "帮我分析XX品类" / "选品" | 实时数据+BSR估算 | product-selection.md + product-categories.md |
| **平台合规** | "XX平台规则" / "违禁词" | 规则查询+违规检测 | platform-rules.md |
| **定价分析** | "帮我定价" / "竞品价格" | 竞品监控+定价策略 | pricing-analysis.md + daily-price-monitor.md |
| **利润计算** | "计算利润" / "能赚多少" | 全链路成本计算 | pricing-analysis.md + cross-border-guide.md |
| **跨境指导** | "卖到XX国" / "cross-border" | 物流/税务/支付/认证 | cross-border-guide.md + us-sales-tax.md |
| **评价分析** | "分析评价" / "评价情感" | 关键词匹配情感分析 | review-sentiment.md |
| **竞品监控** | "监控竞品价格" / "每日价格" | 监控框架+预警 | daily-price-monitor.md + pricing-analysis.md |
| **量化评分** | "选品评分" / "打分" | 6维度0-100评分 | product-selection.md |
| **Listing优化** | "优化标题" / "Listing" | 标题/五点/A+优化 | listing-optimization.md |
| **PPC广告** | "ACOS高" / "广告优化" | 广告架构+诊断 | ppc-advertising.md |
| **库存管理** | "补货" / "断货" / "库存" | 补货公式+断货应对 | inventory-management.md |
| **市场趋势** | "分析XX市场趋势" | 全球电商趋势 | 2026-ecommerce-trends.md + world-ecommerce.md |

> 路由命中后，调用 `knowledge-filter.mjs --entry <入口>` 精准加载（上限5文件/次）。

---

## 四、核心模块详解

### 模块A：智能选品
**参考**：`references/product-selection.md`

| 功能 | 说明 | 置信度 |
|------|------|:------:|
| 市场趋势分析 | 热门品类趋势追踪+新兴品类发现 | 中 |
| 竞品分析 | 价格监控+销量估算+评价分析 | 中 |
| 利润计算 | 自动计算成本+利润空间+ROI | 高(用户输入) |
| 爆款预测 | 基于BSR估算+趋势 | 低 |
| 关键词分析 | 搜索热度+竞争度+趋势 | 中 |
| 量化评分 | 6维度0-100评分 | 中 |

### 模块B：全球平台合规
**参考**：`references/platform-rules.md`

- 各大电商平台规则查询（最后核实日期见文件头）
- 违规类型识别与风险等级评估
- 处罚标准说明
- 敏感词/违禁词查询
- 申诉指导

### 模块C：定价分析
**参考**：`references/pricing-analysis.md`、`scripts/price-elasticity.mjs`

- 竞品定价策略分析
- 成本反推计算
- 价格弹性测试（调用 price-elasticity.mjs）
- 促销定价建议

### 模块D：利润计算器
**参考**：`scripts/profit_calculator.py`

- 全链路成本计算（产品成本+平台佣金+物流+关税+营销+退货损耗）
- 多币种转换（⚠️ 汇率为示例值，需实时核实）
- 盈亏平衡分析（含初始投入，不再恒返回1个月）
- 52周财务预测
- AI vs 传统团队成本对比

### 模块E：跨境电商全链路
**参考**：`references/cross-border-guide.md`、`references/us-sales-tax.md`

- 目标市场选择
- 跨境物流方案
- 各国税务合规（⚠️ 税率季度复核）
- 支付方案
- 各国产品认证要求

### 模块F：评价情感分析
**参考**：`references/review-sentiment.md`、`scripts/sentiment_analyzer.py`

| 功能 | 说明 |
|------|------|
| 好评关键词提取 | 高频正面词统计，TOP5 |
| 差评关键词提取 | 高频负面词统计，TOP5 |
| 情感倾向分析 | 正面/中立/负面分布 |
| 功能需求挖掘 | "希望""如果能"→改进方向 |
| 竞品提及分析 | 用户提及竞品频次 |
| 情感评分 | 0-100量化评分 |
| 否定处理 | "不好用"不被"好用"覆盖 |

> ⚠️ 方法：关键词匹配（非AI语义分析），置信度:中

### 模块G：每日竞品价格监控
**参考**：`references/daily-price-monitor.md`

| 监控项 | 频率 | 预警阈值 |
|--------|------|----------|
| 竞品价格变动 | 每日 | >5%波动触发 |
| Buy Box拥有者变化 | 每日 | 丢失Buy Box触发 |
| BSR排名变动 | 每日 | 连续7天下跌触发 |
| 新品上架监控 | 每周 | 新竞品上架提醒 |
| 评论数量变化 | 每周 | 月增评论>100触发 |
| 促销活动监控 | 每日 | 竞品降价>10%触发 |

> ⚠️ 监控框架而非后台守护进程。AI无法后台轮询，需用户主动触发或对接外部爬虫。

### 模块H：量化选品评分系统
**参考**：`references/product-selection.md`

| 维度 | 权重 | 测量指标 |
|------|------|----------|
| 需求热度 | 20% | 搜索量/月销量/增长趋势 |
| 竞争强度 | 20% | 卖家数/头部集中度/评价门槛 |
| 利润空间 | 20% | 毛利率/净利率/ROI |
| 差异化机会 | 15% | 差评痛点/竞品缺口/创新空间 |
| 供应链可行性 | 15% | 货源稳定/MOQ/成本竞争力 |
| 合规风险 | 10% | 认证需求/平台限制/侵权风险 |

**评级**：75-100⭐⭐⭐⭐⭐推荐 | 50-74⭐⭐⭐⭐有条件 | 25-49⭐⭐⭐谨慎 | <25⭐⭐不推荐

### 模块I：Listing优化
**参考**：`references/listing-optimization.md`

- 标题公式（Amazon/Shopee/淘宝差异）
- 五点描述模板
- 关键词分层（L1核心/L2长尾/L3场景/L4竞品）
- 主图规范（各平台）
- A+内容框架
- Listing质量自检清单

### 模块J：PPC广告管理
**参考**：`references/ppc-advertising.md`

- 核心指标（CPC/CTR/CVR/ACOS/TACOS/ROAS）
- Amazon三段式广告架构（自动→手动精准→手动广泛）
- 出价与预算策略（按阶段）
- 4大报表解读
- 广告诊断速查

### 模块K：库存管理
**参考**：`references/inventory-management.md`

- 补货量计算公式
- 断货应对（5级预警+应急策略）
- 冗余库存处理（清仓4策略）
- FBA长期仓储费
- 季节性库存规划

---

## 五、全球电商平台覆盖

| 区域 | 国家/地区 | 电商平台 |
|------|----------|----------|
| **中国** | 中国大陆 | 淘宝、天猫、京东、拼多多、抖音电商、快手电商、小红书电商、唯品会、苏宁、国美 |
| | 香港 | HKTVmall、Price.com.hk |
| | 台湾 | PChome、momo购物、Shopee TW |
| **全托管/社交** | — | **Temu**、**SHEIN**、**TikTok Shop**、AliExpress、速卖通 |
| **北美洲** | 美国 | Amazon US、eBay、Walmart、Etsy、Shopify、Target、Best Buy、Costco |
| | 加拿大 | Amazon CA、Shopify、Canadian Tire、Walmart CA |
| | 墨西哥 | Mercado Libre MX、Amazon MX、Coppel |
| **欧洲** | 英国 | Amazon UK、eBay UK、ASOS、John Lewis、Argos |
| | 德国 | Amazon DE、Otto、Zalando、eBay DE |
| | 法国 | Amazon FR、Cdiscount、Fnac、Veepee |
| | 意大利 | Amazon IT、eBay IT、Zalando IT |
| | 西班牙 | Amazon ES、El Corte Inglés、Zalando ES |
| | 荷兰 | Bol.com、Amazon NL |
| | 瑞典/北欧 | Amazon SE、CDON、Zalando |
| | 东欧 | Allegro(波兰)、Ozon(RU)、Wildberries(RU) |
| **东南亚** | 新加坡 | Shopee SG、Lazada SG、Amazon SG |
| | 马来西亚 | Shopee MY、Lazada MY |
| | 泰国 | Shopee TH、Lazada TH |
| | 越南 | Shopee VN、Lazada VN、Tiki |
| | 印度尼西亚 | Shopee ID、Tokopedia、Lazada ID |
| | 菲律宾 | Shopee PH、Lazada PH |
| **南亚** | 印度 | Amazon IN、Flipkart、Meesho、Myntra |
| | 巴基斯坦 | Daraz PK |
| | 孟加拉国 | Daraz BD |
| | 斯里兰卡 | Daraz LK |
| **拉丁美洲** | 巴西 | Mercado Libre BR、Shopee BR、Magazine Luiza |
| | 阿根廷 | Mercado Libre AR |
| | 智利 | Mercado Libre CL |
| | 哥伦比亚 | Mercado Libre CO |
| | 秘鲁 | Mercado Libre PE |
| **中东** | 阿联酋 | Amazon AE、Noon |
| | 沙特阿拉伯 | Noon SA、Amazon SA |
| | 以色列 | AZRIELI、Yad2 |
| | 土耳其 | Trendyol、Hepsiburada |
| **非洲** | 尼日利亚 | Jumia NG、Konga |
| | 肯尼亚 | Jumia KE、Kilimall |
| | 南非 | Takealot、Superbalist |
| | 埃及 | Jumia EG |
| | 摩洛哥 | Jumia MA |
| | 加纳 | Jumia GH |
| **大洋洲** | 澳大利亚 | Amazon AU、eBay AU、Catch.com.au、Kogan |
| | 新西兰 | Trade Me、Amazon NZ |
| **日本/韩国** | 日本 | Rakuten、Amazon JP、Yahoo Shopping、Mercari |
| | 韩国 | Coupang、Gmarket、Auction、11Street |

> ⚠️ 平台覆盖表为完整列表，但各平台深度数据(规则/佣金/费率)以 references/ 文件为准，部分平台数据较薄，引用时标注"需验证"。

---

## 六、资源索引

### 引擎协议（references/engine/）
| 文件 | 说明 |
|------|------|
| `references/engine/anti-hallucination.md` | 反幻觉协议（数据时效/置信度/自检） |
| `references/engine/execution-protocol.md` | 执行层协议（三级降级/JSON优先） |
| `references/engine/expert-panel.md` | 专家团审查协议（6专家/否决权） |
| `references/engine/evolution-protocol.md` | 自进化协议（SOP时效巡检机制） |

### 知识库（references/）
| 文件 | 说明 | 时效周期 |
|------|------|:--------:|
| `references/product-selection.md` | 智能选品引擎+量化评分 | — |
| `references/product-categories.md` | 全球产品全品类分类 | — |
| `references/platform-rules.md` | 全球平台合规规则 | 每季度 |
| `references/pricing-analysis.md` | 定价分析 | 每季度 |
| `references/cross-border-guide.md` | 跨境合规税务物流 | 每季度 |
| `references/us-sales-tax.md` | 美国各州销售税 | 每季度 |
| `references/world-ecommerce.md` | 全球电商平台和市场数据 | 每半年 |
| `references/review-sentiment.md` | AI评价情感分析引擎 | — |
| `references/daily-price-monitor.md` | 每日竞品价格监控 | — |
| `references/2026-ecommerce-trends.md` | 2026电商趋势分析 | 每年 |
| `references/language-guide.md` | 全球60语言切换 | — |
| `references/beginner-guide.md` | 新用户引导 | — |
| `references/listing-optimization.md` | Listing优化指南 | 每半年 |
| `references/ppc-advertising.md` | PPC广告管理 | 每半年 |
| `references/inventory-management.md` | 库存管理 | 每半年 |

### 脚本（scripts/）
| 脚本 | 语言 | 说明 |
|------|:---:|------|
| `scripts/env-check.mjs` | Node | 环境验证（Python/Node双检测） |
| `scripts/fetch-rates.mjs` | Node | 实时汇率抓取（公开API多源轮换，失败诚实降级） |
| `scripts/profit_calculator.py` | Python | 利润计算器（52周预测+盈亏平衡+--json+--fx-live实时汇率） |
| `scripts/bsr_analyzer.py` | Python | BSR销量预测（对数回归+置信区间+--json） |
| `scripts/sentiment_analyzer.py` | Python | 评价情感分析（否定处理+--json） |
| `scripts/price-elasticity.mjs` | Node | 价格弹性计算（中点法+调价建议） |
| `scripts/knowledge-filter.mjs` | Node | 知识加载过滤（12入口×P0/P1/P2） |
| `scripts/sop-timeliness-check.mjs` | Node | 数据+SOP时效巡检（19文件自动发现核实周期扫描） |
| `scripts/competitor-checklist.mjs` | Node | 竞品+Listing质量7大项检查清单 |
| `scripts/deploy.mjs` | Node | 多AI Host部署入口生成（Claude/OpenClaw/Codex等） |

### 系统文件
| 文件 | 说明 |
|------|------|
| `SKILL.md` | 主文件：YAML 元数据（name/version/description）+ 引擎协议 + 脚本清单（单一元数据入口） |

> 结构说明：本 Skill 本体仅含 `SKILL.md` + `references/`（知识库/引擎协议/SOP）+ `scripts/`（执行工具），符合 Agent Skills 开放规范与各平台上传要求。

---

## 七、反幻觉协议（核心，每次交互执行）

> 详见 `references/engine/anti-hallucination.md`

### 数据时效分级

| 时效 | 数据类型 | 允许直引 | 超时处理 |
|------|---------|:--------:|---------|
| 🟢实时 | 汇率/竞品价/BSR | ❌ | 必须web_search或提示核实 |
| 🟡短效 | 平台规则/税率/佣金 | 3个月 | 标"需验证" |
| 🟠中效 | 市场规模/品类趋势 | 6个月 | 标"数据较旧" |
| 🔴长效 | 认证体系/物流模式 | 12个月 | 标最后核实日期 |

### 置信度标注

所有建议附 `[置信度:高/中/低]`：
- **高**：基于实时数据/官方文件/平台明文
- **中**：基于近期数据/行业报告/经验模型
- **低**：基于估算/旧数据/无校准模型

### 高风险场景强制自检

| 场景 | 自检 |
|------|------|
| "能赚多少" | 汇率是实时的吗？标"示例值"了吗？ |
| "月销多少" | BSR系数是估算的吗？标"置信度:低"了吗？ |
| "XX国税率" | 税率表核实日期？超3个月了吗？ |
| "评价情感" | 用关键词还是语义？明示了吗？ |

### 内置数据诚实度声明

- 汇率表 FX_RATES：示例值快照，非实时
- BSR系数：经验估算，未经真实数据校准
- 淘宝/Shopee/京东模型：参数化假设，置信度极低
- 情感评分：关键词匹配，非AI语义
- 税率/市场规模：政策快照，需按周期核实

---

## 八、执行层协议

> 详见 `references/engine/execution-protocol.md`

### 三级降级

```
Level 1: 脚本可用 → 正常执行，如实转达
Level 2: 脚本缺失/报错 → 降级到纯知识模式（用references方法论手动分析）
Level 3: 知识不足 → 明示"无法精确计算，给框架建议"
```

### 自动调用触发

| 用户信号 | 自动执行 | 说明 |
|---------|---------|------|
| "算利润"/"能赚多少" | env-check → profit_calculator.py --json | 先验环境，标注汇率示例值 |
| "BSR"/"销量多少" | env-check → bsr_analyzer.py --json | 标注经验模型 |
| "评价分析" | env-check → sentiment_analyzer.py --json | 标注关键词匹配 |
| "提价"/"降价"/"弹性" | price-elasticity.mjs --json | 需两组价格-销量 |
| "该看什么文件" | knowledge-filter.mjs --entry X --json | 按入口精准加载 |
| "数据过时没" | sop-timeliness-check.mjs --json | 扫描19文件时效(9数据+10SOP) |

### 工具速查

```bash
# 环境验证（首次调用脚本前必跑）
node scripts/env-check.mjs --json

# 利润计算
python3 scripts/profit_calculator.py --price 199 --cost 80 --commission 15 --logistics 30 --json

# BSR销量估算
python3 scripts/bsr_analyzer.py --bsr 1500 --category home --price 29.99 --json

# 评价情感分析
python3 scripts/sentiment_analyzer.py --text "评价文本" --lang zh --json

# 价格弹性
node scripts/price-elasticity.mjs --p1 29.99 --q1 1000 --p2 27.99 --q2 1300 --json

# 知识加载过滤
node scripts/knowledge-filter.mjs --list --json
node scripts/knowledge-filter.mjs --entry selection --json

# 数据时效巡检
node scripts/sop-timeliness-check.mjs --json

# 实时汇率抓取（利润计算前建议先抓，再传给 --fx-live/--fx-rates）
node scripts/fetch-rates.mjs --json
python3 scripts/profit_calculator.py --price 199 --cost 80 --commission 15 --fx-live --json

# 竞品+Listing 检查清单
node scripts/competitor-checklist.mjs --product B0XXXXXX --json

# 多平台部署入口生成
node scripts/deploy.mjs --target all --dry-run
```

---

## 九、专家团审查协议

> 详见 `references/engine/expert-panel.md`

### 6位专家

| 专家 | 角色 | 否决权 |
|------|------|--------|
| 老选 | 选品分析/BSR预测 | 选品可行性 |
| 合规 | 平台规则/违禁词/认证 | **合规一票否决** |
| 算账 | 利润/ROI/盈亏平衡 | 利润可行性 |
| 跨境 | 物流/税务/支付/本地化 | 跨境可行性 |
| 评价 | 情感分析/用户痛点 | 用户洞察 |
| 监价 | 价格监控/弹性/调价 | 定价建议 |

### 分歧裁决优先级

1. 合规 > 一切（一票否决）
2. 利润可行性 > 选品理想
3. 跨境可行性 > 定价策略
4. 用户洞察 > 运营便利
5. 都冲突 → 列 trade-off 让用户决策

---

## 十、进度追踪与自进化

> 详见 `references/engine/evolution-protocol.md`

### 自进化触发

| 触发源 | 示例 |
|--------|------|
| 用户告知新规 | "Amazon刚改了佣金" |
| 用户反馈过时 | "这个汇率不对" |
| 用户分享结果 | "上架月销5000" |
| 用户主动触发 | "检查时效性" |
| AI自检发现旧数据 | 引用2024数据时标"需验证" |

### SOP时效巡检

19个文件(9数据refs+10份SOP)含时效元数据（最后更新/最后核实/核实周期/下次核实），调用 `sop-timeliness-check.mjs` 扫描，状态：ok/due-soon/overdue/missing-meta/malformed-date。

---

## 十一、注意事项

- 选品建议仅供参考，实际销售受多种因素影响
- 数据可能存在延迟，建议结合实时web_search获取最新数据
- 平台规则会频繁更新，以平台最新公告为准
- 跨境税务建议咨询专业会计师
- 利润计算基于用户输入参数，不含隐性成本
- **所有估算数据已标注置信度，请关注置信度提示**

---

## 十二、2026电商趋势

> 详见 `references/2026-ecommerce-trends.md`（八大趋势 + AI vs 传统团队成本对比，含来源与置信度标注）
> 引用时调用 `knowledge-filter --entry trends` 精准加载，避免重复维护。

---

## 十三、版本更新日志

### v1.0.4 (2026-08-23) — 当前版本

**核心升级：真实数据化 + 全平台规范适配**

**实时数据能力**：
- 新增 `scripts/fetch-rates.mjs`：实时汇率抓取（公开 API 多源轮换），失败时诚实降级到内置快照并明示"非实时"；profit_calculator 支持 `--fx-rates <json>` 注入实时汇率，输出标注汇率来源+抓取时间
- 汇率/税率/平台规则引用路径统一：能实时获取的优先实时获取，无法实时获取的必须标注"快照日期+需验证"，杜绝把静态数据当实时数据
- 核心功能完全离线可用，联网为可选增强（新手引导已明确说明）

**功能强化**：
- sentiment_analyzer：新增英文否定短语处理（"not good"/"doesn't work" 等不再被正面词覆盖）
- bsr_analyzer：新增 Temu/SHEIN/TikTok 市场参数化模型（诚实标注"无真实数据标定，置信度极低"）
- knowledge-filter：`--max` 超过 5 时输出上下文预算警告
- sop-timeliness-check：数据文件清单自动发现（含时效元数据的 refs 自动纳入，不再硬编码）

**质量与一致性优化**：
- 情感分析否定短语去重（避免双重计数）、汇率注入缺币种时诚实报错（不静默按 1.0 换算）
- 文档-代码一致性：评分公式、关键词库、BSR 公式、市场清单、术语（FUL/ACOS）统一
- 声明与实现一致：frontmatter 键名、部署幂等、工具速查覆盖全部 10 个脚本、数据文件计数修正
- 数据快照刷新：9 份数据文件 + 10 份 SOP 时效元数据刷新为 2026-08-23，重算下次核实日

**平台规范适配**：
- 符合 Coze / 阿里百炼（含通义灵码）/ 腾讯 SkillHub 技能包结构规范（根目录 SKILL.md + references/ + scripts/）
- 联网使用说明已写入新手引导与各平台入口文件

**工程化**：内置 `tests/smoke-test.mjs`（开发期自动化回归验证，非运行时依赖），打包后全量验证通过。

### v1.0.3 (2026-08-11) — 历史版本

**质量与一致性优化**

- 精简运行时：移除与 Skill 功能无关的开发产物，保持包内零残留
- 代码清理：消除死代码与废弃检测逻辑，提升可维护性
- 数字一致性：知识库、入口、语言支持与实际文件一致
- 版本统一：全部文件版本号对齐
- 专家团诚实声明：明确 6 位专家为角色化决策框架（拟人化顾问），重大决策建议对接真实从业专家复核，杜绝虚假宣称

### v1.0.2 (2026-08-04)

**重大升级：从"宣传册"到"专家系统"**

完成脚本质量加固、机制补齐与功能扩展，达到工程化基线。

**新增反幻觉层**：anti-hallucination.md / execution-protocol.md / expert-panel.md / evolution-protocol.md

**新增执行工具**：env-check.mjs / price-elasticity.mjs / knowledge-filter.mjs / sop-timeliness-check.mjs

**脚本质量提升**：
- sentiment_analyzer：否定处理+打分公式重写+词边界
- profit_calculator：盈亏平衡公式重写+汇率标注日期+--json
- bsr_analyzer：经验估算标注+置信度说明+--json

**新增知识模块**：listing-optimization.md / ppc-advertising.md / inventory-management.md

**新增时效管理**：6个数据文件加核实周期元数据 + sop-timeliness-check.mjs 巡检

**新增工程化**：test/smoke-test.mjs / manifest.json / CHANGELOG.md

**重写AGENTS.md**：从3行标签→完整Agent协议

**文档一致性**：版本号统一1.0.2 / 成本对比数字统一

### v1.0.1 (2026-08)

新增模块F/G/H，BSR预测升级，利润计算器升级，平台覆盖扩展。

### v1.0.0 (2026-07)

首发版本。
