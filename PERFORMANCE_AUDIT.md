# 茄子笔记本小程序 — 性能诊断报告（v2，基于当前代码）

> **诊断时间**: 2026-06-20
> **诊断对象**: 当前 `main` 分支代码（已落地上一轮报告的部分优化）
> **严重等级**: 🔴 P0(阻塞) / 🟠 P1(严重) / 🟡 P2(一般) / 🔵 P3(建议)

---

## 〇、相对 v1 报告的进展（已修复，不用再改）

v1 报告提的问题中，下面这些**当前代码已经解决**，本轮不再重复：

| v1 问题 | 当前状态 | 证据 |
|---------|---------|------|
| touchEnd 遍历全部 positions | ✅ 已修复 | `touchGestureMixin.js:88-96` 只更新当前 index |
| touchMove 高频 setData | ✅ 已修复 | `rafThrottle` + `requestAnimationFrame` (`touchGestureMixin.js:21-32`) |
| `_loadData` 多次全量遍历 | ✅ 已修复 | `index.js:209-229` 单次 forEach 完成聚合 |
| 启动同步阻塞 (quota/prune) | ✅ 已修复 | `app.js:8-10` `_defer` 延迟 3s/5s |
| setData 传整张 positions 数组 | ✅ 部分修复 | `_fetchPrices` 已用 data path 精确更新 (`index.js:627-657`) |
| WXML 内 market-tag 组件 | ✅ 已改为内联 | `index.wxml:101-102` |
| 价格 wx:if/wx:else | ✅ 已预计算 | `index.js:291-293` `displayPriceText` |
| calcQrFee 高频调用 | ✅ 已加防抖 | `quick-record.js:237-243` `_scheduleCalcFee` 80ms |
| 订阅回调重复 setData | ✅ 已修复 | `index.js:128-131` 回调已置空 |

> 结论：项目已经走在正确方向上。**剩余的真实瓶颈在下面几节。**

---

## 一、当前最值得投入的优化点（按 ROI 排序）

| 排名 | 问题 | 预计收益 | 改动成本 |
|------|------|----------|----------|
| **1** | 🔴 `_allPositions` / `positions` / `displayPositions` **三份数据冗余**，且 `_fetchPrices` 用 `findIndex` 做 O(n) 查找 | setData 体积下降 60%+，价格刷新更顺滑 | ⭐⭐ |
| **2** | 🔴 `animateAllValues` 用 **setTimeout(16ms) 逐帧驱动 setData**，800ms 动画期间约 50 次 setData | 消除滚动数字期间的持续渲染压力 | ⭐⭐ |
| **3** | 🟠 `onShow` 每次切回 tab 都可能触发 `_loadData` + `_fetchPrices`（含网络） | 切 tab 卡顿减少 | ⭐ |
| **4** | 🟠 `getData` 内存缓存 **不防篡改**：上游直接改缓存对象，导致必须 `getDataCopy` / 全量重算 | 减少重复计算，缓存更可靠 | ⭐⭐⭐ |
| **5** | 🟡 隐藏 `<canvas>` 常驻首页 DOM；CSS `animation-delay` 入场动画触发首帧全量布局 | 首屏更快，长列表更轻 | ⭐⭐ |
| **6** | 🟡 全部 3 个 tab 都预加载 2 个分包 | 启动包体积减小 | ⭐ |

---

## 二、🔴 P0 — 数据冗余三连发（最高优先级）

### 2.1 三个数组存同一份持仓

**位置**: `pages/index/index.js` + `pages/index/index.wxml`

当前持仓数据同时存在于 data 的三个字段里：

```
positions        ← 当前 tab 筛选后的全量（用于 summary 显示 "持仓X只"、onRefreshPrice 查找）
displayPositions ← positions 的前 N 条切片（用于 wx:for 渲染列表）
_allPositions    ← 全市场全量（用于切 tab 时的过滤源、_fetchPrices 的行情源）
```

**问题**:

1. **体积 3 倍**。一条 formatted position 有 ~20 个字段（含 `quantityText` / `avgCostText` / `currentPriceText` / `floatingPnLText` / `pnlPercentText` / `marketLabel` / `marketColor` / `marketClass` / `cardClass` / `displayPriceText` / `priceFlashClass` / `entering` …），20 只持仓 = 约 400 个数据节点，**三份就是 1200 个节点**，每次相关 setData 都要 diff 这么多。

2. **`_fetchPrices` 维护成本高**。`index.js:632-655` 里，为了同步一个价格，要在 3 个数组里各做一次 `findIndex`（O(n)），然后写 3~9 个 data path。一旦哪条漏了，三个数组就不同步（事实上 `displayPositions` 已经只在前 `displayCount` 条里更新，超出的卡片切回来会显示旧价）。

3. **切 tab 时 `positions` 整体被覆盖** (`index.js:491-500`)，又一次大体积 setData。

**建议**: 砍掉冗余，只保留一个 `positions`（当前 tab 全量）+ 一个分页游标，WXML 直接对 `positions` 做 `wx:for`，但通过 CSS `:nth-child` 或一个 `visible` 标志位控制只渲染前 N 条。或更简单：保留 `displayPositions` 作为唯一渲染源，但 `positions` 和 `_allPositions` 改为 **挂在实例（`this._`）而非 `data`**——它们不需要进渲染层 diff，只给 JS 逻辑用。

```javascript
// 🟢 不进 data 的"逻辑数据"挂 this
this._allPositionsCache = formattedPositions;   // 不再 setData
this._positionIndexById = new Map(formattedPositions.map((p,i)=>[p.id,i])); // O(1) 查找

// data 只保留渲染必需
this.setData({
  displayPositions: filteredPositions.slice(0, this.data.displayCount),
  // positions / _allPositions 从 data 移除
});
```

把 `_fetchPrices` 改为只更新 `displayPositions` 的对应 index，配合上面的 id→index Map，O(1) 定位。

### 2.2 滚动数字动画 = 持续 50 次 setData

**位置**: `utils/ui/animationHelper.js:14-59`

`animateAllValues` 用 `setTimeout(animate, 16)` 驱动，800ms 动画 ≈ 50 帧，每帧一次 `setData({ "displayValues.totalMarketValue": ..., ... })`。这是在**首页加载完成、用户正准备交互时**连续打 50 次渲染层通信。

更糟的是它被调用得很频繁：
- `_loadData` 完成后 (`index.js:383`)
- `_updateSummary` (`index.js:430`)
- `onMarketTabChange` (`index.js:502`)

每次切市场 tab 都会触发一轮 50 帧 setData。

**建议（任选其一）**:

1. **WXS 响应式动画**（最推荐）：把目标值塞进 data 一次，用 WXS 绑定 `animation`，在渲染层内部插值，**0 次 setData**。
2. **CSS transition**：data 只存最终值，数字用 `transition` + `transform` 滚动（需要把数字拆位，工作量大）。
3. **降低帧率**：把 `16ms` 改成 `33ms`（≈30fps），帧数减半；并在 `progress > 0.95` 时提前结束。这是最小改动。

```javascript
// 🟢 最小改动：30fps + 提前结束
page._animTimer = setTimeout(animate, 33);
// ...
if (progress >= 0.95) {  // 接近终点直接跳到终值
  keys.forEach(k => updates["displayValues." + k] = fmt(targets[k]));
  page.setData(updates);
  page._animTimer = null;
  return;
}
```

---

## 三、🟠 P1 — 重复触发与缓存失真

### 3.1 onShow 触发链过长

**位置**: `pages/index/index.js:146-160`

```javascript
async onShow() {
  if (pageMixin.onShowMixin(this, 0)) {        // dirty → 全量重算
    await this._loadData();
    this._fetchPrices({ silent: true, force: true });  // 强制网络刷新
  } else if (isTradingTime()) {
    this._fetchPrices({ silent: true });        // 交易时段再刷一次
  }
}
```

每次从详情/记录页返回持仓 tab，只要 `dataDirty` 为真（任意交易变动都会标 dirty），就会：**全量重算持仓 + 强制网络拉取所有股票现价**。`force: true` 还会跳过 TTL 缓存。

行情请求虽然是分片批量（`BATCH_SIZE = 40`），但单次 `qt.gtimg.cn` 请求 + GBK 解码 + 重试机制，在弱网下可能 1-3 秒，期间页面已显示但价格会"跳变"。

**建议**:

1. 给行情刷新加**最小间隔节流**（如 30s 内不重复拉取）：
   ```javascript
   if (Date.now() - (this._lastFetchAt || 0) > 30000) { this._fetchPrices(...); this._lastFetchAt = Date.now(); }
   ```
2. `force: true` 只在用户**主动操作**（提交交易后）时用，`onShow` 用普通模式（命中 TTL 缓存就跳过）。
3. 分片改为**首屏优先**：先拉 `displayPositions` 里的股票，渲染后再拉其余。

### 3.2 内存缓存被上游直接修改 → 必须全量重算

**位置**: `utils/storageCore/core.js:95-122` + 调用方

`getData()` 返回的是**缓存对象的引用**。`positionService.mergePositions` (`positionService.js:100-106`) 直接对缓存返回的对象做 `{...stock, ...pos}` 是没问题的（新对象），但 `index.js` 的 `formattedPositions = positions.map(p => ({...p, ...}))` 也 OK。

**真正危险的是**：`getDataCopy` 注释说要"防止外部修改污染缓存"，但很多调用路径（`Transaction.getAll()`、`Stock.getAll()`）直接用 `getData()` 返回引用。任何 `list.push/​splice/​直接改字段` 都会污染缓存，而 `caches.position` 又依赖这些原始数据来标记"已计算过"——一旦源头被改，缓存里的 `position` 结果就是脏的，只能靠 `markDataDirty` 整体清掉重来。

这就是为什么"按 stockId 粒度清除缓存"（v1 报告 4.3）一直没完全落地：只要存在引用泄漏，粒度清除就不安全。

**建议**:

1. **`getData` 一律返回冻结的只读视图**，强制写操作走 `upsertAndSave` / `deleteAndSave`：
   ```javascript
   function getData(key) {
     if (_memCache.has(key)) return _memCache.get(key);
     // ... 读取后冻结
     Object.freeze(data);
     if (Array.isArray(data)) data.forEach(Object.freeze);
     _memCache.set(key, data);
     return data;
   }
   ```
   开发期会在违规写入处直接抛错，能快速定位所有污染点。生产环境可以只 `Object.freeze` 顶层。

2. 这一步做完，才能安全地把 `markDataDirty(["position"])` 改成按 stockId 粒度清除，进一步减少重算。

---

## 四、🟡 P2 — 渲染与资源

### 4.1 首页常驻隐藏 canvas

**位置**: `index.wxml:173`

```xml
<canvas type="2d" id="shareCanvas" style="position: fixed; left: -9999px; ..."></canvas>
```

canvas 节点即便不可见也会被渲染层创建上下文，占内存。它只在 `onSharePortfolio` 时用到。

**建议**: 改成 **按需创建**——把 canvas 移到一个独立的 share 组件里，或用 `wx:if="{{generatingShare}}"` 包裹，分享时才挂载，分享完销毁。

### 4.2 入场动画 animation-delay 强制首帧全量渲染

**位置**: `index.wxml:21,31,65,74,148` + app.wxss `.animate-stagger`

`.stagger-delay-N` 用 `animation-delay` 让卡片依次出现，但**动画开始前 `opacity:0` 的节点仍会参与首次 layout/paint**。列表里 20 张卡片 + summary + slider 全部带 stagger，首屏一次性布局所有节点后再陆续"亮"起来。

**建议**:

1. 列表项不要用 stagger，只给 summary 区做一个轻量 fade-in。
2. 或者用 `lazyCodeLoading: "requiredComponents"`（已开）配合骨架屏（已有），去掉列表的入场动画——骨架屏本身就承担了"加载感"，不需要再加 stagger。

### 4.3 分包预加载过于激进

**位置**: `app.json:13-23`

```json
"preloadRule": {
  "pages/index/index": { "packages": ["packageDetail", "packageRecord"] },
  "pages/history/history": { "packages": ["packageDetail", "packageRecord"] },
  "pages/stats/stats": { "packages": ["packageRecord", "packageDetail"] }
}
```

3 个 tab 全都预加载 2 个分包。首次进入小程序时会同时下载主包 + 2 分包，拖慢首屏。

**建议**: `packageRecord`（交易记录页，从持仓页 FAB 进入）和 `packageDetail`（详情页）只保留在 `index` 的预加载里；`history` / `stats` 不预加载，改为按需（用户点进对应流程时再加载）。微信支持 `network` 限制：

```json
"pages/index/index": {
  "packages": ["packageDetail"],
  "network": "wifi"
}
```

### 4.4 CSS 体积偏大

`app.wxss` 659 行 + 4 个页面 wxss（history 523 / detail 621 / index 594 / record 672）+ 组件 wxss，单看不大，但小程序每个页面都会注入 `app.wxss`。值得用微信开发者工具的 **"代码依赖分析"** 看实际未引用的类。

---

## 五、🔵 P3 — 其他

- **`stockDatabase.js` (243 行)**：本地股票库 `searchStocks` 在 `quick-record` 输入时每次 onInput 调用（虽有防抖 500ms 在 autoFetch 上，但 searchStocks 本身是同步全量扫描）。股票数量大时考虑建前缀索引。
- **`statsService.js` (490 行)** + ECharts：确认 stats 页是否在 onLoad 就 `require` ECharts；如果是，配合 `lazyCodeLoading` 拆分。
- **`_writeQueue` 是 Promise 链**（`core.js:35-43`），但 `saveData` 内部是同步 `wx.setStorageSync`——队列只保证顺序、不消除同步阻塞。写操作发生在交易保存时（非首屏），优先级低。
- **`store.subscribe` 的 `"*"` 通配** (`store.js:51`)：每次 commit 都会 `_notify("*")`，如果有 `*` 订阅者要小心回调里不要做重活。当前 `positionStore` 没人订阅 `*`，暂无影响。

---

## 六、建议的实施顺序

1. **第一步（1-2 处改动，收益最大）**：把 `positions` / `_allPositions` 移出 `data`，挂 `this._`；`displayPositions` 作为唯一渲染源，配 `id→index` Map。同步改造 `_fetchPrices` 和 `onMarketTabChange`。
2. **第二步**：`animateAllValues` 降到 30fps + 提前结束（或迁 WXS）。
3. **第三步**：`onShow` 行情刷新加 30s 节流，去掉非必要的 `force: true`。
4. **第四步**：`getData` 返回冻结视图，定位并消除所有缓存污染点，随后启用 stockId 粒度 dirty 清除。
5. **第五步**：canvas 改按需挂载；分包预加载收敛到 wifi + 仅 index；列表 stagger 动画移除。

前三步都是低风险、可独立提交的改动；第四步需要配套回归测试（有 `tests/memory.test.js` 可作基础）。
