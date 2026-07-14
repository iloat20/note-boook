# 年度报告 UI & 内容重新设计 — 设计文档

- 日期：2026-07-13
- 模块：`components/annual-report/`（全屏 overlay）+ `pages/stats/stats.js`（数据构建）
- 触发：`/brainstorming 年度报告的ui和内容重新设计`

---

## 1. 背景与动机

1. **用户需求**：把年度报告重做成「**年度资产复盘**」，全程不得出现投资相关用语（投资 / 持仓 / 盈亏 / 胜率 / 回撤 / 个股 / 策略 / 收益率 / 年化 / 证券 / 股票 / 分红 / 买入 / 卖出 等）。
2. **微信审核生存策略对齐**：本项目此前因小程序主体类目问题，运行期用户可见文案不能含「股票/持仓/分红/证券」等词。当前年度报告满屏都是 `盈亏 / 收益最高 / 标签分布 / 年化收益率 / 盈利占比`，属高危可见文案，必须借重做洗掉。
3. **范围收敛（用户明确）**：取消原方案第 3/4/5/6 块——风险与胜率、月度收益曲线、个股复盘排行、策略/标签盈亏。报告只保留「封面 + 年度总览 + 资产持有画像 + 结语导出」四块。

---

## 2. 设计原则

### 2.1 禁用词（运行期可见文案一律不得出现）
投资 / 持仓 / 盈亏 / 盈利 / 亏损 / 胜率 / 回撤 / 个股 / 股票 / 证券 / A股 / 港股 / 美股 / 分红 / 收益率 / 年化 / 买入 / 卖出 / 购入 / 售出 / 交易（资金变动语境）

### 2.2 资产中性词表（替换用）
| 旧词 | 新词 |
|------|------|
| 总投入 | 年度流入 |
| 总回收 | 年度流出 |
| 净盈亏 | 年度净变化 |
| 年化收益率 / 累计年化 | （移除，不展示） |
| 盈利占比 | （移除） |
| 其他收益 / 分红 | （移除，不展示） |
| 收益最高 / 需要关注 | （整块移除） |
| 标签分布 / 策略 | （整块移除） |
| 月度收益 | （整块移除） |
| 风险与胜率 | （整块移除） |

### 2.3 视觉基调
沿用项目 `--xhs-*` 设计变量（毛玻璃、卡片、pill 圆角、统一间距/动效），但更克制：
更大留白、字阶更分明、卡片更轻、弱化装饰、强信息。色板保持**红涨绿跌（中国习惯）**统一，但本期因移除收益类板块，颜色仅用于「净变化正负」指示。

---

## 3. 信息架构（全屏 overlay，自上而下）

```
┌─ 关闭 ✕                    保存图片/分享 ─┐   ← ar-top-bar
│                                            │
│  2025                       ← ar-year      │
│  年度资产复盘                 ← ar-title    │   ← Hero
│  +12,480                    ← 年度净变化(大数字)│
│  本年资产净增加               ← 一句话结论    │
│                                            │
│  年度资产总览                 ← 区块标题      │
│  ┌────────┐┌────────┐                    │
│  │ 流入    ││ 流出    │                    │   ← 2×2 网格
│  │ ¥8.2万  ││ ¥6.9万  │                    │
│  └────────┘└────────┘                    │
│  ┌────────┐┌────────┐                    │
│  │净变化   ││期末资产 │                    │
│  │ +1.3万  ││ ¥23.5万 │                    │
│  └────────┘└────────┘                    │
│                                            │
│  资产持有画像                ← 区块标题      │
│  在册最久   在册最短   变动最多              │   ← 三栏
│  ××资产      ××资产     ××资产              │
│  412天       18天       37笔               │
│                                            │
│  茄子笔记本 · 2025 年度资产复盘  ← 页脚      │
└────────────────────────────────────────────┘
```

**四块**：
1. **Hero**：年份 + 「年度资产复盘」+ 大数字「年度净变化」+ 一句话结论。
2. **年度资产总览**：流入 / 流出 / 净变化 / 期末资产（2×2 网格）。
3. **资产持有画像**：在册最久 / 在册最短 / 变动最多（三栏，资产名 + 数值）。
4. **结语 + 导出**：页脚 + 真·导出（保存长图 / 微信转发）。

---

## 4. 指标定义与数据契约（核心）

### 4.1 口径约定
采用**资产持有口径**（非净现金流口径）：
- **年度流入** = 本年购入金额（`yearBuyAmount + yearBuyFee`）+ 本年其他收益（`yearDivTotal`）
- **年度流出** = 本年售出收回净额（`yearSellAmount − yearSellFee`）
- **年度净变化** = 年度流入 − 年度流出（正值=本年持有资产净增加）
- **期末资产** = 全部历史（流入 − 流出）累计净额（见 4.3）

> 说明：净变化采用资产持有口径，与旧版 `yearPnL`（净现金流）**异号**，属预期——旧版 P&L 整块移除。⚠️ 开放确认点：若你更希望「净变化 = 流入 − 流出」以外的定义，评审时提出。

### 4.2 资产持有画像计算
基于 `Transaction.getAll()` 按资产标识（code）分组：
- **在册最久**：首次记录日最早的资产 → `name` + 距今天数 `days`
- **在册最短**：首次记录日最晚的资产 → `name` + `days`
- **变动最多**：交易记录条数最多的资产 → `name` + `count`

展示仅用资产 `name`，不展示「代码/股票」字样（code 仅内部计算用，可隐藏或极弱呈现，规避审核）。

### 4.3 期末资产（全历史聚合，需新增）
扩展 `stats.js` 构建逻辑，扫描**所有年份**的 `Transaction` + `Dividend`：
- `allInflow` = Σ(购入金额 + 费用 + 其他收益)（全历史）
- `allOutflow` = Σ(售出净额)（全历史）
- `endingAsset = allInflow − allOutflow`

不依赖实时行情价，纯流水聚合，资产中性。**实现风险**：需确认全历史扫描性能（数据量级小，可接受）。

### 4.4 新 `annualReportData` 契约
```js
{
  year: Number,
  // Hero
  netChange: Number,            // 有符号
  netChangeText: String,        // fmt(abs)
  netChangeSign: '+' | '-',
  conclusion: String,           // 一句话结论，如「本年资产净增加」
  // 年度资产总览
  inflowText: String,           // 年度流入
  outflowText: String,          // 年度流出
  endingAssetText: String,      // 期末资产
  // 资产持有画像
  holdingPortrait: {
    longest:  { name: String, days: Number },
    shortest: { name: String, days: Number },
    mostActive:{ name: String, count: Number },
  },
}
```
> 移除字段：`tradeCount / buyCount / sellCount / winRate / yearXIRR* / totalXIRR* / totalPnL* / totalInvestmentText / totalRecoveryText / dividendIncomeText / monthlyPnL / topStocks / bottomStocks / strategyStats`。属**破坏性变更**，须同步更新 `stats.js` 调用方与组件内 `_processData`（移除 monthlyPnL 处理分支）。

---

## 5. 视图层改造（`annual-report.wxml`）

- **移除区块**：资产概览 grid、资金流向、月度收益、收益最高、需要关注、标签分布（共 6 段）。
- **保留/重写**：
  - Hero：`ar-title` 改「年度资产复盘」；`ar-hero-pnl` 改绑 `netChangeText` + `netChangeSign`；移除 `ar-hero-pct`（年化）。新增 `conclusion` 文案行。
  - 新增「年度资产总览」2×2 网格：流入 / 流出 / 净变化 / 期末资产。
  - 新增「资产持有画像」三栏：在册最久 / 在册最短 / 变动最多。
  - 页脚文案改「茄子笔记本 · {year} 年度资产复盘」。
- **导出按钮保留**：`ar-export-btn` 文案「保存图片」保留（功能见第 6 节）。

---

## 6. 导出与分享（替换假按钮）

`annual-report.js` 当前 `onExportImage` 仅 `wx.showToast("导出功能开发中")` + 假 timer。改为真能力：

1. **保存长图到相册**：
   - 用 `canvas` 2D 把报告绘成竖长图（离屏 canvas，尺寸按内容高）。
   - 先 `wx.canvasToTempFilePath` → `wx.saveImageToPhotosAlbum`（需 `scope.writePhotosAlbum` 授权，缺失时 `wx.openSetting` 引导）。
   - 错误兜底：`wx.showToast` 提示。
2. **微信转发卡片**：
   - 页面 `pages/stats/stats.js` 加 `onShareAppMessage`，定义 `title`（如「我的 {year} 年度资产复盘」）+ `imageUrl`（复用同一 canvas 产物或海报）。
   - 组件内 `ar-export-btn` 旁加「分享」入口，或长按报告触发转发。

> 实现风险：canvas 在开发者工具与真机的表现差异、长图清晰度（建议 devicePixelRatio 2x 绘制）、`saveImageToPhotosAlbum` 授权流。

---

## 7. 技术实现

### 7.1 文件清单
| 文件 | 改动 |
|------|------|
| `components/annual-report/annual-report.wxml` | 移除 6 段、重写 Hero/总览/画像/页脚 |
| `components/annual-report/annual-report.wxss` | 删除旧 grid/flow/chart/rank/strategy 样式；新增总览网格 + 画像三栏样式 |
| `components/annual-report/annual-report.js` | `_processData` 移除 monthlyPnL 分支；`onExportImage` 实现 canvas 导出；`onShareAppMessage` 支持 |
| `pages/stats/stats.js` | 重构报告数据构建：新契约字段 + 全历史期末资产聚合 + 资产持有画像计算；移除 XIRR/winRate/topStocks/strategy 计算 |
| `pages/stats/stats.wxml` / `stats.json` | 确保 `usingComponents` 含 annual-report；`onShareAppMessage` 启用 |

### 7.2 纯函数（便于单测，建议抽到 `utils/helpers/`）
- `computeAssetHoldingPortrait(transactions)` → `{ longest, shortest, mostActive }`
- `computeAllTimeAssetFlow(transactions, dividends)` → `{ allInflow, allOutflow, endingAsset }`
- `buildAnnualAssetReport(year, yearFlow, holdingPortrait, endingAsset)` → 新契约对象

### 7.3 测试
- 新增纯函数单测（持有画像三档、期末资产聚合、净变化符号）。
- 组件渲染结构校验（移除区块不再渲染、新区块字段存在）。
- 回归：`npm test` 全绿（当前 138 passed）。

---

## 8. 范围之外（明确不做）
- 风险与胜率（第 3 块）
- 月度收益曲线 / 回撤阴影（第 4 块）
- 个股复盘排行 / 收益最高 / 需要关注（第 5 块）
- 策略 / 标签盈亏分布（第 6 块）
- 收益归因占比环（用户未选）
- ECharts 接入（用户选纯 CSS/SVG，本期图块已砍，无需图表库）

---

## 9. 风险与开放问题
1. **「净变化」符号口径**：资产持有口径与旧 P&L 异号，已在 4.1 标注，评审确认。
2. **期末资产定义**：全历史聚合净额，无实时行情，语义为「当前在册资产净额」；若你期望别的口径（如含初始余额）请提出。
3. **canvas 长图清晰度与授权流**：真机验证项，开发者工具内先跑通。
4. **data 契约破坏性变更**：`stats.js` 调用方仅 annual-report 一处，影响面可控。
