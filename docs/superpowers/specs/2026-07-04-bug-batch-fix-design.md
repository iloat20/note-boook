# 批量 Bug 修复设计

- **日期**: 2026-07-04
- **范围**: 全库 4 层（pages / 子包页 / utils services+helpers+storageCore / components）约 20 个 bug
- **来源**: 4 路并行 code-reviewer audit → 合并为 1 个 spec → 分批修复
- **策略**: 分 4 批独立 commit，每批独立 review + 回归
- **不引入新自动化测试** — 用现有 wx.setStorageSync 数据对照 + `npm test` 回归

---

## 1. 背景 & 修复契约

全库 4 路并行扫描，共筛出 20 个真实 bug（含 6 资金类 + 5 状态表单类 + 2 生命周期类 + 7 精度/语义/UI 残留类），按严重度：高 6 / 中 4 / 低 ~10。

### 1.1 统一修复契约（4 条）

| # | 契约 | 落地位置 | 涉及 bug |
|---|---|---|---|
| C1 | **共享缓存引用不可 mutate**：`storageCore` / LRU 层 `getData()` 返回 `Object.freeze` 副本；`calculatePosition()` / `getStrategyStats()` 无参（走缓存）路径返回 freeze 副本 | `storageCore/core.js` LRU.get + models 层 | #1、#13b |
| C2 | **异步回调 detached 守卫**：所有 `setTimeout` / `wx.request` / `Promise.then` 回调入口须 `if (this._detached \|\| !this.data) return`；`detached` 内设 `_detached = true` 并清理 timer / 递增请求版本号 | 受影响 pages、components | #8、#9、#10 |
| C3 | **date range 闭区间 `[start, end]`**：所有 period generator 产出 end = 当天 23:59:59.999 或等价的次日 0 点；`dateIndex.getByDateRange` 语义调整为闭区间 | `dateIndex.js` + `statsService._generatePeriods` 等 | #5 |
| C4 | **`bail(msg)` 统一 early-return**：`record.submit` 的所有 early-return 点统一走 `bail()` = `toast + _resetSubmit + return` | `record/record.js` | #6 |

---

## 2. 修复清单（按批次）

### 批次 1 — 资金计算（6 件，最高严重度）

#### #1 detail.js `_updatePrice_fields` mutate LRU
- **文件**: `packageDetail/pages/detail/detail.js` `_updatePriceFields`
- **根因**: 点路径 `setData({'position.fixedPrice': v})` 就地 mutate 了 positionService 共享 LRU 引用，cross-page 污染
- **修复**: C1 freeze 落地后调用方 mutate 自然失效；同时把 `fixedPrice / fixedPriceCtime / fixedPriceSource` 改为走 `positionService.updatePositionMeta(stockId, patch)` 干净写路径，不直接 mutate position 对象
- **验证**: 入详情改价 → 回首页，floatingPnL 立即变；进统计页该股浮动盈亏与首页一致；**清仓股（qty=0）改价不污染 summary**

#### #2 XIRR terminal value 用最新市值（→ 改成本口径）
- **文件**: `utils/services/xirrService.js` `_buildCashFlowsCore`
- **根因**: 未实现浮盈被当作「期末现金流」投入 XIRR，导致高估且随价格刷新跳动
- **修复**: 末端现金流 = `quantity * avgCost * r`（成本口径），与 `positionCalculator.realizedPnL` 同口径
- **验证**: 建仓 1 元 1000 股 → 现价 100 元 → XIRR 量级正常；刷新价格同一股 XIRR 数值不变
- **用户可见变化**: XIRR 数值普遍下调（当前数字偏大）；需在 commit message 中显式提示

#### #3 SEC fee 上限单位（CNY vs USD）
- **文件**: `utils/helpers/feeCalculator.js` `_calcUSShare`
- **根因**: `secFee > 21.84` 与 CNY 金额直接比较（应为美元上限）
- **修复**: 比较前转回 `amountUSD = amount / usdToCny`，再与 21.84 比较
- **验证**: 卖 50000 USD 美股，SEC fee = `min(amountUSD * rate, 21.84) * usdToCny`，对比修复前后

#### #5 date range 闭区间化
- **文件**: `utils/models/dateIndex.js` `getByDateRange` + `utils/services/statsService.js` `_generatePeriods`
- **根因**: 右端点开区间 + 部分 period 的 end 取当天 0 点，导致月末/年末当日交易丢失
- **修复**: C3 闭区间语义落地 — `_generatePeriods` 强制 end ≤ 当天 23:59:59.999；`dateIndex._upperBound(endKey)` 改为 `<=` 或 endKey + DAY_MS - 1
- **验证**: 23:59 的月末交易 → 月度统计 + 年度 XIRR 均计入；跨 period 不串

#### #11 分红双重计算（CASH）
- **文件**: `utils/services/xirrService.js` `_buildCashFlowsCore`
- **根因**: CASH 分红既作为正向现金流、又被末端含权市价覆盖
- **修复**: 随 #2 切换成本口径后，市价路径消除 → 双重计算解除；保留 CASH 分红正向现金流路径、SHARE 分红按加量处理
- **验证**: 10 送 10 + CASH 100 元后，XIRR 末端金额 + 分红金额自洽

#### #12 送股摊薄 avgCost 与 realizedPnL 联动
- **文件**: `utils/helpers/positionCalculator.js` `calcAvgCost`
- **根因**: 送股数量进分母（成本为 0）摊薄 avgCost，后续卖出 realizedPnL = `totalSellAmount - totalSellFee - avgCost * totalSellQuantity` 偏大
- **修复**: 复核卖出 cost 口径是否与 `totalBuyQuantity + shareDividendQty` 分母匹配；统一用成本-only avgCost 计算 realizedPnL（送股不进 cost 也不进卖出成本）
- **验证**: 10 元买 100 股 → 10 送 10 → 10 元卖 100 股，realizedPnL ≈ 0

---

### 批次 2 — 状态 / 表单（5 件）

#### #4 history 筛选残留选择态
- **文件**: `pages/history/history.js` `_applyFilters` / `switchMarket` / `switchStrategy`
- **根因**: 筛选切换未清空 `selectedIds/selectedMap/selectedTypeMap`；`toggleSelectAll` 写入全量分组 ID 使 `batchDelete` 击中间不可见记录
- **修复**: 切换入口统一清空选择态；`toggleSelectAll` 仅写入当前可见 `_allGroupedHistory.slice(0, displayCount)` 子集；`batchDelete` 加可见性过滤
- **验证**: 选 1 条 A 股 → 切港股 chip → 全选 → 删除，A 股记录保留且仅港股被删

#### #6 record 3 处 early return 锁死
- **文件**: `packageRecord/pages/record/record.js` `_validateAndSubmit` L488/L513/L572
- **根因**: 校验失败只 toast `return`，未重置 `_submitting`，导致整页永久锁死
- **修复**: C4 `bail(msg)` 抽函数，4 个 early-return 点统一替换；catch 分支保持原降级逻辑不变
- **验证**: 提交无效新股票 / 无持仓 SELL → toast 后可再次提交

#### #7 股息编辑改写 stockId（拒绝）
- **文件**: `packageDetail/pages/dividend/dividend.js`
- **根因**: 编辑改提交到另一股票，旧股 position 缓存不被 invalidate；跨股迁移股息
- **修复**: `_loadEdit` 入口设 `this._editStockId`；`submit` 时若 `oldStockId !== newStockId` → bail("分红记录不可改股票")；编辑态下 `stock-selector` disabled
- **验证**: 编辑股 A 分红 → 改选 B 提交 → 期望 toast 拒绝

#### #8 annual-report 假导出 detached 未清理
- **文件**: `components/annual-report/annual-report.js` `onExportImage`
- **根因**: `setTimeout(() => this.setData({ exporting: false }), 1000)` 闭包无 detach 看守
- **修复**: C2 — 存 `this._exportTimer`，`detached` 里 `clearTimeout`，回调内 `if (!this.data) return`
- **验证**: 打开年报 → 点导出 → 在 1s 内关闭 → IDE 无 `setData of undefined`

#### #9 quick-record 网络回调 detached 未守卫
- **文件**: `components/quick-record/quick-record.js` `_probeStockPrice.then/.catch/.finally` + `_scheduleAutoFetch` + `_tryAutoFetch`
- **根因**: `detached()` 未清 `_afProbe` 标记；`_afTimer`（调度自动刷新的具名 timer）也未清理
- **修复**: C2 — `detached` 里设 `this._detached = true`，同时 `clearTimeout(this._afTimer)`；`_probeStockPrice.then/.catch/.finally` / `_scheduleAutoFetch` / `_tryAutoFetch` 入口都加 `if (this._detached) return`
- **验证**: 输入有效代码 → 等探测 → 快速关闭弹窗 → IDE 无 setData 报错

---

### 批次 3 — 生命周期（2 件）

#### #10 行情刷新回调 setData to unloaded 页
- **文件**: `pages/index/index.js` `_fetchPrices`
- **根因**: `onUnload` 只清 5 个具名 timer，不取消在途 `_fetchAllPrices` 请求
- **修复**: C2 — `onUnload` 设 `this._detached = true` + `_currentPriceReqId++`；回调内 `if (this._detached || reqId !== this._currentPriceReqId) return`
- **验证**: 进持仓页 → 快速切 tab → IDE 无 setData 报错

#### #15 index flash 动画 stale 闭包
- **文件**: `pages/index/index.js` `_loadData` 后 cleanup flash class 阶段
- **根因**: 清理定时器闭包捕获旧 `displaySlice`；tab 切换或行情刷新后 `displayPositions` 已换，索引越界或写到 stale 对象
- **修复**: 改用**按 stockId 索引**而非数组索引：保留 `pendingFlashByStockId: Map<stockId, timer>` 结构，清理时按 stockId 键 precise delete；或把 flash 状态抽到 `position-card` 组件里由组件自己 1s 自清理
- **验证**: 行情刷新闪动 → 1s 内切 A 股 tab → 动画清理正常，无残留 position-card-entering

---

### 批次 4 — 精度 / 语义 / UI 残留（7 件）

| # | 文件 | 修复 |
|---|---|---|
| 13a | `pages/stats/stats.js` L284 | `percent = Math.round((s.count / totalCount) * 100)`，`totalCount = sum(count)` |
| 13b | `utils/services/statsService.js` `getStrategyStats` | C1 落地后此 bug 自动消除（调用方 mutate 会 throw），无需单独立项 |
| 14 | `pages/stats/stats.js` `_processData` | 孤儿股取 `exchangeRate.getCachedRate(market) ?? DEFAULT_RATE`，不默认 1 |
| 15 | `custom-tab-bar/index.js` L66 | `Number(index) === this.data.selected` — 消除 WXML dataset 字符串 vs 数字严格相等失效 |
| 16 | `components/quick-record/quick-record.wxml` L74 | `data-qty="1000"` 去掉逗号；或 `parseInt(String(v).replace(/,/g, ""), 10)` 兼容旧写法 |
| 17 | `packageDetail/pages/detail/detail.js` L303-353 | 抽 per-id timer map：`this._deleteTimers = new Map()`；`detached` 里 clear all — 快速删不同行不再丢单 |
| 18 | `components/quick-record/quick-record.js` L256 | `parseInt(String(qty).replace(/,/g, ""), 10) || 0` — 修复「1,000」→ 1 的千分位截断 |

---

## 3. 测试 / 交付物

- **不引入新的自动化测试用例** — 用现有 `wx.setStorageSync` 数据 + 手动对照
- 修完批次 1 必须跑 `npm test`，重点盯：
  - `feeCalculator.test.js`（修 #3 后预期 SEC fee 数值变化）
  - `xirr.test.js`（修 #2、#11 后预期 XIRR 数值变化）
  - `computedCache.test.js`、`portfolio.test.js`、`memory.test.js`（C1 freeze 落地回归）
- 修完批次 2 必须走一遍：
  - 增/改/删交易、改价、切筛选、导出年报、快速进出持仓页
- 修完批次 3、4 必须有 IDE 开发工具 console 无 `setData of undefined` / `Cannot read property`

### C1 freeze 回归清单（强制通过）
- 增/改/删股票 + 增/改/删交易 + 增/改/删分红
- 手动改价（#_updatePriceFields）
- 切换 history 筛选 / 市场 / 策略 chip
- 导出年报 + 快速关闭弹窗
- quick-record 探测 + 快速关闭弹窗
- 进出持仓/详情/统计子页 各 3 次
- ECharts 卸载后再进入（stats 不灭 onError）

---

## 4. 风险 & 缓解

| 风险 | 缓解 |
|---|---|
| C1 freeze 导致隐形 mutate throw | §3 强制回归清单全过；出现 throw 在该调用方加浅拷贝 |
| XIRR 变动影响用户历史读数 | commit message 显式说明「XIRR 偏大 → 正常区间」的用户可见变化 |
| date range 闭区间化穿越已有 period 边界 | 逐一定点验证 `_generatePeriods` 的 month/year/YTD/fullYear 输出 |
| C4 `bail()` 重构误改 catch 分支 | catch 分支保持原降级逻辑不动；bail() 仅用于同步校验失败 |
| 快速删不同行改 per-id timer 引入新泄漏 | `detached` 里 Map.clear() 兜底 |

---

## 5. 实施顺序

`批次 1（资金）→ 批次 2（状态/表单）→ 批次 3（生命周期）→ 批次 4（精度/语义/UI 残留）`

每批次独立 commit（`fix: description`），每批次独立 review。资金修正放在最前面单独 review，因其跨页敏感度最高。

---

## 6. 不在本次范围

- 性能优化（虚拟化、computedCache 命中、DateIndex 命中）— 已有独立 spec，不重合
- UI 重构（iOS 26.5 frosted glass 升级、布局调整）— 属于 feature scope
- 云端同步 / backend 接入 — 当前项目仍纯客户端，超出 bug 修复范围
- component 未使用的引用（CLAUDE.md 里提到的 components/section-header 删除差异）— 静态清理，不在修复范围

---

## 7. 批准的决策记录

以下决策在 brainstorming 中由用户逐一确认：
源*全修（~20 件）而非仅核心 6 件
- 测试策略 = 现有数据手动对照 + `npm test` 回归，不引入新自动化用例
- 实施方式 = 方案 A（分类分批），非单 commit 全改
- C1 = `LRU/数据源统一 freeze`（推荐）
- C3 = 闭区间 `[start, end]`，dateIndex 内部消化方向，非对齐调用方
- #2 XIRR 末端 = 成本口径 `quantity * avgCost * rate`
- #7 股息改股 = 拒绝（股票选择器 disabled）
