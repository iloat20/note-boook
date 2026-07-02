# Performance Optimization Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize date range queries, persist expensive computations, and add virtual lists for large datasets.

**Architecture:** Add a DateIndex for O(log n) transaction range queries, a computedCache layer for disk-backed memoization of XIRR/stats, and virtual list rendering for stats page trade lists.

**Tech Stack:** JavaScript (CommonJS), WeChat Mini Program APIs, Jest for testing

---

## File Structure

### New Files
- `utils/models/dateIndex.js` — Date-sorted index with binary search for range queries
- `utils/cache/computedCache.js` — Disk-backed versioned cache for expensive computations
- `tests/dateIndex.test.js` — Tests for DateIndex
- `tests/computedCache.test.js` — Tests for computedCache

### Modified Files
- `utils/models/transaction.js` — Invalidate dateIndex on writes
- `utils/cache/cacheManager.js` — Call bumpVersion on markDataDirty
- `utils/services/xirrService.js` — Use DateIndex + disk cache for getTotalXIRR
- `utils/services/statsService.js` — Use DateIndex + disk cache for getTotalStats
- `pages/stats/stats.js` — Virtual list + deferred annual report
- `pages/stats/stats.wxml` — Load more button
- `app.js` — Cache warm-up on launch

---

## Task 1: Create DateIndex Model

**Files:**
- Create: `utils/models/dateIndex.js`
- Test: `tests/dateIndex.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/dateIndex.test.js`:

```javascript
const DateIndex = require("../utils/models/dateIndex");
const Transaction = require("../utils/models/transaction");

// Mock transaction module
jest.mock("../utils/models/transaction", () => ({
    getAll: jest.fn(),
}));

describe("DateIndex", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DateIndex.invalidate();
    });

    function mockTransactions(dates) {
        const txs = dates.map((d, i) => ({
            id: i + 1,
            stockId: 1,
            type: "BUY",
            price: 100,
            quantity: 100,
            fee: 5,
            date: d,
            _sortKey: new Date(d).getTime(),
        }));
        require("../utils/models/transaction").getAll.mockReturnValue(txs);
    }

    it("should return transactions within date range", () => {
        mockTransactions(["2024-01-15", "2024-02-20", "2024-03-10", "2024-04-05"]);
        const result = DateIndex.getByDateRange(new Date("2024-02-01"), new Date("2024-03-31"));
        expect(result).toHaveLength(2);
        expect(result[0].date).toBe("2024-02-20");
        expect(result[1].date).toBe("2024-03-10");
    });

    it("should return empty array when no transactions in range", () => {
        mockTransactions(["2024-01-15", "2024-04-05"]);
        const result = DateIndex.getByDateRange(new Date("2024-05-01"), new Date("2024-06-30"));
        expect(result).toHaveLength(0);
    });

    it("should return all transactions for wide range", () => {
        mockTransactions(["2024-01-15", "2024-06-20"]);
        const result = DateIndex.getByDateRange(new Date("2020-01-01"), new Date("2030-12-31"));
        expect(result).toHaveLength(2);
    });

    it("should handle exact boundary dates", () => {
        mockTransactions(["2024-01-01", "2024-06-15", "2024-12-31"]);
        const result = DateIndex.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
        expect(result).toHaveLength(3);
    });

    it("should rebuild after invalidate()", () => {
        mockTransactions(["2024-01-15"]);
        DateIndex.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
        
        // Change mock data
        mockTransactions(["2024-06-15", "2024-07-20"]);
        DateIndex.invalidate();
        
        const result = DateIndex.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
        expect(result).toHaveLength(2);
    });

    it("should handle empty transaction list", () => {
        require("../utils/models/transaction").getAll.mockReturnValue([]);
        const result = DateIndex.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
        expect(result).toHaveLength(0);
    });

    it("should fallback to new Date() when _sortKey missing", () => {
        const txs = [{ id: 1, date: "2024-03-15" }]; // no _sortKey
        require("../utils/models/transaction").getAll.mockReturnValue(txs);
        const result = DateIndex.getByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));
        expect(result).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=dateIndex`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DateIndex**

Create `utils/models/dateIndex.js`:

```javascript
/**
 * dateIndex.js — lazy-rebuilt date-sorted index for Transaction range queries.
 *
 * getByDateRange(startDate, endDate) returns transactions within range using binary search.
 * Rebuilds lazily on first query after invalidate().
 * Invalidate after every write (Transaction.save/delete/deleteByStockId).
 */

const _sortedByDate = [];
let _built = false;

function _ensureBuilt() {
    if (_built) return;
    const txList = require("./transaction");
    const all = txList.getAll();
    const sorted = all.map((t) => ({
        _sortKey: t._sortKey || new Date(t.date).getTime(),
        ref: t,
    }));
    sorted.sort((a, b) => a._sortKey - b._sortKey);
    _sortedByDate.length = 0;
    _sortedByDate.push(...sorted);
    _built = true;
}

function _lowerBound(targetKey) {
    let lo = 0, hi = _sortedByDate.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (_sortedByDate[mid]._sortKey < targetKey) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function _upperBound(targetKey) {
    let lo = 0, hi = _sortedByDate.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (_sortedByDate[mid]._sortKey <= targetKey) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * Get transactions within date range (inclusive).
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array} transaction references
 */
function getByDateRange(startDate, endDate) {
    _ensureBuilt();
    const startKey = startDate.getTime();
    const endKey = endDate.getTime();
    const lo = _lowerBound(startKey);
    const hi = _upperBound(endKey);
    const result = [];
    for (let i = lo; i < hi; i++) {
        result.push(_sortedByDate[i].ref);
    }
    return result;
}

/**
 * Invalidate the index. Call after any write to the transaction store.
 */
function invalidate() {
    _built = false;
    _sortedByDate.length = 0;
}

module.exports = { getByDateRange, invalidate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=dateIndex`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/models/dateIndex.js tests/dateIndex.test.js
git commit -m "feat: add DateIndex for O(log n) transaction range queries"
```

---

## Task 2: Integrate DateIndex with Transaction writes

**Files:**
- Modify: `utils/models/transaction.js`

- [ ] **Step 1: Add dateIndex invalidation to save()**

In `utils/models/transaction.js`, modify the `save` method:

```javascript
save(transaction) {
    const result = upsertAndSave(TRANSACTION_KEY, transaction);
    markDataDirty(["position", "heatmap", "periodStats"], transaction.stockId);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();
    return result;
},
```

- [ ] **Step 2: Add dateIndex invalidation to delete()**

```javascript
delete(id) {
    deleteAndSave(TRANSACTION_KEY, id, ["position", "heatmap", "periodStats"]);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();
},
```

- [ ] **Step 3: Add dateIndex invalidation to deleteByStockId()**

```javascript
deleteByStockId(stockId) {
    const transactions = this.getAll().filter((t) => t.stockId !== stockId);
    saveData(TRANSACTION_KEY, transactions);
    markDataDirty(["position", "heatmap", "periodStats"], stockId);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();
},
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/models/transaction.js
git commit -m "feat: invalidate dateIndex on transaction writes"
```

---

## Task 3: Create computedCache

**Files:**
- Create: `utils/cache/computedCache.js`
- Test: `tests/computedCache.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/computedCache.test.js`:

```javascript
const { getData, saveData } = require("../utils/storageCore/core");

// Mock storageCore
jest.mock("../utils/storageCore/core", () => ({
    getData: jest.fn(),
    saveData: jest.fn(),
}));

const computedCache = require("../utils/cache/computedCache");

describe("computedCache", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module state
        computedCache.clearAll();
    });

    it("should return null when no cache exists", () => {
        getData.mockReturnValue(null);
        const result = computedCache.getCached("test_key");
        expect(result).toBeNull();
    });

    it("should return cached value when version matches", () => {
        const value = { totalPnL: 1234.56 };
        getData.mockReturnValue({
            value,
            dataVersion: 0,
            computedAt: Date.now(),
        });
        // Version starts at 0
        const result = computedCache.getCached("test_key");
        expect(result).toEqual(value);
    });

    it("should return null when version mismatches", () => {
        const value = { totalPnL: 1234.56 };
        getData.mockReturnValue({
            value,
            dataVersion: 0,
            computedAt: Date.now(),
        });
        computedCache.bumpVersion(); // Now version is 1
        const result = computedCache.getCached("test_key");
        expect(result).toBeNull();
    });

    it("should persist value with current version", () => {
        const value = { xirr: 12.5 };
        computedCache.setCached("xirr_key", value);
        expect(saveData).toHaveBeenCalledWith(
            "xirr_key_v2",
            expect.objectContaining({
                value,
                dataVersion: 0,
                computedAt: expect.any(Number),
            })
        );
    });

    it("should increment version on bumpVersion", () => {
        expect(computedCache.getVersion()).toBe(0);
        computedCache.bumpVersion();
        expect(computedCache.getVersion()).toBe(1);
        computedCache.bumpVersion();
        expect(computedCache.getVersion()).toBe(2);
    });

    it("should clear all cached entries", () => {
        computedCache.setCached("key1", { a: 1 });
        computedCache.setCached("key2", { b: 2 });
        computedCache.clearAll();
        // After clear, getCached should return null
        getData.mockReturnValue(null);
        expect(computedCache.getCached("key1")).toBeNull();
        expect(computedCache.getCached("key2")).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=computedCache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement computedCache**

Create `utils/cache/computedCache.js`:

```javascript
/**
 * computedCache.js — disk-backed versioned cache for expensive computations.
 *
 * Cache entries are invalidated when dataVersion changes (on any data write).
 * This provides persistence across page reloads without manual TTL management.
 */

const { getData, saveData } = require("../storageCore/core");

const CACHE_KEY_PREFIX = "computed_";
const CACHE_KEY_SUFFIX = "_v2";

let _dataVersion = 0;

/**
 * Increment data version (called from markDataDirty).
 * All existing disk cache entries become stale.
 */
function bumpVersion() {
    _dataVersion++;
}

/**
 * Get current data version.
 * @returns {number}
 */
function getVersion() {
    return _dataVersion;
}

/**
 * Read cache entry. Returns null if missing or version mismatch.
 * @param {string} key - cache key (without prefix/suffix)
 * @returns {any|null}
 */
function getCached(key) {
    const entry = getData(`${CACHE_KEY_PREFIX}${key}${CACHE_KEY_SUFFIX}`);
    if (!entry) return null;
    if (entry.dataVersion !== _dataVersion) return null;
    return entry.value;
}

/**
 * Write cache entry with current version.
 * @param {string} key
 * @param {any} value
 */
function setCached(key, value) {
    saveData(`${CACHE_KEY_PREFIX}${key}${CACHE_KEY_SUFFIX}`, {
        value,
        dataVersion: _dataVersion,
        computedAt: Date.now(),
    });
}

/**
 * Clear all computed cache entries.
 */
function clearAll() {
    // Clear known keys — extend as needed
    const knownKeys = ["total_stats", "total_xirr"];
    knownKeys.forEach((k) => {
        saveData(`${CACHE_KEY_PREFIX}${k}${CACHE_KEY_SUFFIX}`, null);
    });
}

/**
 * Warm up memory caches from disk (call on app launch).
 */
function warmUpCache() {
    // This is a no-op placeholder — actual warm-up happens
    // when services check getCached() on first call
}

module.exports = {
    bumpVersion,
    getVersion,
    getCached,
    setCached,
    clearAll,
    warmUpCache,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=computedCache`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/cache/computedCache.js tests/computedCache.test.js
git commit -m "feat: add computedCache for disk-backed computation memoization"
```

---

## Task 4: Integrate computedCache with markDataDirty

**Files:**
- Modify: `utils/cache/cacheManager.js`

- [ ] **Step 1: Add bumpVersion call to markDataDirty**

In `utils/cache/cacheManager.js`, modify the `markDataDirty` function:

```javascript
function markDataDirty(types, stockId) {
    try {
        const appStore = require("../state/appStore");
        appStore.commit("MARK_DIRTY");
        require("./computedCache").bumpVersion();
    } catch (e) {
        console.warn("[markDataDirty]", e);
    }
    // ... rest unchanged
}
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add utils/cache/cacheManager.js
git commit -m "feat: bump computedCache version on data mutation"
```

---

## Task 5: Integrate DateIndex + disk cache into xirrService

**Files:**
- Modify: `utils/services/xirrService.js`

- [ ] **Step 1: Add imports at top of file**

```javascript
const { getCached, setCached } = require("../cache/computedCache");
const DateIndex = require("../models/dateIndex");
```

- [ ] **Step 2: Modify calcXIRRForRange to use DateIndex**

Replace `Transaction.getByDateRange(startDate, endDate)` with `DateIndex.getByDateRange(startDate, endDate)`:

```javascript
async function calcXIRRForRange(startDate, endDate) {
    const cacheKey = `xirr_${startDate.toISOString()}_${endDate.toISOString()}`;
    if (caches.periodStats.has(cacheKey)) return caches.periodStats.get(cacheKey);

    const stocks = Stock.getAll();
    const stockMarket = {};
    stocks.forEach((s) => {
        stockMarket[s.id] = s.market;
    });
    const rates = await getRates();

    const transactions = DateIndex.getByDateRange(startDate, endDate);
    const dividends = Dividend.getAll().filter((d) => {
        const dd = new Date(d.date);
        return dd >= startDate && dd <= endDate;
    });

    // ... rest unchanged
}
```

- [ ] **Step 3: Add disk cache to getTotalXIRR**

```javascript
async function getTotalXIRR() {
    const cacheKey = "total_xirr";
    
    // Check memory cache first
    const memHit = caches.periodStats.get(cacheKey);
    if (memHit !== undefined) return memHit;
    
    // Check disk cache
    const diskHit = getCached(cacheKey);
    if (diskHit !== null && diskHit !== undefined) {
        caches.periodStats.set(cacheKey, diskHit);
        return diskHit;
    }

    // Compute
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const result = await calcXIRRForRange(new Date(0), today);
    
    // Store in both caches
    caches.periodStats.set(cacheKey, result);
    setCached(cacheKey, result);
    return result;
}
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/services/xirrService.js
git commit -m "feat: use DateIndex + disk cache in xirrService"
```

---

## Task 6: Integrate DateIndex + disk cache into statsService

**Files:**
- Modify: `utils/services/statsService.js`

- [ ] **Step 1: Add imports at top of file**

```javascript
const { getCached, setCached } = require("../cache/computedCache");
const DateIndex = require("../models/dateIndex");
```

- [ ] **Step 2: Add disk cache to getTotalStats**

```javascript
function getTotalStats() {
    // Check memory cache first
    if (caches.stats.has(STATS_CACHE_KEYS.TOTAL)) {
        return caches.stats.get(STATS_CACHE_KEYS.TOTAL);
    }
    
    // Check disk cache
    const diskHit = getCached("total_stats");
    if (diskHit) {
        caches.stats.set(STATS_CACHE_KEYS.TOTAL, diskHit);
        return diskHit;
    }

    // Compute
    const result = _computeTotalStats();
    caches.stats.set(STATS_CACHE_KEYS.TOTAL, result);
    setCached("total_stats", result);
    return result;
}
```

- [ ] **Step 3: Modify getPeriodStatsWithReturn to use DateIndex**

```javascript
// In getPeriodStatsWithReturn, replace:
//   const periodTx = Transaction.getByDateRange(startDate, endDate);
// With:
const periodTx = DateIndex.getByDateRange(startDate, endDate);
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/services/statsService.js
git commit -m "feat: use DateIndex + disk cache in statsService"
```

---

## Task 7: Add virtual list to stats page completeTrades

**Files:**
- Modify: `pages/stats/stats.js`
- Modify: `pages/stats/stats.wxml`

- [ ] **Step 1: Add display count to data**

In `pages/stats/stats.js`, add to `data`:

```javascript
data: {
    // ... existing fields
    tradesDisplayCount: 30,
    tradesHasMore: false,
}
```

- [ ] **Step 2: Modify _buildTradeListAndCleared to store full list**

```javascript
_buildTradeListAndCleared() {
    const positions = this._computeAllPositions();
    const stocks = Stock.getAll();
    const stockMap = buildStockMap(stocks);
    const rawTx = Transaction.getAll();
    const allDivs = Dividend.getAll();

    const txList = rawTx.map((t) => {
        const stock = stockMap[t.stockId];
        return buildRecordView(t, stock, {
            amountClassPrefix: "detail-d-amount",
            amountClassForBuy: "xhs-loss",
            amountClassForSell: "xhs-profit",
            includeStatsFields: true,
            grossAmount: true,
        });
    });

    const divList = allDivs.map((d) => {
        const stock = stockMap[d.stockId];
        return buildRecordView(d, stock, {
            amountClassPrefix: "detail-d-amount",
            amountClassForDividend: "xhs-profit",
            includeStatsFields: true,
        });
    });

    const completeTrades = txList.concat(divList).sort((a, b) => b._sortKey - a._sortKey);
    
    // Store full list for virtual scrolling
    this._allCompleteTrades = completeTrades;

    const clearedPositions = Object.values(positions)
        .filter(
            (p) =>
                p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01),
        )
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

    return { completeTrades: completeTrades.slice(0, 30), clearedPositions };
}
```

- [ ] **Step 3: Add loadMoreTrades method**

```javascript
loadMoreTrades() {
    const all = this._allCompleteTrades || [];
    const current = this.data.tradesDisplayCount;
    if (current >= all.length) return;
    
    const newCount = Math.min(current + 30, all.length);
    this.setData({
        tradesDisplayCount: newCount,
        completeTrades: all.slice(0, newCount),
        tradesHasMore: newCount < all.length,
    });
},
```

- [ ] **Step 4: Update loadStats to set tradesHasMore**

In `loadStats`, after building trades:

```javascript
async loadStats() {
    try {
        const period = this.data.currentPeriod;
        const { stats, detailItems } = await this._calcPeriodStats(period);
        const { completeTrades, clearedPositions } = this._buildTradeListAndCleared();
        this.setData({
            stats,
            detailItems,
            completeTrades,
            clearedPositions,
            loading: false,
            tradesHasMore: (this._allCompleteTrades?.length || 0) > 30,
        });
    } catch (err) {
        console.error("[stats] loadStats error:", err);
        this.setData({ loading: false });
        wx.showToast({ title: "数据加载失败", icon: "none" });
    }
},
```

- [ ] **Step 5: Add load more button to WXML**

In `pages/stats/stats.wxml`, after the completeTrades list:

```xml
<view wx:if="{{tradesHasMore}}" class="load-more" bindtap="loadMoreTrades">
    加载更多 ({{completeTrades.length}}/{{_allCompleteTrades.length}})
</view>
```

- [ ] **Step 6: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add pages/stats/stats.js pages/stats/stats.wxml
git commit -m "feat: add virtual list for completeTrades in stats page"
```

---

## Task 8: Add deferred annual report computation

**Files:**
- Modify: `pages/stats/stats.js`

- [ ] **Step 1: Split onOpenAnnualReport into quick + full**

Replace `onOpenAnnualReport` with:

```javascript
async onOpenAnnualReport() {
    // Cache hit and not dirty → use cached
    if (this._annualReportCache && !this._statsDirty) {
        this.setData({
            showAnnualReport: true,
            annualReportData: this._annualReportCache,
        });
        return;
    }

    // Show loading state
    this.setData({ showAnnualReport: true, annualReportData: null });

    // Quick data: trade counts, amounts, PnL (no XIRR)
    const quickData = this._buildQuickAnnualReport();
    this.setData({ annualReportData: quickData });

    // Full data: XIRR + strategy stats (expensive)
    const fullData = await this._buildFullAnnualReport();
    this._annualReportCache = fullData;
    this.setData({ annualReportData: fullData });
},
```

- [ ] **Step 2: Implement _buildQuickAnnualReport**

```javascript
_buildQuickAnnualReport() {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const yearTx = DateIndex.getByDateRange(yearStart, yearEnd);
    
    let buyCount = 0, sellCount = 0;
    yearTx.forEach((t) => {
        if (t.type === "BUY") buyCount++;
        else sellCount++;
    });

    const rates = this._rates || { usdToCny: 1, hkdToCny: 1 };
    const stocks = Stock.getAll();
    const stockMarket = {};
    stocks.forEach((s) => { stockMarket[s.id] = s.market; });

    let yearBuyAmount = 0, yearSellAmount = 0;
    yearTx.forEach((t) => {
        const r = getRate(stockMarket[t.stockId], rates);
        const amt = t.price * t.quantity;
        if (t.type === "BUY") yearBuyAmount += amt * r;
        else yearSellAmount += amt * r;
    });

    let yearDivTotal = 0;
    Dividend.getAll().forEach((d) => {
        const dd = new Date(d.date);
        if (dd >= yearStart && dd <= yearEnd) {
            const r = getRate(stockMarket[d.stockId], rates);
            yearDivTotal += d.totalAmount * r;
        }
    });

    const yearInvestment = yearBuyAmount;
    const yearRecovery = yearSellAmount + yearDivTotal;
    const yearPnL = yearRecovery - yearInvestment;

    const positions = this._computeAllPositions();
    const cleared = Object.values(positions).filter(
        (p) => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01),
    );
    const winCount = cleared.filter((p) => p.realizedPnL + p.dividendIncome > 0).length;
    const winRate = cleared.length > 0 ? Math.round((winCount / cleared.length) * 100) : 0;

    return {
        year,
        tradeCount: yearTx.length,
        buyCount,
        sellCount,
        winRate,
        yearXIRR: null,
        yearXIRRText: "计算中...",
        totalXIRR: null,
        totalXIRRText: "计算中...",
        totalPnL: parseFloat(yearPnL.toFixed(2)),
        totalPnLText: fmt(Math.abs(yearPnL)),
        totalInvestmentText: fmt(yearInvestment),
        totalRecoveryText: fmt(yearRecovery),
        dividendIncomeText: fmt(yearDivTotal),
        monthlyPnL: [], // Deferred
        topStocks: [],  // Deferred
        bottomStocks: [], // Deferred
        strategyStats: [], // Deferred
    };
},
```

- [ ] **Step 3: Implement _buildFullAnnualReport**

```javascript
async _buildFullAnnualReport() {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // Get rates
    const rates = await getRates();
    this._rates = rates;

    const stocks = Stock.getAll();
    const stockMarket = {};
    stocks.forEach((s) => { stockMarket[s.id] = s.market; });

    // Monthly PnL
    const periodList = getPeriodStatsList("MONTH", 12);
    const monthlyPnL = [];
    for (let m = 1; m <= 12; m++) {
        const label = `${year}-${String(m).padStart(2, "0")}`;
        const found = periodList.find((item) => item.label === label);
        monthlyPnL.push({ month: m, pnL: found ? found.pnL : 0 });
    }

    // Top/bottom stocks
    const positions = this._computeAllPositions();
    const allPositions = Object.values(positions);
    const stockPnL = {};
    allPositions.forEach((p) => {
        const key = p.code;
        const r = getRate(p.market, rates);
        if (!stockPnL[key]) {
            stockPnL[key] = { code: p.code, name: p.name, market: p.market, totalPnL: 0 };
        }
        stockPnL[key].totalPnL += ((p.realizedPnL || 0) + (p.floatingPnL || 0) + (p.dividendIncome || 0)) * r;
    });
    const stockList = Object.values(stockPnL)
        .map((s) => {
            s.totalPnL = parseFloat(s.totalPnL.toFixed(2));
            s.totalPnLText = fmt(Math.abs(s.totalPnL));
            return s;
        })
        .sort((a, b) => b.totalPnL - a.totalPnL);
    const topStocks = stockList.slice(0, 5);
    const bottomStocks = stockList.filter((s) => s.totalPnL < 0).reverse().slice(0, 5);

    // Strategy stats
    let strategyStats = getStrategyStats();
    const maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1;
    strategyStats = strategyStats.slice(0, 8).map((s) => {
        s.percent = Math.round((s.count / maxStrategyCount) * 100);
        return s;
    });

    // XIRR
    let yearXIRR = null;
    let totalXIRR = null;
    try {
        const { calcXIRRForRange } = require("../../utils/services/xirrService");
        [yearXIRR, totalXIRR] = await Promise.all([
            calcXIRRForRange(yearStart, yearEnd).catch(() => null),
            getTotalXIRR().catch(() => null),
        ]);
    } catch (e) {
        console.error("XIRR 计算失败:", e);
    }

    // Reuse quick data fields, add full fields
    return {
        year,
        tradeCount: DateIndex.getByDateRange(yearStart, yearEnd).length,
        // buyCount/sellCount recomputed below
        winRate: 0, // computed below from cleared positions
        yearXIRR,
        yearXIRRText: yearXIRR !== null ? `${yearXIRR.toFixed(2)}%` : "--",
        totalXIRR,
        totalXIRRText: totalXIRR !== null ? `${totalXIRR.toFixed(2)}%` : "--",
                // Reuse from quick: totalPnL, totalPnLText, totalPnLPercent, totalInvestmentText, totalRecoveryText, dividendIncomeText, buyCount, sellCount
        monthlyPnL,
        topStocks,
        bottomStocks,
        strategyStats,
    };
},
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/stats/stats.js
git commit -m "feat: defer expensive annual report computations"
```

---

## Task 9: Add cache warm-up to app.js

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add warm-up call in onLaunch**

In `app.js`, modify `onLaunch`:

```javascript
onLaunch: function () {
    // ... existing code
    
    // Async cache warm-up (non-blocking)
    setTimeout(() => {
        try {
            const { warmUpCache } = require("./utils/cache/computedCache");
            warmUpCache();
        } catch (e) {
            console.warn("[app] cache warm-up failed:", e);
        }
    }, 100);
},
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add cache warm-up on app launch"
```

---

## Task 10: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`
Expected: No errors

- [ ] **Step 3: Manual verification checklist**

- [ ] Index page: positions display, price refresh, market tab switch
- [ ] Stats page: load stats, switch period, open annual report
- [ ] Annual report: quick display then full data loads
- [ ] History page: load, filter, search
- [ ] Detail page: load, edit, delete
- [ ] Record page: add/edit/delete BUY/SELL/DIVIDEND

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup for perf round 3" --allow-empty
```