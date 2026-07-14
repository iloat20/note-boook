# 项目 Bug 核查报告

> 核查日期：2026-07-14
> 范围：`pages/`、`utils/`、`components/`、`packageDetail/`、`packageRecord/`、`custom-tab-bar/`
> 方法：基线验证（测试 + lint）+ 对历史审计文档 `BUG_AUDIT_REPORT.md` 逐项核对当前代码 + 针对近期重构引入回归的定向审查

## 一、基线

| 检查项 | 结果 |
|--------|------|
| `npm test` | ✅ **150 用例 / 22 套件全绿**（含本次新增 5 例） |
| `npx biome check`（含 formatter） | 31 条差异，全部为 **CRLF 行尾**（仓库预存，非本次引入） |
| `npx biome check`（仅 lint） | ✅ **0 个真实 lint 错误** |

## 二、核心结论

历史审计文档 `BUG_AUDIT_REPORT.md`（声称 39 个 bug：8 HIGH / 16 MEDIUM / 15 LOW）**已大面积过时**——项目在近期集中重构（持仓页、详情页 `savePosition`、quick-record、stats 洗词、年度报告、XIRR 裁剪、C1 freeze 契约）中已将其中绝大多数修复或移除。

逐项核对结果如下。

### HIGH（8 个）——全部已修复 / 失效

| 编号 | 原描述 | 当前状态 | 依据 |
|------|--------|----------|------|
| H1 | `savePosition` 费用混入均价 | ✅ 已修复 | `detail.js` 已重写，`savePosition` 直接用 `position.avgCost/quantity` 比较，不再重算含费均价 |
| H2 | 合成交易阈值 `avgBuyPrice*0.5` 过大 | ✅ 已修复 | 改为固定 `costDiff < 0.01` |
| H3 | `getData()` 返回缓存引用可被污染 | ✅ 已缓解 | `core.js` 引入 C1 deepFreeze 契约，`getData` 读即冻结，外部无法静默篡改 |
| H4 | `_loadData` 未设 `loading:true`，骨架屏不显示 | ✅ 已修复 | `index.js:185` 已有 `this.setData({ loading: true })` |
| H5 | quick-record 无防重复提交 | ✅ 已修复 | `quick-record.js:373` 已有 `_submitting` 守卫 |
| H6 | 输入时实时切换市场 | ✅ 已修复 | `quick-record.js:122` 已加 `_marketLocked`，首次识别后锁定 |
| H7 | Markdown 导出未转义换行/特殊字符 | ✅ 已修复 | `markdown.js` 的 `escapeTableCell` 已转义 `\| \n \r \\ * _ \`` |
| H8 | `stats.js` `bottomStocks` 取最差逻辑错 | ✅ 已失效 | 当前 `stats.js` 已无 `bottomStocks`（洗词重构时移除） |

### MEDIUM（抽查关键项）——全部已修复

| 编号 | 原描述 | 当前状态 | 依据 |
|------|--------|----------|------|
| M1 | `PriceCache.set()` 全量清持仓缓存 | ✅ 已修复 | `priceCache.js:28` 已传 `stockId` 给 `markDataDirty` |
| M2 | 全清仓后收益率显示 0% | ✅ 已修复 | `statsService.js:118` 回退 `totalHistoricalBuy` 作分母 |
| M3 | 区间统计忽略未实现盈亏 | ⚠️ 设计限制 | `calcStatsForRange` 注释明确：无历史价无法算未实现 PnL，属预期 |
| M4 | XIRR 牛顿法返回 NaN | ✅ 已失效 | XIRR 整链已裁剪（`xirr.js` 已删除，UI 不再使用） |
| M5 | `getSellableQuantity` 可返回负数 | ✅ 已修复 | `positionService.js:63` 已 `Math.max(0, ...)` |
| M6 | 策略 `netPnL` 未扣手续费 | ✅ 已修复 | `statsService.js:328` 已扣双端 fee |
| M10/M11 | quick-record 缺代码/数量校验 | ✅ 已修复 | `quick-record.js:394` `validateStockCode` + `:402/:406` 整数校验 |
| M16 | 周标签用月内第几周 | ✅ 已修复 | `statsService.js` 已有 `getISOWeek()` 真·ISO 周数 |

> 其余 MEDIUM/LOW 项（M7 历史批量选择类型、M12 删除 ID 类型、M14 store.subscribe、L1 currentPrice=0、L3 港股费、L11 parseInt 接受 "100abc"、L15 名称优先级等）经核对均已在近期修复或随重构失效。

## 三、新发现：1 个真实 bug（不在旧报告内）

### 🔴 `calcPosition` 平均成本分母错误 → 部分卖出后均价/浮动盈亏严重失真

- **位置**：`utils/helpers/positionCalculator.js:111-112`（修复前）
- **根因**：`avgCost` 分母为 `liveHoldings`（**部分卖出后的剩余数量**），而非买入批次数量。部分卖出不应改变剩余股份的**单位成本基准**，平均成本应保持买入批次成本。
- **复现**（实际模块运行验证）：

  ```
  交易：买入 100 股 @10，卖出 30 股 @12，现价 15
  修复前：quantity=70  avgCost=14.29  floatingPnL=50
  修复后：quantity=70  avgCost=10.00   floatingPnL=350
  ```

  误差约 **7×**，影响所有「买入后部分减仓」持仓的均价与浮动盈亏展示（这是极常见的真实场景）。
- **修复**（单点，分母改为买入批次数量 + 0 成本送股）：

  ```js
  const liveBatchQty = liveBuyQty + shareDividendQty;
  const avgCost = liveBatchQty > 0 ? liveBuyCost / liveBatchQty : 0;
  ```
- **回归测试**：新增 `tests/positionCalculator.avgCost.test.js`（5 用例：部分卖出 / 含费 / 送股 / 跨轮次 / 未卖），先红后绿。
- **校验**：`npm test` 150 全绿；`npx biome lint` 0 error。

## 四、次要观察（低优先级，未改动，待确认）

1. **排序结果未赋回（低影响）**：`utils/exporters/markdown.js:39` 与 `pages/stats/stats.js:39` 均写了 `[...arr].sort(...)` 但未赋回变量，导出/展示的交易未真正按日期排序（排序为死代码）。
2. **测试噪音（无功能影响）**：`tests/memory.test.js:228` 在 fake timers 未激活时调用 `jest.runOnlyPendingTimers()`，被 try/catch 吞掉后仅打印 `console.warn`，不影响测试结果。

## 五、结论与建议

- 旧审计文档已不可信，建议**归档或标注「已过时」**，避免后续维护者被误导。
- 本次发现并修复了 1 个高影响计算 bug（部分减仓持仓均价失真），已加回归测试防护。
- 若需进一步「主动挖新 bug」，建议下一步对**近期新增的年度报告 canvas 绘制链路**与 **quick-record 价格探测竞态**做一轮针对性审查。

---
*生成方式：systematic-debugging（先根因、再修复）+ 历史审计报告逐项核对。*
