# 性能优化全面深度设计（第二轮）

> 日期：2026-07-01
> 基于：全面代码审计（app.js / 全页面 / services / models / cache / helpers / WXML）
> 目标：消除上一轮优化引入的回归 + 消除全量扫描/重复计算 + 索引层建设

---

## 审计背景

上一轮性能优化（`2026-06-30-performance-optimization-design.md`）已完成：

- ✅ positions/_allPositions 移出渲染层
- ✅ 单次 setData 合并、data-path 精确更新
- ✅ onShow 30s 节流、refresh() 统一管道
- ✅ getData 返回冻结视图
- ✅ Canvas 按需挂载、分包预加载收敛、stagger 移除
- ✅ position LRU 缓存、batch 批量计算

本轮聚焦：**修复 freeze 回归** + **消除全量扫描/重复计算** + **索引层 + 增量更新**。

---

## 审计发现总览

| 级别 | 问题 | 位置 |
|------|------|------|
| 🔴 高 | getData() 每次调用重新 freeze | `storageCore/core.js` |
| 🔴 高 | 统计页 onOpenAnnualReport 双次全量 batchCalc | `stats.js` |
| 🔴 高 | 统计页 loadStats 三次全量遍历 | `stats.js` |
| 🟠 中 | Transaction.getByStockId 全量扫描+排序 | `transaction.js` |
| 🟠 中 | 流水页每次全量重建格式化对象 | `history.js` |
| 🟠 中 | 首页 _updateSummary 全量重算 | `index.js` |
| 🟠 中 | 首页 market tab 切换 reduce 全量聚合 | `index.js` |
| 🟠 中 | priceCache.setBatch 扩散整个价格对象 | `priceCache.js` |
| 🟡 低 | WXML 滑动按钮始终渲染 | `index.wxml` |
| 🟡 低 | 多处 new Date(t.date) 逐条构造 | 多文件 |

---

## 第 1 节：存储层 freeze 回归修复

### 问题

`getData()` 在 `core.js:86-115` 中，即使内存缓存命中，也会对数组执行 `Object.freeze` + `data.forEach(Object.freeze)`。对于交易/分红等数组，每次 `getAll()` 都触发一次全数组遍历。而 `getAll()` 在单次页面加载中被多个 service 反复调用（如统计页加载时 Transaction 被扫 3-4 次）。

### 方案

将冻结逻辑从 `getData` 移到 `saveData` 和首次缓存加载。`getData` 的缓存命中路径直接返回已冻结的引用。

```javascript
// core.js
function saveData(key, data) {
	wx.setStorageSync(key, data);
	const frozen = deepFreeze(data);
	_memCache.delete(key);
	_memCache.set(key, frozen);
}

function getData(key) {
	if (_memCache.has(key)) {
		return _memCache.get(key); // 已冻结，直接返回
	}
	let data = wx.getStorageSync(key);
	if (data === undefined || data === null || data === "" ||
		(Array.isArray(data) && data.length === 0)) {
		data = key === PRICE_KEY ? {} : [];
	}
	_memCache.set(key, data);
	return data; // 首次未冻结，供 getDataCopy/slice 拷贝
}
```

### deepFreeze 工具

```javascript
function deepFreeze(obj) {
	if (obj === null || typeof obj !== "object") return obj;
	Object.freeze(obj);
	if (Array.isArray(obj)) {
		obj.forEach((item) => { if (item && typeof item === "object") deepFreeze(item); });
	} else {
		Object.keys(obj).forEach((k) => { const v = obj[k]; if (v && typeof v === "object") deepFreeze(v); });
	}
	return obj;
}
```

### 关键细节

- `saveData` 时冻结 → 后续 `getData` 缓存命中返回冻结对象
- 首次从 storage 加载时不冻结（因为 `upsertAndSave`/`deleteAndSave` 内部用 `getData().slice()` 拷贝后再写）
- `getDataCopy` 保持不变
- `pruneExpired` 操作的是 `getData(PRICE_KEY)` 返回的冻结对象，但其内部用 `{...getData()}` 拷贝，不受影响

### 影响文件

- `utils/storageCore/core.js`

---

## 第 2 节：Transaction 索引层

### 问题

`Transaction.getByStockId()` 在 `transaction.js:71-74` 执行 `getAll().filter().sort()` — 每只股票 O(n log n)。详情页 `loadData` 调了两次（`calculatePosition` 内部一次 + 直接调用一次）。positionService 的单个股票路径也依赖此方法。

### 方案

新增 `utils/models/transactionIndex.js`，写入时失效、查询时惰性重建。

```javascript
// transactionIndex.js
const _byStockId = new Map();
let _built = false;

function _ensureBuilt() {
	if (_built) return;
	const txList = require("./transaction");
	const all = txList.getAll();
	all.forEach((t) => {
		if (!_byStockId.has(t.stockId)) _byStockId.set(t.stockId, []);
		_byStockId.get(t.stockId).push(t);
	});
	_byStockId.forEach((list) => {
		list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
	});
	_built = true;
}

function getByStockId(stockId) {
	_ensureBuilt();
	return _byStockId.get(stockId) || [];
}

function invalidate() {
	_built = false;
	_byStockId.clear();
}

module.exports = { getByStockId, invalidate };
```

### 索引同步

在 `transaction.js` 的写操作后调用 `invalidate()`：

```javascript
save(transaction) {
	const result = upsertAndSave(TRANSACTION_KEY, transaction);
	markDataDirty(["position", "heatmap", "periodStats"], transaction.stockId);
	require("./transactionIndex").invalidate();
	return result;
}

delete(id) {
	deleteAndSave(TRANSACTION_KEY, id, ["position", "heatmap", "periodStats"]);
	require("./transactionIndex").invalidate();
}

deleteByStockId(stockId) {
	const transactions = this.getAll().filter((t) => t.stockId !== stockId);
	saveData(TRANSACTION_KEY, transactions);
	markDataDirty(["position", "heatmap", "periodStats"], stockId);
	require("./transactionIndex").invalidate();
}
```

### 调用方切换

- `positionService.calculatePosition`: 用 `TransactionIndex.getByStockId(stockId)` 替代 `Transaction.getByStockId(stockId)`
- `detail.loadData`: 用索引获取 rawTransactions，并移除对 `calculatePosition` 的依赖（直接传已有 transactions 给计算）
- `history._buildAllRecords`: 保留 `Transaction.getAll()`（需要全量，索引无优势）

### 关键细节

- 写频率远低于读，惰性重建比增量维护更简单可靠
- `getAll()` 本身有 memCache（返回冻结数组），重建时 `getAll()` 是 O(1)，索引构建是 O(n) 但只发生一次
- 循环依赖：`transactionIndex` 延迟 require `./transaction`，避免启动时循环

### 影响文件

- 新增 `utils/models/transactionIndex.js`
- 修改 `utils/models/transaction.js`
- 修改 `utils/services/positionService.js`
- 修改 `packageDetail/pages/detail/detail.js`

---

## 第 3 节：首页增量汇总 + 市场预计算

### 问题

1. `_updateSummary()` 在 `index.js:387-418` 行情刷新时遍历全部持仓重算汇总
2. `onMarketTabChange()` 在 `index.js:432-492` 切 tab 时用 reduce 全量聚合

### 方案

#### 3a. 增量汇总

行情拿到新价格后，只更新受影响的股票贡献：

```javascript
// index.js _fetchPrices 中
if (Object.keys(updates).length > 0) {
	this.setData(updates);
	this._updateSummaryIncremental(validResults);
} else {
	this.refresh({ fetchPrices: false });
}

_updateSummaryIncremental(priceResults) {
	const rates = this.data._rates || { usdToCny: 1, hkdToCny: 1 };
	let addedMarketValue = 0, addedPnL = 0;
	priceResults.forEach((r) => {
		const idx = this._allIndexById ? this._allIndexById.get(r.stockId) : undefined;
		const pos = idx != null ? this._allPositionsCache[idx] : null;
		if (!pos || pos.quantity <= 0) return;
		const rate = _getRate(pos.market, rates);
		const oldPrice = pos.currentPrice || 0;
		addedMarketValue += (r.price - oldPrice) * pos.quantity * rate;
		addedPnL += (r.price - oldPrice) * pos.quantity * rate;
	});
	if (addedMarketValue === 0 && addedPnL === 0) return;
	const totalMarketValue = parseFloat((this.data.totalMarketValue + addedMarketValue).toFixed(2));
	const totalPnL = parseFloat((this.data.totalPnL + addedPnL).toFixed(2));
	const totalInvestment = this._cachedTotalInvestment || 1;
	this.setData({
		totalMarketValue,
		totalMarketValueText: fmt(totalMarketValue),
		totalPnL,
		totalPnLText: fmt(totalPnL),
		totalPnLPercent: totalInvestment > 0
			? parseFloat(((totalPnL / totalInvestment) * 100).toFixed(2)) : 0,
		"displayValues.totalMarketValue": fmt(totalMarketValue),
		"displayValues.totalPnL": fmt(totalPnL),
		"displayValues.totalPnLPercent": fmt(
			totalInvestment > 0 ? parseFloat(((totalPnL / totalInvestment) * 100).toFixed(2)) : 0
		),
	});
}
```

保留 `_updateSummary()` 全量方法给 `_loadData` 首次加载使用。

#### 3b. 市场 tab 预计算

`_loadData` 中格式化完成后，预计算各市场聚合缓存：

```javascript
// _loadData 中 formattedPositions 构建后
const marketAgg = {};
let totalMV = 0, totalPnL = 0;
formattedPositions.forEach((p) => {
	const rate = _getRate(p.market, rates);
	if (!marketAgg[p.market]) marketAgg[p.market] = { marketValue: 0, pnl: 0 };
	if (p.currentPrice) {
		const mv = p.currentPrice * p.quantity * rate;
		marketAgg[p.market].marketValue += mv;
		totalMV += mv;
	}
	const pnl = (p.floatingPnL + p.realizedPnL + p.dividendIncome) * rate;
	marketAgg[p.market].pnl += pnl;
	totalPnL += pnl;
});
marketAgg[null] = { marketValue: totalMV, pnl: totalPnL };
this._marketAggCache = marketAgg;
```

`onMarketTabChange` 改为：

```javascript
onMarketTabChange(e) {
	const key = e.detail.key;
	this.setData({ tabAnimating: true });
	if (this._tabTimer) clearTimeout(this._tabTimer);
	this._tabTimer = setTimeout(() => {
		const allPositions = this._allPositionsCache || [];
		const filteredPositions = key ? allPositions.filter((p) => p.market === key) : allPositions;
		this._positionsCache = filteredPositions;
		this._indexById = new Map(filteredPositions.map((p, i) => [p.id, i]));
		const displaySlice = filteredPositions.slice(0, 20);

		// 从缓存读取市场聚合（key 为 null 表示"全部"）
		const aggKey = key == null ? null : key;
		const agg = this._marketAggCache[aggKey] || this._marketAggCache[null];
		const marketInvestment = key
			? (this._cachedMarketInvestment && this._cachedMarketInvestment[key]) || 0
			: this._cachedTotalInvestment || 0;
		const marketPnLPercent = marketInvestment > 0 ? (agg.pnl / marketInvestment) * 100 : 0;

		this.setData({
			currentMarket: key,
			positionCount: filteredPositions.length,
			displayPositions: displaySlice,
			tabAnimating: false,
			displayCount: 20,
			totalMarketValue: parseFloat(agg.marketValue.toFixed(2)),
			totalPnL: parseFloat(agg.pnl.toFixed(2)),
			totalPnLPercent: parseFloat(marketPnLPercent.toFixed(2)),
			"displayValues.totalMarketValue": fmt(agg.marketValue),
			"displayValues.totalPnL": fmt(agg.pnl),
			"displayValues.totalPnLPercent": fmt(marketPnLPercent),
		});
	}, TIMING_CONFIG.TAB_SWITCH_ANIM_DELAY);
}
```

### 影响文件

- `pages/index/index.js`

---

## 第 4 节：流水页格式化结果缓存

### 问题

`history.js:65-144` 的 `_buildAllRecords()` 每次 `loadHistory()` 都 map 全量记录、每条 `new Date(t.date)`、重排序。而 `loadHistory()` 在每次 onShow dirty 时调用。

### 方案

格式化结果缓存 + dirty 标记，无变化时跳过重建。

```javascript
// history.js
loadHistory() {
	const dirty = this._dataDirty || !this._cachedAllRecords;
	if (dirty) {
		this._buildAllRecords();
		this._dataDirty = false;
	}
	this.setData({
		activeStrategies: Strategy.getUsedStrategies(),
		loading: false,
		recordExists: this._cachedAllRecords && this._cachedAllRecords.length > 0,
	});
	this._applyFilters();
}

onShow() {
	const wasDirty = pageMixin.onShowMixin(this, 1);
	this._dataDirty = wasDirty;
	if (wasDirty || !this._allGroupedHistory) {
		this.loadHistory();
	}
	if (!this.data.entranceDone) {
		this.setData({ entranceDone: true });
	}
}
```

### 关键细节

- `_cachedAllRecords` 在 `onUnload` 已清空（`history.js:407`），首次进入必重建
- 纯筛选/搜索切换走 `_applyFilters`（已有缓存），不触发 `_buildAllRecords`
- `new Date(t.date)` 在格式化时无法避免，但通过缓存避免重复执行
- `_applyFilters` 过滤后无需重排（`_cachedAllRecords` 已排序）

### 影响文件

- `pages/history/history.js`

---

## 第 5 节：统计页去重 + 合并遍历

### 问题

1. `onOpenAnnualReport`（`stats.js:181-326`）中 `getClearedPositions()` 和 `getPositionSummary()` 各触发一次全量 `batchCalcPositions`
2. `loadStats`（`stats.js:155-175`）三次独立遍历：`_calcPeriodStats` + `_buildTradeList` + `_formatClearedPositions`

### 方案

#### 5a. 合并两次持仓重算

抽取 `_computeAllPositions()` 一次 batchCalc，结果缓存供 cleared 和 summary 复用：

```javascript
// stats.js 新增
_computeAllPositions() {
	const stocks = Stock.getAll();
	const stockIds = stocks.map((s) => s.id);
	const allTransactions = Transaction.getAll();
	const allDividends = Dividend.getAll();
	const positions = batchCalcPositions(stockIds, allTransactions, allDividends, (id) => PriceCache.get(id));
	this._positionsCache = positions;
	return positions;
}
```

`onOpenAnnualReport` 改为：

```javascript
const positions = this._computeAllPositions();
const cleared = Object.values(positions).filter(
	(p) => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01)
);
const summary = Object.values(positions).filter((p) => p.quantity > 0);
// 后续用 cleared 和 summary 替代 getClearedPositions / getPositionSummary 调用
```

#### 5b. loadStats 三遍历合并

```javascript
async loadStats() {
	try {
		const period = this.data.currentPeriod;
		const { stats, detailItems } = await this._calcPeriodStats(period);
		const { completeTrades, clearedPositions } = this._buildTradeListAndCleared();
		this.setData({ stats, detailItems, completeTrades, clearedPositions, loading: false });
	} catch (err) { /* ... */ }
}

_buildTradeListAndCleared() {
	const positions = this._computeAllPositions(); // 复用
	const stocks = Stock.getAll();
	const stockMap = buildStockMap(stocks);
	const rawTx = Transaction.getAll();
	const allDivs = Dividend.getAll();

	const txList = rawTx.map((t) => {
		const stock = stockMap[t.stockId];
		const price = parseFloat(t.price) || 0;
		const quantity = parseFloat(t.quantity) || 0;
		const fee = parseFloat(t.fee) || 0;
		const amount = price * quantity;
		const isBuy = t.type === "BUY";
		return {
			id: t.id, stockId: t.stockId, type: t.type,
			typeText: isBuy ? "买入" : "卖出",
			typeTagClass: `tag type-tag ${isBuy ? "tag-buy" : "tag-sell"}`,
			amountClass: `detail-d-amount mono-num ${isBuy ? "xhs-loss" : "xhs-profit"}`,
			dateText: t.date ? fmtDate(new Date(t.date)) : "-",
			_sortKey: t._sortKey || new Date(t.date).getTime(),
			price, priceText: fmt(price), quantity, fee, feeText: fmt(fee),
			amountText: fmt(amount), totalPnLText: fmt(amount),
			name: stock ? stock.name : "-", code: stock ? stock.code : "-",
			market: stock ? stock.market : "",
		};
	});

	const divList = allDivs.map((d) => {
		const stock = stockMap[d.stockId];
		return {
			id: d.id, stockId: d.stockId, type: "DIVIDEND",
			typeText: "分红", typeTagClass: "tag type-tag tag-dividend",
			amountClass: "detail-d-amount mono-num xhs-profit",
			dateText: d.date ? fmtDate(new Date(d.date)) : "-",
			_sortKey: d._sortKey || new Date(d.date).getTime(),
			amountText: fmt(d.totalAmount), totalPnLText: fmt(d.totalAmount),
			name: stock ? stock.name : "-", code: stock ? stock.code : "-",
			market: stock ? stock.market : "",
		};
	});

	const completeTrades = txList.concat(divList).sort((a, b) => b._sortKey - a._sortKey);

	const clearedPositions = Object.values(positions)
		.filter((p) => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01))
		.map((p) => {
			const totalPnL = p.realizedPnL + p.dividendIncome;
			return Object.assign({}, p, {
				totalPnL,
				totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(totalPnL),
				realizedPnLText: fmt(p.realizedPnL),
				dividendIncomeText: fmt(p.dividendIncome),
				pnlClass: totalPnL >= 0 ? "profit" : "loss",
			});
		});

	return { completeTrades, clearedPositions };
}
```

### 关键细节

- `batchCalcPositions` 本身有 position LRU 缓存，但跨 service 调用仍会重复 mergePositions。实例级 `_positionsCache` 消除跨调用冗余
- `completeTrades` 仍需全量 map（每条都要格式化），但只执行一次遍历
- `getStrategyStats` 保留（用 rawTx，无需持仓计算）
- `_sortKey` 优先使用预计算字段，fallback 到 `new Date`

### 影响文件

- `pages/stats/stats.js`

---

## 第 6 节：WXML 虚拟列表 + Date 预计算

### 问题

1. 持仓卡 3 个滑动按钮始终在 DOM（用 transform 隐藏）
2. 多处 `new Date(t.date)` 逐条构造（history/stats/xirr）

### 方案

#### 6a. 滑动按钮按需渲染

```xml
<!-- index.wxml -->
<view class="swipe-actions {{item.swipeOpen ? 'swipe-actions-open' : ''}}">
	<view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-edit"
		  data-stock-id="{{item.id}}" catchtap="onSwipeEdit">
		<view class="swipe-action-content">
			<text>编辑</text>
			<text class="swipe-action-sub">{{item.quantityText}}股</text>
		</view>
	</view>
	<view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-sell"
		  data-stock-id="{{item.id}}" catchtap="onSwipeSell">
		<view class="swipe-action-content">
			<text>卖出</text>
			<text wx:if="{{item.quantity > 0}}" class="swipe-action-sub">可卖{{item.quantityText}}</text>
		</view>
	</view>
	<view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-delete"
		  data-stock-id="{{item.id}}" catchtap="onSwipeDelete">删除</view>
</view>
```

虚拟列表只渲染可见项（~20 条），实际收益有限，但逻辑更干净、DOM 更精简。

#### 6b. Date 预计算

交易/分红写入时预计算 `_sortKey`（时间戳数值），避免排序/比较时反复 `new Date()`。

```javascript
// entityFactory.js — createTransaction / createDividend
function createTransaction(stockId, type, price, quantity, fee, date, note, reason, strategies, id) {
	return {
		id, stockId, type, price, quantity, fee, date, note, reason, strategies,
		_sortKey: new Date(date).getTime(), // 写入时计算一次
	};
}
```

调用方切换：
- `history._buildAllRecords`: `allRecords.sort((a, b) => b._sortKey - a._sortKey)` — 无需每条 new Date
- `stats._buildTradeListAndCleared`: 同上
- `xirrService._buildCashFlowsCore`: 仍需 `new Date(t.date)` 做范围过滤（无法避免，但 XIRR 有缓存）

#### 向后兼容

旧数据无 `_sortKey` 字段时 fallback：

```javascript
_sortKey: t._sortKey || new Date(t.date).getTime()
```

可选：在 app 启动时（`_pruneStaleData` 旁）写一次性升级函数，给旧交易/分红补 `_sortKey`。

### 影响文件

- `utils/helpers/entityFactory.js`
- `pages/index/index.wxml`
- `pages/history/history.js`
- `pages/stats/stats.js`

---

## 实施顺序

| 顺序 | 节 | 改动文件 | 验证方式 |
|------|-----|----------|----------|
| 1 | freeze 修复 | `core.js` | `npm test` + 手动验证 CRUD |
| 2 | Transaction 索引 | +`transactionIndex.js`, `transaction.js`, `positionService.js`, `detail.js` | `npm test` + 详情页/持仓显示 |
| 3 | 首页增量+预计算 | `index.js` | 手动验证行情刷新/切 tab |
| 4 | 流水缓存 | `history.js` | 手动验证筛选/搜索不重建 |
| 5 | 统计页去重合并 | `stats.js` | 手动验证年报/统计加载 |
| 6 | WXML+Date | `entityFactory.js`, `index.wxml`, `history.js`, `stats.js` | 手动验证滑动/排序 |

---

## 风险评估

| 风险 | 缓解措施 |
|------|----------|
| 索引与写操作不同步 | 所有写路径统一调 invalidate()，单测覆盖 upsert/delete/deleteByStockId |
| 增量汇总精度丢失 | 保留全量方法给首次加载；增量只做加减，不涉及复杂计算 |
| 统计页逻辑重组引入 bug | 保留原方法作为 fallback，新管道结果对比测试 |
| _sortKey 旧数据缺失 | fallback 到 new Date；可选一次性迁移 |
| freeze 修改影响现有代码 | upsertAndSave/deleteAndSave 已用 slice 拷贝，不依赖冻结；getDataCopy 不变 |

---

## 验证清单

- [ ] `npm test` 全部通过
- [ ] 首页：持仓显示、行情刷新、切 market tab、下拉刷新
- [ ] 详情页：加载、编辑持仓、删除交易
- [ ] 流水页：加载、筛选、搜索、加载更多、批量选择/删除
- [ ] 统计页：加载、切周期、打开年报、清除数据
- [ ] 记录页：添加/编辑/删除 BUY/SELL/DIVIDEND
- [ ] 分享功能正常（canvas 按需挂载）
