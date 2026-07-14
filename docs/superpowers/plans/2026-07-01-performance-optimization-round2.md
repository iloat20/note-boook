# Performance Optimization Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the getData() freeze regression, add a Transaction index layer, implement incremental summary updates and market precompute on the homepage, cache formatted history records, deduplicate stats page calculations, and precompute `_sortKey` timestamps.

**Architecture:** Storage-layer freeze-on-write (instead of freeze-on-read), lazy-rebuilt Transaction index invalidated on writes, instance-level position cache on stats page shared across methods, dirty-flag-based formatting cache on history page, incremental aggregation on price refresh replacing full re-scan.

**Tech Stack:** WeChat Mini Program (WXML/WXSS/JS), wx.setStorageSync, LRU Cache, Jest for unit tests

---

## File Structure

**Create:**
- `utils/models/transactionIndex.js` — lazy-rebuilt index, `getByStockId(stockId)`, `invalidate()`
- `tests/storageFreeze.test.js` — freeze-on-write behavior tests
- `tests/transactionIndex.test.js` — index query + invalidation tests

**Modify:**
- `utils/storageCore/core.js` — move freeze from `getData` to `saveData`, add `deepFreeze`
- `utils/models/transaction.js` — call `invalidate()` after save/delete/deleteByStockId
- `utils/services/positionService.js` — use `TransactionIndex.getByStockId` in `calculatePosition`
- `packageDetail/pages/detail/detail.js` — fetch raw transactions once via index, pass to calcPosition
- `pages/index/index.js` — add `_updateSummaryIncremental`, `_marketAggCache`, rewrite `onMarketTabChange`
- `pages/history/history.js` — add `_dataDirty` flag, skip `_buildAllRecords` when clean
- `pages/stats/stats.js` — add `_computeAllPositions`, merge `_buildTradeListAndCleared`, simplify `onOpenAnnualReport`
- `utils/helpers/entityFactory.js` — add `_sortKey` to `createTransaction` / `createDividend`
- `pages/index/index.wxml` — wrap swipe buttons in `wx:if="{{item.swipeOpen}}"`

---

## Task 1: Storage freeze-on-write fix

**Files:**
- Modify: `utils/storageCore/core.js:74-115`
- Create: `tests/storageFreeze.test.js`

- [ ] **Step 1: Write failing tests for freeze-on-write**

Create `tests/storageFreeze.test.js`:

```javascript
let _mockStorage = {};

beforeEach(() => {
	_mockStorage = {};
	jest.clearAllMocks();
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value; }),
	};
});

describe("Storage freeze-on-write", () => {
	let core;
	beforeEach(() => { core = require("../utils/storageCore/core"); });

	test("saveData freezes the stored array and its items", () => {
		const arr = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
		core.saveData("tx_key", arr);
		const cached = core.getData("tx_key");
		expect(Object.isFrozen(cached)).toBe(true);
		expect(Object.isFrozen(cached[0])).toBe(true);
	});

	test("getData on cache hit returns same reference (no re-freeze)", () => {
		core.saveData("tx_key", [{ id: 1 }]);
		const first = core.getData("tx_key");
		const second = core.getData("tx_key");
		expect(second).toBe(first);
	});

	test("getData on first load returns mutable data (for slice/copy)", () => {
		_mockStorage["tx_key"] = [{ id: 1 }];
		const data = core.getData("tx_key");
		expect(Object.isFrozen(data)).toBe(false);
	});

	test("getDataCopy returns mutable copy even when cache is frozen", () => {
		core.saveData("tx_key", [{ id: 1, name: "frozen" }]);
		const copy = core.getDataCopy("tx_key");
		expect(Object.isFrozen(copy)).toBe(false);
		copy.push({ id: 2 });
		expect(copy.length).toBe(2);
		expect(core.getData("tx_key").length).toBe(1);
	});

	test("upsertAndSave works with freeze-on-write (slice before mutate)", () => {
		core.saveData("tx_key", [{ id: 1, name: "old" }]);
		core.upsertAndSave("tx_key", { id: 1, name: "new" });
		const result = core.getData("tx_key");
		expect(result[0].name).toBe("new");
		expect(Object.isFrozen(result)).toBe(true);
	});

	test("deleteAndSave works with freeze-on-write", () => {
		core.saveData("tx_key", [{ id: 1 }, { id: 2 }]);
		core.deleteAndSave("tx_key", 1);
		const result = core.getData("tx_key");
		expect(result.length).toBe(1);
		expect(result[0].id).toBe(2);
	});

	test("saveData freezes nested objects recursively (deepFreeze)", () => {
		const obj = { a: { b: { c: 1 } } };
		core.saveData("obj_key", obj);
		const cached = core.getData("obj_key");
		expect(Object.isFrozen(cached)).toBe(true);
		expect(Object.isFrozen(cached.a)).toBe(true);
		expect(Object.isFrozen(cached.a.b)).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/storageFreeze.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement freeze-on-write in core.js**

Replace `saveData` and `getData` in `utils/storageCore/core.js`:

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

function saveData(key, data) {
	wx.setStorageSync(key, data);
	const frozen = deepFreeze(data);
	_memCache.delete(key);
	_memCache.set(key, frozen);
}

function getData(key) {
	if (_memCache.has(key)) {
		return _memCache.get(key);
	}
	let data = wx.getStorageSync(key);
	if (data === undefined || data === null || data === "" ||
		(Array.isArray(data) && data.length === 0)) {
		data = key === PRICE_KEY ? {} : [];
	}
	_memCache.set(key, data);
	return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/storageFreeze.test.js`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add utils/storageCore/core.js tests/storageFreeze.test.js
git commit -m "perf: move freeze from getData to saveData to avoid redundant O(n) re-freeze"
```


---

## Task 2: Transaction index module

**Files:**
- Create: `utils/models/transactionIndex.js`
- Create: `tests/transactionIndex.test.js`

- [ ] **Step 1: Write failing tests for the index**

Create `tests/transactionIndex.test.js`:

```javascript
let _mockStorage = {};

beforeEach(() => {
	_mockStorage = {};
	jest.clearAllMocks();
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value; }),
	};
});

describe("TransactionIndex", () => {
	let index;
	beforeEach(() => { index = require("../utils/models/transactionIndex"); });

	test("getByStockId returns only transactions for that stockId", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2026-01-01" },
			{ id: 2, stockId: 20, date: "2026-01-02" },
			{ id: 3, stockId: 10, date: "2026-01-03" },
		];
		const result = index.getByStockId(10);
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id).sort()).toEqual([1, 3]);
	});

	test("getByStockId returns transactions sorted by date descending", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2026-01-01" },
			{ id: 3, stockId: 10, date: "2026-01-03" },
			{ id: 2, stockId: 10, date: "2026-01-02" },
		];
		const result = index.getByStockId(10);
		expect(result.map((t) => t.date)).toEqual(["2026-01-03", "2026-01-02", "2026-01-01"]);
	});

	test("getByStockId returns empty array for unknown stockId", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		expect(index.getByStockId(999)).toEqual([]);
	});

	test("index rebuilds after invalidate()", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		index.getByStockId(10);
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }, { id: 2, stockId: 10 }];
		index.invalidate();
		const result = index.getByStockId(10);
		expect(result).toHaveLength(2);
	});

	test("index caches result between calls (no rebuild without invalidate)", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		index.getByStockId(10);
		_mockStorage["stock_trade_transactions"] = [{ id: 99, stockId: 10 }];
		const result = index.getByStockId(10);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/transactionIndex.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement transactionIndex.js**

Create `utils/models/transactionIndex.js`:

```javascript
const _byStockId = new Map();
let _built = false;

function _ensureBuilt() {
	if (_built) return;
	const txList = require("./transaction");
	const all = txList.getAll();
	const byStockId = new Map();
	all.forEach((t) => {
		if (!byStockId.has(t.stockId)) byStockId.set(t.stockId, []);
		byStockId.get(t.stockId).push(t);
	});
	byStockId.forEach((list) => {
		list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
	});
	_byStockId.clear();
	byStockId.forEach((v, k) => _byStockId.set(k, v));
	_built = true;
}

function getByStockId(stockId) {
	_ensureBuilt();
	const list = _byStockId.get(stockId);
	return list ? list.slice() : [];
}

function invalidate() {
	_built = false;
	_byStockId.clear();
}

module.exports = { getByStockId, invalidate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/transactionIndex.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add utils/models/transactionIndex.js tests/transactionIndex.test.js
git commit -m "feat: add lazy-rebuilt Transaction index for O(1) getByStockId"
```


---

## Task 3: Wire index into transaction.js, positionService.js, detail.js

**Files:**
- Modify: `utils/models/transaction.js:50-93`
- Modify: `utils/services/positionService.js:22-34`
- Modify: `packageDetail/pages/detail/detail.js:80-101`

- [ ] **Step 1: Add invalidate() calls to transaction.js write methods**

In `utils/models/transaction.js`, modify the three write methods (lazy require to avoid circular dependency):

In `save(transaction)` (line 51-55):
```javascript
save(transaction) {
    const result = upsertAndSave(TRANSACTION_KEY, transaction);
    markDataDirty(["position", "heatmap", "periodStats"], transaction.stockId);
    require("./transactionIndex").invalidate();
    return result;
},
```

In `delete(id)` (line 81-83):
```javascript
delete(id) {
    deleteAndSave(TRANSACTION_KEY, id, ["position", "heatmap", "periodStats"]);
    require("./transactionIndex").invalidate();
},
```

In `deleteByStockId(stockId)` (line 89-93):
```javascript
deleteByStockId(stockId) {
    const transactions = this.getAll().filter((t) => t.stockId !== stockId);
    saveData(TRANSACTION_KEY, transactions);
    markDataDirty(["position", "heatmap", "periodStats"], stockId);
    require("./transactionIndex").invalidate();
},
```

- [ ] **Step 2: Use index in positionService.calculatePosition**

In `utils/services/positionService.js`, add a require at the top (after line 15):

```javascript
const TransactionIndex = require("../models/transactionIndex");
```

Change `calculatePosition` (lines 22-34) from `Transaction.getByStockId(stockId)` to `TransactionIndex.getByStockId(stockId)`.

- [ ] **Step 3: Refactor detail.js to use index and avoid double calculation**

In `packageDetail/pages/detail/detail.js`, add requires near the top (after line 14):

```javascript
const TransactionIndex = require("../../../utils/models/transactionIndex");
const { calcPosition } = require("../../../utils/helpers/positionCalculator");
```

Replace lines 89-95:
```javascript
		const position = calculatePosition(stock.id);
		const rawTransactions = Transaction.getByStockId(stock.id);
```
with:
```javascript
		const rawTransactions = TransactionIndex.getByStockId(stock.id);
		const rawDividends = Dividend.getByStockId(stock.id);
		const currentPrice = PriceCache.get(stock.id);
		const position = calcPosition(stock.id, rawTransactions, rawDividends, currentPrice);
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Manual verification in WeChat DevTools**

1. Open the app, navigate to a stock detail page — verify transactions display correctly.
2. Add a buy transaction via the record page — return to detail — verify the new transaction appears.
3. Delete a transaction from detail — verify it disappears and the index updated.
4. Check console for no errors.

- [ ] **Step 6: Commit**

```bash
git add utils/models/transaction.js utils/services/positionService.js packageDetail/pages/detail/detail.js
git commit -m "perf: wire Transaction index into write paths and detail page queries"
```


---

## Task 4: Homepage incremental summary + market precompute

**Files:**
- Modify: `pages/index/index.js:576-662,432-492`

- [ ] **Step 1: Add _updateSummaryIncremental method**

In `pages/index/index.js`, add a new method after `_updateSummary` (after line 418):

```javascript
	// Incremental summary update: only recompute contribution from stocks whose price changed
	_updateSummaryIncremental(priceResults) {
		const rates = this.data._rates || { usdToCny: 1, hkdToCny: 1 };
		let addedMarketValue = 0, addedPnL = 0;
		priceResults.forEach((r) => {
			const idx = this._allIndexById ? this._allIndexById.get(r.stockId) : undefined;
			const pos = idx != null && this._allPositionsCache ? this._allPositionsCache[idx] : null;
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
	},
```

- [ ] **Step 2: Wire incremental update into _fetchPrices**

In `_fetchPrices` (line 638-642), change `this._updateSummary();` to `this._updateSummaryIncremental(validResults);`.

- [ ] **Step 3: Add market aggregation cache computation in _loadData**

In `_loadData`, after the `formattedPositions` map (after line 287, before line 289 `const updatedTabs`), insert:

```javascript
				// Precompute per-market aggregates for fast tab switching
				const marketAgg = {};
				let totalMV = 0, totalPnL = 0;
				formattedPositions.forEach((p) => {
					const rate = _getRate(p.market, rates);
					if (!marketAgg[p.market]) marketAgg[p.market] = { marketValue: 0, pnl: 0 };
					if (p.currentPrice) {
						marketAgg[p.market].marketValue += p.currentPrice * p.quantity * rate;
						totalMV += p.currentPrice * p.quantity * rate;
					}
					const pnl = ((p.floatingPnL || 0) + (p.realizedPnL || 0) + (p.dividendIncome || 0)) * rate;
					marketAgg[p.market].pnl += pnl;
					totalPnL += pnl;
				});
				marketAgg[null] = {
					marketValue: parseFloat(totalMV.toFixed(2)),
					pnl: parseFloat(totalPnL.toFixed(2)),
				};
				this._marketAggCache = marketAgg;
```

- [ ] **Step 4: Rewrite onMarketTabChange to use cache**

Replace `onMarketTabChange` (lines 432-492) with:

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
			const agg = this._marketAggCache[key] || this._marketAggCache[null];
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
	},
```

- [ ] **Step 5: Manual verification in WeChat DevTools**

1. Open index page with multiple stocks across A/HK/US markets.
2. Pull-to-refresh — verify summary updates correctly.
3. Switch between market tabs — verify values match and switching is instant.
4. Check console for no errors.

- [ ] **Step 6: Commit**

```bash
git add pages/index/index.js
git commit -m "perf: incremental summary update + market tab pre-aggregation on homepage"
```


---

## Task 5: History page formatting cache

**Files:**
- Modify: `pages/history/history.js:50-62,203-211`

- [ ] **Step 1: Add _dataDirty tracking**

In `pages/history/history.js`, modify `onShow` (lines 55-62) from:
```javascript
onShow() {
    if (pageMixin.onShowMixin(this, 1) || !this._allGroupedHistory) {
        this.loadHistory();
    }
    if (!this.data.entranceDone) {
        this.setData({ entranceDone: true });
    }
},
```
to:
```javascript
onShow() {
    const wasDirty = pageMixin.onShowMixin(this, 1);
    this._dataDirty = wasDirty;
    if (wasDirty || !this._allGroupedHistory) {
        this.loadHistory();
    }
    if (!this.data.entranceDone) {
        this.setData({ entranceDone: true });
    }
},
```

- [ ] **Step 2: Skip _buildAllRecords when data is clean**

Modify `loadHistory` (lines 203-211) from:
```javascript
loadHistory() {
    this._buildAllRecords();
    this.setData({
        activeStrategies: Strategy.getUsedStrategies(),
        loading: false,
        recordExists: this._cachedAllRecords && this._cachedAllRecords.length > 0,
    });
    this._applyFilters();
},
```
to:
```javascript
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
},
```

- [ ] **Step 3: Manual verification in WeChat DevTools**

1. Open history page — verify records load.
2. Switch filter tabs (全部/买入/卖出/分红) — verify no full rebuild.
3. Add a transaction — return to history — verify new record appears.
4. Check console for no errors.

- [ ] **Step 4: Commit**

```bash
git add pages/history/history.js
git commit -m "perf: cache formatted history records, skip rebuild when data clean"
```


---

## Task 6: Stats page dedup + merge

**Files:**
- Modify: `pages/stats/stats.js:80-175,181-326`

- [ ] **Step 1: Add requires and _computeAllPositions**

In `pages/stats/stats.js`, add requires near the top (after line 12):

```javascript
const { batchCalcPositions } = require("../../utils/helpers/positionCalculator");
const PriceCache = require("../../utils/models/priceCache");
```

Add a new method after `_calcPeriodStats` (after line 78):

```javascript
	_computeAllPositions() {
		const stocks = Stock.getAll();
		const stockIds = stocks.map((s) => s.id);
		const allTransactions = Transaction.getAll();
		const allDividends = Dividend.getAll();
		const positions = batchCalcPositions(stockIds, allTransactions, allDividends, (id) => PriceCache.get(id));
		this._positionsCache = positions;
		return positions;
	},
```

- [ ] **Step 2: Add _buildTradeListAndCleared method**

Add after `_computeAllPositions`:

```javascript
	_buildTradeListAndCleared() {
		const positions = this._computeAllPositions();
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
	},
```

- [ ] **Step 3: Refactor loadStats to use merged method**

Replace `loadStats` (lines 155-175) with:

```javascript
	async loadStats() {
		try {
			const period = this.data.currentPeriod;
			const { stats, detailItems } = await this._calcPeriodStats(period);
			const { completeTrades, clearedPositions } = this._buildTradeListAndCleared();
			this.setData({ stats, detailItems, completeTrades, clearedPositions, loading: false });
		} catch (err) {
			console.error("[stats] loadStats error:", err);
			this.setData({ loading: false });
			wx.showToast({ title: "数据加载失败", icon: "none" });
		}
	},
```

- [ ] **Step 4: Simplify onOpenAnnualReport to reuse _computeAllPositions**

In `onOpenAnnualReport` (line 242-248), replace the calls to `getClearedPositions()` and `getPositionSummary()` with:

```javascript
		const positions = this._computeAllPositions();
		const cleared = Object.values(positions).filter(
			(p) => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01)
		);
		const allPositions = Object.values(positions).filter((p) => p.quantity > 0)
			.concat(cleared.map((p) => Object.assign({}, p, { floatingPnL: 0 })));
```

Update the `winCount` calculation to use `cleared` and `stockPnL` loop to use `allPositions`.

- [ ] **Step 5: Manual verification in WeChat DevTools**

1. Open stats page — verify stats, trade list, cleared positions load.
2. Switch period tabs (week/month/year) — verify switching works.
3. Open annual report — verify all data matches previous behavior.
4. Check console for no errors.

- [ ] **Step 6: Commit**

```bash
git add pages/stats/stats.js
git commit -m "perf: dedupe stats page position calcs + merge trade/cleared build"
```


---

## Task 7: Entity factory _sortKey precomputation

**Files:**
- Modify: `utils/helpers/entityFactory.js:51-94,108-145`

- [ ] **Step 1: Add _sortKey to createTransaction**

In `utils/helpers/entityFactory.js`, change `createTransaction` return (lines 82-94) from:
```javascript
	return {
		id: id,
		stockId: stockId,
		type: type,
		price: parseFloat(price),
		quantity: qty,
		fee: feeNum,
		date: dateStr,
		note: note || "",
		reason: reason || "",
		strategies: Array.isArray(strategies) ? strategies : [],
	};
```
to:
```javascript
	return {
		id: id,
		stockId: stockId,
		type: type,
		price: parseFloat(price),
		quantity: qty,
		fee: feeNum,
		date: dateStr,
		note: note || "",
		reason: reason || "",
		strategies: Array.isArray(strategies) ? strategies : [],
		_sortKey: new Date(dateStr).getTime(),
	};
```

- [ ] **Step 2: Add _sortKey to createDividend**

Change `createDividend` return (lines 134-145) from:
```javascript
	return {
		id: id,
		stockId: stockId,
		perShareAmount: parseFloat(perShareAmount),
		quantity: qty,
		totalAmount: parseFloat(totalAmount.toFixed(2)),
		date: dateStr,
		note: note || "",
		type: divType,
		shareQuantity: shareQty,
	};
```
to:
```javascript
	return {
		id: id,
		stockId: stockId,
		perShareAmount: parseFloat(perShareAmount),
		quantity: qty,
		totalAmount: parseFloat(totalAmount.toFixed(2)),
		date: dateStr,
		note: note || "",
		type: divType,
		shareQuantity: shareQty,
		_sortKey: new Date(dateStr).getTime(),
	};
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — existing tests don't check _sortKey absence.

- [ ] **Step 4: Commit**

```bash
git add utils/helpers/entityFactory.js
git commit -m "feat: precompute _sortKey on transaction/dividend creation"
```


---

## Task 8: WXML swipe buttons conditional render

**Files:**
- Modify: `pages/index/index.wxml:75-90`

- [ ] **Step 1: Wrap swipe buttons in wx:if**

In `pages/index/index.wxml`, replace the swipe actions block (lines 75-90) from:
```xml
        <view class="swipe-actions {{item.swipeOpen ? 'swipe-actions-open' : ''}}">
          <view class="swipe-action-btn swipe-action-edit" data-stock-id="{{item.id}}" catchtap="onSwipeEdit">
            <view class="swipe-action-content">
              <text>编辑</text>
              <text class="swipe-action-sub">{{item.quantityText}}股</text>
            </view>
          </view>
          <view class="swipe-action-btn swipe-action-sell" data-stock-id="{{item.id}}" catchtap="onSwipeSell">
            <view class="swipe-action-content">
              <text>卖出</text>
              <text wx:if="{{item.quantity > 0}}" class="swipe-action-sub">可卖{{item.quantityText}}</text>
            </view>
          </view>
          <view class="swipe-action-btn swipe-action-delete" data-stock-id="{{item.id}}" catchtap="onSwipeDelete">删除</view>
        </view>
```
to:
```xml
        <view class="swipe-actions {{item.swipeOpen ? 'swipe-actions-open' : ''}}">
          <view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-edit" data-stock-id="{{item.id}}" catchtap="onSwipeEdit">
            <view class="swipe-action-content">
              <text>编辑</text>
              <text class="swipe-action-sub">{{item.quantityText}}股</text>
            </view>
          </view>
          <view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-sell" data-stock-id="{{item.id}}" catchtap="onSwipeSell">
            <view class="swipe-action-content">
              <text>卖出</text>
              <text wx:if="{{item.quantity > 0}}" class="swipe-action-sub">可卖{{item.quantityText}}</text>
            </view>
          </view>
          <view wx:if="{{item.swipeOpen}}" class="swipe-action-btn swipe-action-delete" data-stock-id="{{item.id}}" catchtap="onSwipeDelete">删除</view>
        </view>
```

- [ ] **Step 2: Manual verification in WeChat DevTools**

1. Open index page with positions.
2. Swipe a card left — verify buttons appear.
3. Swipe back — verify buttons disappear from DOM (use DOM inspector).
4. Check console for no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/index/index.wxml
git commit -m "perf: conditionally render swipe action buttons only when open"
```


---

## Self-Review Checklist

After all tasks, verify:

- [ ] **Spec coverage:** Each spec section (1-6) maps to tasks:
  - §1 freeze fix → Task 1 ✓
  - §2 Transaction index → Tasks 2, 3 ✓
  - §3 Homepage incremental + market precompute → Task 4 ✓
  - §4 History cache → Task 5 ✓
  - §5 Stats dedup + merge → Task 6 ✓
  - §6 WXML + Date precompute → Tasks 7, 8 ✓
- [ ] **No placeholders:** All steps have concrete code/commands — no TBDs.
- [ ] **Type consistency:** Method names match across tasks (`_computeAllPositions`, `_buildTradeListAndCleared`, `_updateSummaryIncremental`).
- [ ] **Verification:** Manual verification steps included for page-level changes; unit tests for pure logic.

---

## Final Verification

After all tasks complete:

1. Run `npm test` — all tests pass.
2. Open WeChat DevTools, manually verify:
   - [ ] Index: positions display, price refresh, market tab switch, pull-to-refresh
   - [ ] Detail: load, edit position, delete transaction
   - [ ] History: load, filter, search, load more, batch select/delete
   - [ ] Stats: load, switch period, open annual report, clear data
   - [ ] Record: add/edit/delete BUY/SELL/DIVIDEND
   - [ ] Share: canvas on-demand mount works
3. Check console for errors/warnings.
4. Compare performance: stats page load should be noticeably faster (single batchCalc instead of double).

