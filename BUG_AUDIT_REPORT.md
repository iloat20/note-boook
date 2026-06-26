## Bug 审查报告 — 微信小程序股票记账本

审查范围: utils/, pages/, packageDetail/, packageRecord/, components/, custom-tab-bar/, app.js, app.json

共发现 **39 个 bug**: 8 HIGH / 16 MEDIUM / 15 LOW

---

### HIGH — 崩溃 / 数据损坏 / 资金计算错误

**H1. `savePosition()` 费用混入均价计算，导致合成交易逻辑崩溃**
`packageDetail/pages/detail/detail.js` ~L349-363

`totalBuyAmount += t.price * t.quantity + t.fee` 将手续费计入买入总额，后续 `avgBuyPrice = totalBuyAmount / totalShares` 被费用膨胀。当存在卖出交易时，与 `positionCalculator` 的 `avgCost` 对比会偏离，触发不必要的合成买卖交易，污染交易历史。

应直接使用 `this.data.position.avgCost` 和 `this.data.position.quantity` 与用户输入比较。

---

**H2. `savePosition()` 合成交易阈值设计不当**
`packageDetail/pages/detail/detail.js` ~L343-411

`Math.abs(diff) < avgBuyPrice * 0.5` 对高价股阈值过大（如500元股票阈值为250元），而费用导致的舍入误差容易超过此阈值，反复触发合成交易。

---

**H3. `getData()` 返回原始缓存引用，外部修改会污染缓存**
`utils/storageCore/core.js` ~L86-101

`getData()` 直接返回 `_memCache` 中的对象引用。`PriceCache` 的 `set()` / `getBatch()` 直接修改该引用后有 `saveData()` 保护，但 Model 层 `getAll()` 也返回该引用，任何消费者的突变操作都会静默破坏缓存。

应在 `getData()` 中返回深拷贝，或在所有 Model 的 `getAll()` 中使用 `getDataCopy()`。

---

**H4. `index.js` `_loadData` 未设置 `loading: true`，骨架屏永不显示**
`pages/index/index.js`

`_loadData` 缺少 `this.setData({ loading: true })`，导致 WXML 中 `wx:if="{{loading}}"` 的骨架屏分支永远不会渲染。同时重入守卫成为死代码，`onLoad` → `onShow` 生命周期内可能并发执行。

---

**H5. `quick-record` 无防重复提交**
`components/quick-record/quick-record.js` ~L275-329

`submitQuickRecord()` 没有 `_submitting` 标志，用户快速双击会创建重复交易记录。record 页面有防重复机制但此组件缺失。

---

**H6. `_detectMarket` 在用户输入时实时切换市场**
`components/quick-record/quick-record.js` ~L267-272

每次击键都重新判断市场类型。输入 "123456"（A股）后删一位变 "12345" 会静默切换为港股。费率计算、代码校验、行情获取全部使用错误市场。

---

**H7. Markdown 导出未转义换行和特殊字符**
`utils/exporters/markdown.js` ~L40-41, ~L90

`reason` 和 `note` 字段仅转义了管道符 `|`。用户输入含换行 `\n`、反引号、星号时会破坏 Markdown 表格格式，导致导出文件损坏。

---

**H8. `stats.js` `bottomStocks` 取最差股票逻辑错误**
`pages/stats/stats.js`

对降序排列且已过滤负值的数组使用 `.slice(-5)` 取"最差5只"，实际取到的是尾部（最小正值或接近零的值），而非真正的最差表现者。

---

### MEDIUM — 行为错误

**M1. `PriceCache.set()` 全量清除持仓缓存而非单只股票**
`utils/models/priceCache.js` L28

`markDataDirty(["position"])` 未传 `stockId`，更新一只股票价格会强制所有股票持仓重新计算。`setBatch()` 正确使用了按股票粒度失效。

---

**M2. `getTotalStats()` 全部清仓后收益率显示 0%**
`utils/services/statsService.js` ~L106-114

`totalCostBasis` 仅累加 `quantity > 0` 的持仓。用户全部卖出后，即使盈利万元，收益率也显示 0.00%。

---

**M3. 区间统计 PnL 忽略未实现盈亏**
`utils/services/statsService.js` ~L39-54

`calcStatsForRange` 仅计算已实现盈亏 (`sellAmount - buyCost - fees`)。期间买入但未卖出的股票涨跌完全不反映在区间 PnL 中。

---

**M4. XIRR 牛顿法可返回 NaN**
`utils/helpers/xirr.js` ~L33-48

当导数 `dfVal` 极小但非零时，牛顿步长产生巨大值或 NaN。二分法后备方案在所有现金流同号时也会失败（如仅有买入无卖出）。

应加 `Number.isFinite(newRate)` 校验。

---

**M5. `getSellableQuantity()` 可返回负数**
`utils/services/positionService.js` ~L62

数据不一致时（卖出 > 买入）返回负值，UI 显示 "-5 股可卖"。应加 `Math.max(0, ...)`。

---

**M6. 策略统计 `netPnL` 未扣除手续费**
`utils/services/statsService.js` ~L284-307

`netPnL = sellAmount - buyAmount` 未减手续费，策略卡片显示的盈亏偏高。

---

**M7. `history.js` 批量选择 ID 类型不匹配**
`pages/history/history.js`

`toggleSelectAll` 存储数字 ID，`toggleSelectItem` 从 dataset 获取字符串 ID。全选后取消单项时 `Set` 的 `has()` 因类型不匹配而失败，导致出现重复项而非移除。

---

**M8. `stats.js` 交易详情数量用 `parseInt` 截断小数**
`pages/stats/stats.js`

交易列表中 `parseInt` 截断份额小数（如 100.5 → 100），而 history 页面正确使用 `parseFloat`。

---

**M9. `record.js` `onQuantityInput` 静默截断小数**
`packageRecord/pages/record/record.js` ~L202-205

`parseInt("100.5")` 返回 100，费用预览按 100 股计算，但用户以为输入了 100.5。提交时虽有 `includes(".")` 校验，但预览阶段已误导。

---

**M10. `quick-record` 提交缺少 `validateStockCode()` 校验**
`components/quick-record/quick-record.js` ~L275-296

未校验代码格式，A股输入 "12" 也能通过。无效代码保存后，后续行情获取和查找均会失败。

---

**M11. `quick-record` 提交缺少数量整数校验**
`components/quick-record/quick-record.js` ~L292-295

`parseInt("100.5") <= 0` 为 false，"100.5" 可通过。record 页面有 `includes(".")` 拒绝小数，此组件缺失。

---

**M12. 删除交易 ID 类型不一致可能导致删除静默失败**
`packageDetail/pages/detail/detail.js` ~L250, 277

`disTransId` 用 `Number(id)` 转换，但 `Transaction.delete(id)` 传入的可能是字符串。`deleteAndSave` 用 `x.id !== id` 严格比较，类型不匹配时记录永远不会被删除。

---

**M13. 港股代码格式不一致导致重复股票记录**
`packageRecord/pages/record/record.js` ~L397-432

`formatStockCode("700", "HK_SHARE")` 返回 `"00700"`，但如果股票最初以 `"700"` 保存，`getByCode("00700")` 查找失败，会创建重复股票记录，交易历史被分裂。

---

**M14. `store.subscribe()` API 设计错误：按 mutation 名而非 state key 通知**
`utils/state/store.js` ~L47-51

`subscribe("dataDirty", cb)` 永远不会触发，必须用 `subscribe("MARK_DIRTY", cb)` 或 `subscribe("*", cb)`。当前无调用者，但未来使用者会用错误的 key。

---

**M15. `annual-report.wxml` 胜率颜色语义反转**
`components/annual-report/annual-report.wxml` L33

`winRate >= 50` 显示红色 `#FF6B6B`，`< 50` 显示绿色 `#34C759`。高胜率应为绿色（好），低胜率应为红色（差）。

---

**M16. 周标签使用 "月内第几周" 而非 ISO 周数**
`utils/services/statsService.js` ~L150

`Math.ceil((date + 6) / 7)` 计算的是月内周数，标签如 "2025W5" 含义模糊（可能是 ISO 第5周或月内第5周）。

---

### LOW — 边界情况 / 显示问题

**L1. `currentPrice` 为 0 时被视为 null**
`utils/helpers/positionCalculator.js` ~L66 — `currentPrice ? ...` 对 0 返回 null，停牌/退市股价格显示异常。

**L2. 统计聚合中浮点精度累积误差**
`utils/services/statsService.js` ~L43-52 — `t.price * t.quantity` 未逐项舍入，大量交易累加后误差可达分级。

**L3. 港股手续费子项未逐项取整**
`utils/helpers/feeCalculator.js` ~L25-42 — A股正确取整每项费用，港股仅总额取整，明细项可显示 `3.333333...`。

**L4. `touchGestureMixin` 节流状态在页面实例间共享**
`utils/ui/touchGestureMixin.js` ~L21-32 — `ticking` 变量在闭包中共享，极端导航模式下可能互相干扰。

**L5. `exchangeRate.js` `_inflightPromise` 超时竞态**
`utils/services/exchangeRate.js` ~L183-195 — 超时后新请求发出，旧请求延迟完成时会用过期数据覆盖新数据。

**L6. `getData()` 默认值逻辑将 `false` 和 `0` 视为空**
`utils/storageCore/core.js` ~L91 — `!data` 对 false/0 为 true，目前所有 key 存数组/对象不受影响。

**L7. `getByDateRange()` ISO 字符串比较的时区边界**
`utils/models/transaction.js` ~L118-122 — 存储的 `"2025-01-15"` 与 `toISOString()` 产生的 `"2025-01-15T00:00:00.000Z"` 字符串比较时，前者小于后者，当天的交易被排除。

**L8. `positionStore` 死代码**
`utils/state/positionStore.js` — 定义了 `SET_POSITIONS` / `SET_SUMMARY` mutation，但全项目无任何 `commit()` 或 `subscribe()` 调用。

**L9. 编辑分红时切换类型不清理旧字段**
`packageDetail/pages/dividend/dividend.js` ~L81-85 — 从送股切换为现金分红后 `shareQty` 保留旧值，切回送股时显示过时数据。

**L10. `detail.wxml` 策略盈亏缺少千分位格式**
`packageDetail/pages/detail/detail.wxml` L175 — `{{item.netPnL}}` 直接输出，大数值无千分位分隔符，其他金额字段均使用了 `fmt()`。

**L11. `savePosition()` 数量校验 `parseInt` 接受 "100abc"**
`packageDetail/pages/detail/detail.js` L322 — `parseInt("100abc")` 返回 100 通过校验。

**L12. `dividend.js` 编辑时股票已删除静默回退到第一项**
`packageDetail/pages/dividend/dividend.js` L69 — `findIndex` 返回 -1 时 `Math.max(-1, 0) = 0` 静默选中首只股票，未提示用户原股票已不存在。

**L13. `liquid-slider` `wx:key` 可能为 null**
`components/liquid-slider/index.wxml` L3 — tab 的 key 属性为 null 时，框架列表 diff 可能异常。

**L14. `exchangeRate.js` require 路径冗余**
`utils/services/exchangeRate.js` L11 — `../../utils/constants/index` 绕道项目根目录，应为 `../constants/index`。

**L15. `quick-record` 本地股票名覆盖 API 返回名**
`components/quick-record/quick-record.js` ~L171-173 — 本地数据库名称优先于 API 名称，可能显示过时股票名。

---

### 优先修复建议

1. **H1+H2** — `savePosition()` 合成交易逻辑需要重写，直接使用 position 数据比较而非重新计算含费均价
2. **H4** — `_loadData` 加 `loading: true`，修复骨架屏和并发保护
3. **H5+H6** — quick-record 组件加防重复提交 + 市场锁定机制
4. **H3** — `getData()` 加防御性深拷贝或在 Model 层统一使用 `getDataCopy()`
5. **M1** — `PriceCache.set()` 传 stockId 给 `markDataDirty`
6. **M2** — 全部清仓时的收益率计算需用历史总投入作分母
7. **M7** — 批量选择统一 ID 类型（全部转 Number）
8. **M13** — 港股代码在保存和查找时统一格式化
