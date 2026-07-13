# 年度资产复盘 · UI 重做 + stats 洗词 — 实现计划

- 日期：2026-07-13
- 模式：**TDD 子 agent 驱动**（每个任务先写/改测试，再实现；spec 评审 + quality 评审两关）
- 当前测试基线：150 passed

---

## Task 1 — annualReport.js 加对比条比例（纯函数）
- 文件：`utils/helpers/annualReport.js`、`tests/annualReport.test.js`
- 在 `assembleAnnualReport` 输出 additive 增加 `inflowPct` / `outflowPct`（基于 `yearInflow`/`yearOutflow`，`max = max(inflow, outflow, 1)`，百分比 0–100，整数或带 1 位小数）。
- 边界：inflow=outflow=0 → 均 0；仅一方有值 → 该方 100。
- 测试：覆盖比例计算 + 零边界。

## Task 2 — annual-report.wxml 重写（结构 + token）
- 文件：`components/annual-report/annual-report.wxml`
- Hero：白底巨号年份 + 「年度资产复盘」+ 净变化大数字（绑 `netChangeSign`+`netChangeText`，class 走 `ar-profit`/`ar-loss`）+ 结论。
- 总览：顶部「流入 vs 流出」对比条（两 `<view>` 条，`style="width:{{data.inflowPct}}%"` / `outflowPct`，流入 class 蓝、流出 class 灰，条上/旁标金额）；下方 2×2 四宫格（流入/流出/净变化/期末）。
- 画像：三栏（在册最久/最短/变动最多），数值强调色统一。
- 页脚文案不变。
- 导出按钮保留（浅色 pill）。

## Task 3 — annual-report.wxss 重写（浅色卡片系统）
- 文件：`components/annual-report/annual-report.wxss`
- 去除 `.ar-scroll` 黑底、`ar-hero` 红渐变、未用死规则。
- 滚动区底 `--xhs-bg`；卡片 `--xhs-surface` + `--xhs-elevation-2` + `--xhs-radius-md`（白卡细边框可选 `1px solid var(--xhs-divider)`）。
- 年份 `--xhs-title` 大号；结论/标签 `--xhs-caption`；净变化 `ar-profit`→`--xhs-profit`、`ar-loss`→`--xhs-loss`。
- 对比条：圆角 `--xhs-radius-pill`；流入底 `--xhs-secondary`、流出底 `--xhs-bg-tertiary`；数值 `--xhs-title`。
- 四宫格 / 画像：统一白卡或浅灰卡（`--xhs-bg-secondary`），数值强调 `--xhs-secondary`。
- 顶部 bar 按钮：浅色半透明 pill（适配浅背景，深色文字）。

## Task 4 — annual-report.js 导出 canvas 同步
- 文件：`components/annual-report/annual-report.js`
- `_drawReport`：背景 `#FAFAFC`，卡片白 + 圆角；Hero 白底（年份深灰、净变化红绿）；总览补画流入(蓝 #007AFF)/流出(灰 #E5E5EA) 对比条（按 `inflowPct/outflowPct`）；四宫格 + 画像配色对齐屏幕。
- 不改动保存/授权/分享逻辑。

## Task 5 — stats 页面洗词
- 文件：`pages/stats/stats.wxml`、`pages/stats/stats.js`
- wxml：顶部卡片「总收益」→「资产变动」；**移除「收益率」「盈利占比」两卡片**；综合明细「已实现收益」→「累计净变动」、**移除「收益率」行**；「已结清资产」→「已结束资产」；明细「已实现:」→「净变动:」。
- js：移除 `winRate/returnValue/returnText` 计算与 `stats` 字段；`totalPnLText`→「资产变动」值；`recordCount`→「记录次数」；可选算 `endingAsset`（`computeAllTimeAssetFlow`）+ 新卡片。
- `detailItems` 改为仅「累计净变动」一项（或整体移除与顶部重复块，按实现简洁度定）。
- 不动 `recordView.js`（typeText 已中性）。

## Task 6 — stats 测试：禁用词断言 + 回归
- 文件：`tests/stats*.test.js`
- 新增断言：stats 渲染数据/label 不含禁用词正则（/收益|盈利|持仓|盈亏|收益率|买入|卖出/）。
- 保证 `npm test` 全绿（含 Task1 新增）。

## Task 7 — 收尾打磨
- `npx biome lint` 无 error（CRLF formatter 噪声忽略，仅看 linter）。
- grep 校验 wxml 无禁用词。
- 输出真机/开发者工具校验清单（年度报告屏幕 vs 导出长图一致性、洗词后 stats 页面文案）。

---

## 执行顺序
T1 → T2 → T3 → T4（年度报告 UI 重做，串联）；T5 → T6（洗词，串联）；T7 收尾。
T1 与 T5 可并行（不同文件面）；但为连贯建议顺序执行，最后 T7 统一校验。
