# 茄子笔记本 性能优化方案（第二轮 · 待修项）

> **日期**：2026-07-21
> **前提**：第一轮性能修复（首页三数组冗余、`animateAllValues` 50次setData、`onShow` 行情节流、外部接口 Provider 抽象、死代码清理）已于 7/14–7/20 完成并验证。
> **本方案范围**：仅覆盖**当前代码实测仍存在、上一轮未触及**的性能问题，每项附 `文件:行号` + 改法 + 预期 + 风险，可直接排期。
> **验证方式**：静态走查 + 关键路径代码核对（`getAllPositions` / `statsService` / `positionService` 调用链已实读确认）。

---

## 结论先讲：Top 5（按 ROI 排序）

| # | 问题 | 位置 | 触发 | 量级 | 成本 | 收益 |
|---|------|------|------|------|------|------|
| **1** 🔴 | 统计页强制清空并全量重算持仓，且冲掉首页共享缓存 | `stats.js:45` + `positionService.js:126` | 每次切到 stats tab | O(总交易数)，跨页缓存抖动 | ⭐（1 行） | 极高 |
| **2** 🔴 | 拖拽排序每次 touchmove 直接 setData | `index.js:1060` | 拖拽期间 ~60次/秒 | 高频渲染 diff | ⭐⭐ | 高 |
| **3** 🟠 | `deepFreeze` 每次写入递归冻结整份数组 | `core.js:108` | 每次新增/编辑/删除记录 | O(N)，随数据量线性恶化 | ⭐⭐ | 中（数据量大时高） |
| **4** 🟠 | 单点操作（改价/备注/置顶/拖拽落点）触发整页 `_loadData` | `index.js:530/848/992/1027/1093` | 上述单点交互 | O(持仓+交易) | ⭐⭐⭐ | 中 |
| **5** 🟡 | 历史页每次筛选/搜索全量重建分组字典 | `history.js:130-184` | 每次筛选/搜索输入 | O(总记录数) | ⭐⭐ | 中 |

---

## 1. 🔴 统计页强制重算 + 冲掉首页共享缓存（最高 ROI，改动最小）

**现状**
```js
// pages/stats/stats.js:44-48
_computeAllPositions() {
  const positions = getAllPositions(true);   // ← 每次打开统计页都 forceRefresh=true
  ...
}
// utils/services/positionService.js:123-133
function getAllPositions(forceRefresh = false) {
  const stocks = Stock.getAll();
  const stockIds = stocks.map((s) => s.id);
  if (forceRefresh) {
    stockIds.forEach((id) => caches.position.delete(id));  // ← 清空整个 position LRU
  }
  return sortByTotalPnL(mergePositions(stocks));           // ← 随后全量重算
}
```

**问题（两层）**
1. `caches.position` 是**首页与统计页共享**的 LRU。统计页每次 `forceRefresh=true` 会把所有股票的持仓缓存 delete，导致：切到统计页 → 全量重算；切回首页 → 首页缓存已被冲掉 → 首页 `onShow` 又全量重算。**跨页面缓存抖动**。
2. 强制清缓存本身是多余的：写入记录时 `markDataDirty` 已按 `stockId` 精确清除 position 缓存（`cacheManager.js`），**数据没脏时缓存就是准确的**，无需 force。

**改法（一行，最低风险）**
```js
// stats.js:45 —— 去掉强制刷新，复用共享缓存
const positions = getAllPositions();   // 原为 getAllPositions(true)
```
若担心极端场景（外部直接改存储绕过 markDataDirty），可折中为**仅数据脏时 force**：在 `onShow`/`loadStats` 里用 `pageMixin` 的 dirty 判定结果传入 `getAllPositions(wasDirty)`。

**预期**：统计页首屏计算量降到接近 0（缓存命中）；消除首页↔统计页来回切的重复全量重算。数据量越大收益越明显。

**风险**：极低。有 `tests/statsService.test.js` 等护航；需在开发者工具验证「新增一笔交易后进统计页数字实时更新」（依赖 markDataDirty 链路，已存在）。

---

## 2. 🔴 拖拽排序每次 touchmove 都 setData

**现状**
```js
// pages/index/index.js:1060-1065
onDragMove(e) {
  if (this._dragId == null) return;
  const dy = e.touches[0].clientY - this._dragStartY;
  const idx = this._dragOrigIdx;
  this.setData({ [`displayPositions[${idx}].dragOffset`]: dy });  // 每次 touchmove
}
```

**问题**：touchmove 约 60 次/秒，每次一次 `setData` 同步序列化 + 渲染层 diff，是拖拽卡顿的典型来源。无 rAF 节流，未复用第一轮 `touchGestureMixin` 已有的 `rafThrottle`。

**改法（任选）**
- **A（推荐）** 复用 `utils/ui/touchGestureMixin.js` 的 `rafThrottle`：把 `setData` 包进 `requestAnimationFrame`，多次 touchmove 合并为每帧一次。
- **B** 迁移到 WXS：`dragOffset` 交给 WXS 事件在渲染层直接改 `transform`，**0 次 setData**（与第一轮 `animateAllValues` 迁 WXS 思路一致）。

**预期**：拖拽帧率从「每 move 一渲染」降到「每帧一渲染」（≤60→≤帧率），拖拽跟手不卡。

**风险**：低。需真机验证拖拽跟手度与落点准确性（`onDragEnd` 逻辑不变）。

---

## 3. 🟠 `deepFreeze` 每次写入递归冻结整份数组

**现状**
```js
// utils/storageCore/core.js:105-111
function saveData(key, data) {
  storage.setStorageSync(key, data);
  const frozen = deepFreeze(data);   // :108 递归冻结整份列表 + 每个对象
  memCache.set(key, frozen);
  ...
}
// :84-98 deepFreeze 对数组每个元素递归 Object.freeze
```

**问题**：每存一条交易（`saveData`/`upsertAndSave`/`deleteAndSave`）都对**整份** `transactions` 数组及其每个对象递归 `Object.freeze`，O(N)。与「增量写应 O(1)」相悖；N 越大写越慢。冷启动时每个 key 首次 `getData` 未命中也走一遍。

**背景**：deepFreeze 是第一轮为根治「缓存被上游 mutate 污染」引入的只读契约，**不能简单删除**。

**改法（渐进，低风险优先）**
- **A（推荐）** 浅冻结：只 `Object.freeze(data)`（顶层数组）+ 冻结**本次新增/改动的那一条**，历史元素只在首次读时冻结一次（加 `_frozen` 标记跳过重复冻结）。
- **B** 仅在**读路径**冻结、写路径不冻结（写完的对象随后读会被冻结），把契约成本从「每次写」挪到「首次读」。
- **C（保守）** 开发环境 deepFreeze、生产环境仅浅冻结（`__DEV__` 门控）——保留污染定位能力，去掉线上开销。

**预期**：写入从 O(N) 降到 O(1)~O(改动条数)；记录多时保存/删除更跟手。

**风险**：中。改只读契约需回归 `tests/memory.test.js` + 各 model 测试，确认无缓存污染回归。**建议独立提交 + 全量跑测试。**

---

## 4. 🟠 单点操作触发整页 `_loadData`

**现状**
```js
// pages/index/index.js
// onRefreshPrice:848   this._loadData();                 单只改价却全量重建
// updatePrice:530      this.refresh({ fetchPrices:false });
// saveAssetMeta:992    this.refresh({ fetchPrices:false });
// togglePin:1027 / onDragEnd:1093  this.refresh(...);
```

**问题**：改一条价格/备注、置顶一只、拖拽落点，都触发 `_loadData` 全量重读 `getAllPositions` + `Transaction.getAll()` + 重建 formattedPositions + marketAgg + 重过滤，O(持仓+交易)。单点操作本可只改对应缓存项 + 增量 setData。

**改法**：为高频单点操作提供「局部更新」路径——改某只时只更新该 position 在 `displayPositions` 的对应 index（复用已有 `id→index` Map）+ 增量重算 summary，避免整页重建。置顶/拖拽落点只改顺序（`prefs.assetOrder`）+ 局部 setData。

**预期**：单点交互从「整页重建」降到「单项更新」，改价/置顶/备注即时生效不卡。

**风险**：中。需保证 summary/占比条与局部更新同步（否则出现汇总与明细不一致）。建议先做「改价」局部化（收益最大、逻辑最独立），其余观察后再改。

---

## 5. 🟡 历史页每次筛选/搜索全量重建分组

**现状**
```js
// pages/history/history.js:130-184
_applyFilters() {
  // 每次都 Object.keys(grouped).map 全量重建分组字典 + 数组 + collectFilterIds
  // 关键字 filter:145-150 O(n)
}
```

**问题**：`_buildAllRecords`（重视图对象）仅 dirty 时跑一次（可接受），但 `_applyFilters` 在**每次**切筛选 tab / 市场 / 策略 / 搜索输入（防抖后）都 O(总记录数) 重建 `grouped` 字典 + 数组。记录多时每次按键有可见成本。

**改法**：搜索/筛选时对**已构建的分组结果**做过滤，而非从原始记录重建分组；或缓存「无关键字」的分组基线，搜索只在基线上 filter。

**预期**：搜索输入不再每键全量重分组，长列表下搜索更跟手。

**风险**：低-中。需保证 `mergeRelated`（合并展示）与 `collectFilterIds`（全选计数）在过滤后仍正确。

---

## 已核实的「非问题」（避免误报，节省排期）

- `shareHelper.js` 长图 `MAX_ROWS=200` 已封顶，canvas 尺寸有界，无泄漏。
- `stockDatabase.searchStocks` 每键全扫，但走 `NAME_PINYIN_MAP`、无实时拼音计算，n 小，ROI 低。
- 首页自动刷新 `setInterval`（`index.js:1109`）在 `onHide`/`onUnload` 均 `clearInterval`，**无泄漏**。
- `transactionIndex`/`dateIndex` 惰性重建（写时 invalidate、查时一次性 O(n)），设计正确，非热路径。

---

## 建议实施顺序

1. **立即（低风险高收益）**：#1（一行）+ #2（拖拽 rAF）。可独立提交，`npm test` 应保持 187 passed。
2. **中期（需回归测试）**：#3 deepFreeze 浅冻结（独立提交 + 全量测试）。
3. **按需**：#4 首页改价局部化 → 观察后再推广；#5 历史页搜索基线缓存。

**不做**：不引入虚拟列表/图表库/后端——当前数据规模下 #1~#5 已覆盖真实瓶颈，虚拟列表属过度设计。

---

*本方案所有问题点均经当前代码核对（`getAllPositions`/`statsService`/`positionService` 调用链已实读）。#1 的「跨页缓存抖动」为本轮新发现，是投入产出比最高的一项。*
