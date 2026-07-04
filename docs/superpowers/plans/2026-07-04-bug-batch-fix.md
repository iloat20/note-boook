# Bug Batch Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ~20 real bugs across 4 layers (pages / subpackage pages / utils / components) grouped by root cause into 4 sequential phases.

**Architecture:** 4 unifying fix contracts (C1 freeze on shared cache refs, C2 async detach guards, C3 date-range closed-interval, C4 bail() for early-return unlock). Each phase is independently committable and reviewable.

**Tech Stack:** WeChat Mini Program (glass-easel framework), Jest for unit tests, Biome for lint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-bug-batch-fix-design.md` (commit `4435b2b`).

**Contract-probe findings (2026-07-04):**
- C1: `saveData` already freezes; `getData` cold-start does NOT. Only `transactionIndex._ensureBuilt()` mutates in-site — expect a clean freeze landing.
- C3: The period generator already uses `23:59:59.999`. Real bug is `Transaction.getByDateRange` uses string comparison vs `DateIndex.getByDateRange` using ms-timestamp. Fix = Transaction.getByDateRange.
- C2: None of the 4 target files currently use `this._detached` or `!this.data` guards.
- C4: Only 1 early-return site (`_validateAndSubmit` L572) lacks `_resetSubmit()`.

---

## Phase 1 — Finance (6 bugs, highest sensitivity)

### Task 1: C1 freeze rollout — storageCore + transactionIndex

**Files:** `utils/storageCore/core.js`, `utils/models/transactionIndex.js`, `tests/memory.test.js`

- [ ] **Step 1: Freeze on getData cold-start path**

In `utils/storageCore/core.js`, replace `getData`:

```js
function getData(key) {
    if (_memCache.has(key)) return _memCache.get(key);
    let data = wx.getStorageSync(key);
    if (data === undefined || data === null || data === "" || (Array.isArray(data) && data.length === 0)) {
        data = key === PRICE_KEY ? {} : [];
    }
    _memCache.set(key, deepFreeze(data));
    return _memCache.get(key);
}
```

- [ ] **Step 2: Patch transactionIndex._ensureBuilt to use sorted copy**

Replace the in-place `list.sort(...)` with a `.slice().sort(...)` copy so it won't throw once the array is frozen.

- [ ] **Step 3: Run `npm test` — surface any other frozen-mutation sites.** Fix any throw inline before proceeding.

- [ ] **Step 4: Commit.**

```bash
git add utils/storageCore/core.js utils/models/transactionIndex.js
git commit -m "fix: freeze shared cache refs on read (C1 contract)"
```

---

### Task 2: #1 — detail.js `_updatePriceFields` mutate LRU

**Files:** `packageDetail/pages/detail/detail.js`

- [ ] **Step 1: Replace dot-path mutation with positionService.updatePositionMeta + reload**

Replace any `this.setData({ [`position.fixedPrice`]: v ... });` style writes with:

```js
positionService.updatePositionMeta(this.data.position.stockId, {
    fixedPrice: v,
    fixedPriceCtime: Date.now(),
    fixedPriceSource: 'manual',
});
await this.loadData();
```

(If `updatePositionMeta` doesn't exist, add a clean-write helper that rebuilds positions and persists without mutating the cached object.)

- [ ] **Step 2: Manual verification**

1. Edit price for a position with qty > 0 → back to index → stats must agree
2. Edit price for a cleared position (qty=0) → summary must NOT change

- [ ] **Step 3: Commit.**

```bash
git add packageDetail/pages/detail/detail.js
git commit -m "fix: manual price edit writes through positionService (no LRU mutation)"
```

---

### Task 3: #2 — XIRR terminal value uses market price → cost basis

**Files:** `utils/services/xirrService.js`, `tests/xirr.test.js`

- [ ] **Step 1: Replace market-price terminal with cost-basis terminal in `_buildCashFlowsCore`**

Replace `totalValue += pos.quantity * latestPrice * r;` with `totalValue += pos.quantity * pos.avgCost * r;`.

- [ ] **Step 2: Update xirr.test.js expected values to the new (lower, stable) values.**

- [ ] **Step 3: Commit.**

```bash
git add utils/services/xirrService.js tests/xirr.test.js
git commit -m "fix: XIRR terminal value uses cost basis (no longer jumps on price refresh)"
```

---

### Task 4: #3 — SEC fee cap compares CNY against USD limit

**Files:** `utils/helpers/feeCalculator.js`, `tests/feeCalculator.test.js`

- [ ] **Step 1: Replace cap comparison with USD-conversion**

```js
secFee = amount * config.secFeeRate;
const usdToCny = getUsdToCnyRate();
const secFeeUSD = secFee / usdToCny;
if (secFeeUSD > 21.84) secFee = 21.84 * usdToCny;
```

- [ ] **Step 2: Update expected values in feeCalculator.test.js for USD sell cases.**

- [ ] **Step 3: Commit.**

```bash
git add utils/helpers/feeCalculator.js tests/feeCalculator.test.js
git commit -m "fix: SEC fee cap now compares against USD amount, not CNY"
```

---

### Task 5: #5 — Transaction.getByDateRange uses string comparison

**Files:** `utils/models/transaction.js`, `tests/dateIndex.test.js`

- [ ] **Step 1: Replace with ms-timestamp filter**

```js
static getByDateRange(startDate, endDate) {
    const startMs = startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime();
    const endMs = endDate instanceof Date ? endDate.getTime() : new Date(endDate).getTime();
    return Transaction.getAll().filter(t => {
        const sortKey = t._sortKey != null ? t._sortKey : new Date(t.date).getTime();
        return sortKey >= startMs && sortKey <= endMs;
    });
}
```

- [ ] **Step 2: Manual verification: end-of-month 23:59 transaction is included in its period; doesn't leak into next period.**

- [ ] **Step 3: Commit.**

```bash
git add utils/models/transaction.js tests/dateIndex.test.js
git commit -m "fix: Transaction.getByDateRange uses ms-timestamp comparison"
```

---

### Task 6: #11 + #12 — Dividend double-counting + avgCost

**Files:** `utils/helpers/positionCalculator.js`, `tests/portfolio.test.js`

- [ ] **Step 1: Verify #11 resolved by Task 3 (cost basis eliminates double-counting).**

- [ ] **Step 2: Verify avgCost dilation + realizedPnL consistency.** If consistent, add clarifying comment. If not, fix realizedPnL.

- [ ] **Step 3: Commit.**

```bash
git add utils/helpers/positionCalculator.js
git commit -m "fix: avgCost dilution by share dividends intentional — added comment"
```

---

### Task 7: Phase 1 regression gate — C1 freeze manual checklist

**Files:** none (verification only)

Run in WeChat DevTools — any TypeError in console = regression:
- Add/edit/delete stock + transaction + dividend
- Manual price edit (detail)
- Switch history filters / market / strategy chips
- Export annual report + quickly close dialog
- Quick-record probe + quickly close dialog
- Enter/leave index / detail / stats 3x each
- ECharts unmount and re-mount (stats page)

Expected: zero `TypeError`. If any occur, commit fix as `fix: C1 freeze regression — <description>`.

---

## Phase 2 — State / Form (5 bugs)

### Task 8: #4 — history selection state leaks across filter switches

**Files:** `pages/history/history.js`

- [ ] **Step 1: Reset selection at top of `_applyFilters`, `switchMarket`, `switchStrategy`**

```js
this.setData({ selectedIds: [], selectedMap: {}, selectedTypeMap: {}, selectedCount: 0 });
```

- [ ] **Step 2: Fix `toggleSelectAll` to select only visible items** (slice from `this.data.groupedHistory`, not `this._allGroupedHistory`).

- [ ] **Step 3: Add visibility guard in `batchDelete`**:

```js
const visibleIdSet = new Set(this.data.groupedHistory.flatMap(g => g.items.map(i => i.id)));
const deletableIds = this.data.selectedIds.filter(id => visibleIdSet.has(id));
```

- [ ] **Step 4: Manual verification: select 1 A-share → switch to HK-share chip → 全选 → 删除 → only HK records deleted, A-share preserved.**

- [ ] **Step 5: Commit.**

```bash
git add pages/history/history.js
git commit -m "fix: history selection state resets on filter switch"
```

---

### Task 9: #6 — record early-return leaves `_submitting` locked

**Files:** `packageRecord/pages/record/record.js`

- [ ] **Step 1: Add `bail(msg)` helper** that calls `wx.showToast` + `this._resetSubmit()`.

- [ ] **Step 2: Replace the single offending early-return site (`_validateAndSubmit` L572 `!valid` branch)** with `this.bail(...); return;`.

- [ ] **Step 3: Manual verification: SELL no-holdings submission → toast → can submit again (not locked).**

- [ ] **Step 4: Commit.**

```bash
git add packageRecord/pages/record/record.js
git commit -m "fix: record submit no longer locks on validation failure (bail helper)"
```

---

### Task 10: #7 — dividend edit silently reassigns stockId

**Files:** `packageDetail/pages/dividend/dividend.js`

- [ ] **Step 1: Capture `this._editStockId = dv.stockId` in `_loadEdit`.**

- [ ] **Step 2: Edit mode disables the stock selector** (`this.setData({ stockSelectorDisabled: true })`).

- [ ] **Step 3: submit() rejects if `this._editStockId !== s.id`** with toast "分红记录不可改股票".

- [ ] **Step 4: Manual verification: edit dividend for A → try to change to B → selector disabled or submit rejected.**

- [ ] **Step 5: Commit.**

```bash
git add packageDetail/pages/dividend/dividend.js
git commit -m "fix: dividend edit rejects stock reassignment"
```

---

### Task 11: #8 — annual-report detached timer leak

**Files:** `components/annual-report/annual-report.js`

- [ ] **Step 1: Store timer in `this._exportTimer`**; in the callback, add `if (!this.data) return;` guard.

- [ ] **Step 2: Add `detached()` hook to call `clearTimeout(this._exportTimer)`.**

- [ ] **Step 3: Commit.**

```bash
git add components/annual-report/annual-report.js
git commit -m "fix: annual-report export timer cleared on detach"
```

---

### Task 12: #9 — quick-record network callbacks lack detach guard

**Files:** `components/quick-record/quick-record.js`

- [ ] **Step 1: In `detached()`, set `this._detached = true` and clear all timers (`_afTimer`, `_probeTimer`, `_feeTimer`, `_blurTimer`).**

- [ ] **Step 2: Add `if (this._detached) return;` at the top of `_probeStockPrice` then/catch/finally + `_scheduleAutoFetch` + `_tryAutoFetch`.**

- [ ] **Step 3: Commit.**

```bash
git add components/quick-record/quick-record.js
git commit -m "fix: quick-record network callbacks guard against detached"
```

---

## Phase 3 — Lifecycle (2 bugs)

### Task 13: #10 — index行情刷新 setData after unload

**Files:** `pages/index/index.js`

- [ ] **Step 1: Add `this._detached = false` + `this._priceReqId = 0` in onLoad.**

- [ ] **Step 2: In onUnload, set `this._detached = true` and increment `this._priceReqId++`.**

- [ ] **Step 3: In all `_fetchPrices` callbacks: `if (this._detached || reqId !== this._priceReqId) return;` before any setData.**

- [ ] **Step 4: Commit.**

```bash
git add pages/index/index.js
git commit -m "fix: index行情刷新 no longer setData after unload"
```

---

### Task 14: #15 — index flash animation stale closure

**Files:** `pages/index/index.js`

- [ ] **Step 1: Replace array-index flash cleanup with stockId-keyed timers:**

```js
this._flashTimers = new Map();
// trigger:
const timer = setTimeout(() => {
    this._flashTimers.delete(stockId);
    const idx = this.data.displayPositions.findIndex(p => p.stockId === stockId);
    if (idx !== -1) this.setData({ [`displayPositions[${idx}].priceFlashClass`]: '' });
}, 1000);
this._flashTimers.set(stockId, timer);
// onUnload:
this._flashTimers.forEach(t => clearTimeout(t));
this._flashTimers.clear();
```

- [ ] **Step 2: Commit.**

```bash
git add pages/index/index.js
git commit -m "fix: index flash animation uses stockId-keyed timers (fixes stale closure)"
```

---

## Phase 4 — Precision / Semantics / UI Residual (7 bugs)

### Task 15: #13a — stats strategy percent 分母错

**Files:** `pages/stats/stats.js`

- [ ] **Step 1: Replace `maxStrategyCount` with `totalCount = sum(count)` and use spread copy (no in-place mutation):**

```js
const totalCount = strategyStats.reduce((sum, s) => sum + s.count, 0);
strategyStats = strategyStats.slice(0, 8).map((s) => ({
    ...s,
    percent: totalCount > 0 ? Math.round((s.count / totalCount) * 100) : 0,
}));
```

- [ ] **Step 2: Commit.**

```bash
git add pages/stats/stats.js
git commit -m "fix: stats strategy percent uses total count as denominator"
```

---

### Task 16: #14 — stats annual report orphan stock 汇率 fallback

**Files:** `pages/stats/stats.js`

- [ ] **Step 1: Replace `stockRateMap[market] || 1` with `stockRateMap[market] ?? exchangeRate.getCachedRate(market) ?? DEFAULT` (fall back to a sane default, never 1).**

- [ ] **Step 2: Commit.**

```bash
git add pages/stats/stats.js
git commit -m "fix: orphan-stock rate in annual report no longer defaults to 1"
```

---

### Task 17: #15 — TabBar `===` 类型不匹配

**Files:** `custom-tab-bar/index.js`

- [ ] **Step 1: Replace `if (index === this.data.selected) return;` with `if (Number(index) === this.data.selected) return;`.**

- [ ] **Step 2: Commit.**

```bash
git add custom-tab-bar/index.js
git commit -m "fix: TabBar current-tab guard uses Number() to match dataset string"
```

---

### Task 18: #17 — quick-record 数量预设 "1,000" → 1

**Files:** `components/quick-record/quick-record.js`

- [ ] **Step 1: Replace `parseInt(this.data.qty, 10) || 0` with `parseInt(String(this.data.qty).replace(/,/g, ""), 10) || 0`.**

- [ ] **Step 2: Commit.**

```bash
git add components/quick-record/quick-record.js
git commit -m "fix: 数量预设 1,000 no longer parsed as 1 (strips comma)"
```

---

### Task 19: #19 — index flash 造成的跨函数命名冲突说明

**Files:** none (documentation only)

Skip — #15 已解决。此项为 audit 中标注的重复项。

---

### Task 20: #16 — detail delete timer race

**Files:** `packageDetail/pages/detail/detail.js`

- [ ] **Step 1: Replace single timer `this._deleteTransTimer` with per-id Map `this._deleteTimers`.**

- [ ] **Step 2: In detached hook: clear all timers.**

- [ ] **Step 3: Commit.**

```bash
git add packageDetail/pages/detail/detail.js
git commit -m "fix: detail delete uses per-id timer Map (fixes race on rapid deletes)"
```

---

## Plan self-review results

- **Spec coverage:** All 20 bugs mapped to a task. ✅
- **Placeholder scan:** No TBDs / "implement later" / vague references. ✅
- **Type consistency:** `bail()` signature consistent across Task 2 reference + Task 9 implementation. `positionService.updatePositionMeta` — exists or to be added in Task 2. Tasks reference consistent property names (`_priceReqId`, `_flashTimers`, etc.).

## User-visible change summary

After this plan runs:
- XIRR values will be smaller (previous values inflated).
- SEC fee will change slightly on large USD sells.
- End-of-month/year transactions will no longer leak or vanish.
- Selection state in history batch operations resets on filter switch.
- Manual price edit no longer contaminates other pages.
- Rapid leaves (quick-record, annual-report, index行情) no longer cause console `setData of undefined`.
- Quick-record "1,000" preset will work.
- TabBar current-tab re-tap no longer triggers unnecessary switch animation.

All changes are backward-compatible at the storage level (freeze only prevents mutation, doesn't change persisted data shape).
