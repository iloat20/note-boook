# 年度资产复盘 · UI 重做 + stats 洗词 — 设计文档

- 日期：2026-07-13
- 模块：`components/annual-report/`（年度报告 overlay）+ `pages/stats/`（统计页洗词）
- 触发：用户反馈上一轮「年度报告 UI 还是很丑」+ 同意一并洗掉 stats 页面运行期可见投资词

---

## 1. 背景与动机

1. **视觉重写**：上一轮已完成「年度资产复盘」的内容重构（去投资词、四块结构），但视觉采用**番茄红满屏渐变 Hero + 死黑滚动底(#1a1a1a) + 白卡**三套割裂调性，用户明确反馈「还是很丑」。根因是绕开了项目现成的 `--xhs-*` 浅色设计系统自己造了一套红黑。
2. **洗词延伸**：用户同意把 stats 统计页**运行期可见**的投资词一并洗掉（同一微信审核风险面）。经核查，`recordView.js` 的 `typeText` 已是「转入/转出/其他收益」（资产中性），无需改动；真正残留的是 stats 页面硬编码的标签文案。
3. **一致性**：导出长图（canvas）当前是浅灰底+白卡，与屏幕上「红+黑」不一致；本次重做需让两者统一为浅色系统。

---

## 2. 视觉重做原则

- **统一到 `--xhs-*` 浅色设计系统**（项目已有完整 token，见 `app.wxss`）。
- **去掉死黑背景与满屏红渐变**：滚动区底改为 `--xhs-bg`(#FAFAFC)；卡片用 `--xhs-surface`(#FFFFFF) + `--xhs-elevation-2` 阴影 + `--xhs-radius-md`(24rpx)。
- **颜色纪律**：红绿仅用于「净变化正负」语义（`--xhs-profit`/`--xhs-loss`）；其余走中性灰阶；主色 `--xhs-primary` 只做细节强调（如导出按钮边框/激活态），不铺满。
- **扁平、留白、字阶分明**：年份巨号、区块标题、数字、标签层次清晰。

---

## 3. 信息架构（四块不变，仅视觉重做）

```
┌─ 关闭 ✕                    保存图片 / 分享 ─┐   ← ar-top-bar（浅色 pill）
│                                            │
│   [白卡] 2025（巨号灰）                      │   ← Hero
│          年度资产复盘（小灰字）               │
│          ¥ +128,000（红绿大数字）            │
│          本年资产净增加（小灰字）             │
│                                            │
│   [白卡] 年度资产总览                        │
│          流入 ▓▓▓▓▓▓▓ (蓝) ¥200,000          │   ← 对比条
│          流出 ▓ (灰)     ¥72,000             │
│          ┌──────┐┌──────┐                  │   ← 2×2 四宫格
│          │流入   ││流出   │                  │
│          │净变化 ││期末   │                  │
│          └──────┘└──────┘                  │
│   [白卡] 资产持有画像                        │
│          在册最久   在册最短   变动最多        │   ← 三栏
│   [页脚] 茄子笔记本 · 2025 年度资产复盘        │
└────────────────────────────────────────────┘
```

---

## 4. 配色 Token 表（直接复用，无新增变量）

| 用途 | Token | 值 |
|------|-------|-----|
| 滚动区底 / 导出底 | `--xhs-bg` | #FAFAFC |
| 卡片底 | `--xhs-surface` | #FFFFFF |
| 卡片阴影 | `--xhs-elevation-2` | 0 1px 4px rgba(0,0,0,.04), 0 2px 12px rgba(0,0,0,.06) |
| 卡片圆角 | `--xhs-radius-md` | 24rpx |
| 年份巨号 / 标题 / 数值 | `--xhs-title` | #1C1C1E |
| 区块标题 / 结论 / 标签 | `--xhs-caption` | #999999 |
| 净变化正向（涨） | `--xhs-profit` | #FF0000 |
| 净变化负向（跌） | `--xhs-loss` | #00AA00 |
| 流入条 | `--xhs-secondary` | #007AFF |
| 流出条 | `--xhs-bg-tertiary` | #E5E5EA |
| 画像数值强调 | `--xhs-secondary` | #007AFF |

---

## 5. 数据契约增量（additive，不破坏现有字段）

为画对比条需比例，在 `assembleAnnualReport` 输出新增（纯函数计算，max = max(inflow, outflow, 1)）：
- `inflowPct`: Number（0–100，流入占比）
- `outflowPct`: Number（0–100，流出占比）

wxml 用 `style="width: {{data.inflowPct}}%"` 控制条长；canvas 导出复用同一数值。

---

## 6. 导出 canvas 同步

`_drawReport(ctx, W, H)` 改为浅色体系，与屏幕一致：
- 背景 `#FAFAFC`，卡片白 `#FFFFFF` + 圆角。
- Hero 白底：年份深灰、净变化红绿（按 `netChange>=0`）。
- 总览区补画「流入(蓝)/流出(灰)」对比条（按 `inflowPct/outflowPct`）。
- 四宫格 + 画像三栏配色对齐屏幕。
- 尺寸仍 750×1600，dpr 自适配。

---

## 7. stats 页面洗词范围（运行期可见）

### 7.1 禁用词（沿用上轮）
投资 / 持仓 / 盈亏 / 盈利 / 亏损 / 胜率 / 收益率 / 年化 / 买入 / 卖出 / 分红 / 股票 / 证券

### 7.2 当前残留 + 改造
| 位置 | 现状（可见） | 改造 |
|------|------|------|
| 顶部卡片1 | 总收益 | → **资产变动** |
| 顶部卡片2 | 收益率 | **移除该卡片**（最赤裸投资指标） |
| 顶部卡片3 | 盈利占比 | **移除该卡片** |
| 顶部卡片4 | 记录次数 | 保留 |
| 顶部新增 | — | 可选新增**期末资产**（复用 `computeAllTimeAssetFlow`） |
| 综合明细行1 | 已实现收益 | → **累计净变动** |
| 综合明细行2 | 收益率 | **移除该行** |
| 已结清资产块标题 | 已结清资产 | → **已结束资产** |
| 已结清明细 | 已实现: xxx | → **净变动: xxx** |

- `typeText`（转入/转出/其他收益）已合规，**不动 `recordView.js`**。
- `stats.js` 中 `winRate/returnValue/returnText` 计算与字段移除（不再渲染）；`totalPnL`→「资产变动」，`recordCount`→「记录次数」；可加 `endingAsset` 给新增卡片。

### 7.3 测试断言
新增/更新 stats 测试：断言渲染数据中可见 label 不含禁用词（如 `/收益|盈利|持仓|盈亏|收益率/`）。

---

## 8. 文件清单

| 文件 | 改动 |
|------|------|
| `components/annual-report/annual-report.wxml` | Hero 白底巨号 + 对比条 + 四宫格 + 画像三栏（统一 token） |
| `components/annual-report/annual-report.wxss` | 去黑底/红渐变/死规则；白卡+阴影+细边框；对比条/四宫格/画像样式 |
| `components/annual-report/annual-report.js` | `_drawReport` 浅色同步 + 对比条绘制 |
| `utils/helpers/annualReport.js` | additive 加 `inflowPct`/`outflowPct` |
| `tests/annualReport.test.js` | 覆盖 pct 计算 |
| `pages/stats/stats.wxml` | 洗词（标签 + 移除卡片/行） |
| `pages/stats/stats.js` | 洗词（label + 移除 winRate/return 字段 + 可选 endingAsset） |
| `tests/stats*.test.js` | 禁用词断言 + 回归 |

---

## 9. 测试与验收

- `npm test` 全绿（当前 150 passed）。
- `npx biome lint pages/ utils/ components/ packageDetail/ packageRecord/` 无 error。
- 运行期可见文案无禁用词（grep 校验 wxml + 测试断言）。
- 真机/开发者工具内：年度报告屏幕与导出长图视觉一致。

---

## 10. 范围之外

- 不动 `recordView.js`（typeText 已中性）。
- 不动年度报告数据口径（资产持有口径）。
- 不引入图表库（对比条纯 CSS/SVG）。
