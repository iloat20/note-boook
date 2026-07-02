# Performance Optimization Design — Stats / XIRR / Console

> Status: **DRAFT — pending review**
> Scope: `utils/services/statsService.js`, `utils/services/xirrService.js`, all `console.*` statements across `pages/`, `utils/`, `components/`
> Out of scope: `pages/index/index.js` refresh pipeline, `app.json` subpackage changes, ECharts bundle

## 1. Background (from codebase exploration)

Codebase is 56 JS files / ~232 KB, well-structured. No obvious low-hanging fruit on bundle size; `lazyCodeLoading: requiredComponents` already enabled; `testPathIgnorePatterns` fixed to exclude stale worktrees.

Three runtime hotspots identified by static scan (loop-count, not profiling):

| Area | File | Loops | Claim |
|---|---|---|---|
| Period stats | `utils/services/statsService.js:222` `getPeriodStatsList` → `periods.forEach(p => calcStatsForRange(...))` | 16 (inside service) | Same `Transaction.getAll()` filtered N times, once per period |
| XIRR build | `utils/services/xirrService.js:7` `_buildCashFlowsCore` | 3 distinct `forEach` over transactions+dividends | Refiltered on every XIRR invocation |
| Console | 17 statements across pages/index, pages/stats, components/quick-record, utils/state/store | N/A | Runs in hot paths (`onShow`); cost is real on low-end devices |

## 2. Problem Statement

`getPeriodStatsList("MONTH", 12)` calls `calcStatsForRange` 12 times; each call does:
- `transactions.filter(...)` over all transactions
- `dividends.filter(...)` over all dividends
- `periodTrans.forEach(...)` for amounts
- `periodDivs.reduce(...)` for dividendIncome

→ **O(transactions × periods × 4)** redundant scans.
Example: 200 transactions × 12 periods = **2,400 full scans** of the same array per stats page load.
Each call also does `new Date(t.date)` repeatedly for the same transaction.

`_buildCashFlowsCore` repeats 3 `forEach` over transactions to build cashFlows / holdingPositions, plus `items.sort()` with `localeCompare` (slow).

XIRR results are cached by `xirr_${start}_${end}_${cny?}` — already done. But the **upstream aggregation** is still redone whenever cache is cold.

## 3. Proposed Solution

### 3.1 Single-pass period bucketing (primary)

Add helper `utils/services/statsService.js:_buildPeriodIndex(transactions, dividends, periodType)` that returns `Map<label, {transactions: [...], dividends: [...]}>` from **one combined scan**.

Refactor:
- `getPeriodStatsList` → builds index once, iterates `Map`, calls `calcStatsForRange(bucketTx, bucketDiv, ...)`
- `calcStatsForRange` keeps its public signature (5 args); internal fast-path accepts pre-bucketed arrays.
- `getStrategyStats` and `getISOWeek` unchanged.
- `markDataDirty` in cacheManager clears `caches.periodStats` (already wired, no change).

Why one combined scan? Each transaction date is compared to period boundaries via precomputed `[startMs, endMs]` ranges; a transaction matching a bucket is pushed once. Compared to current N scans, this is **O(transactions + periods)** instead of **O(transactions × periods)**.

### 3.2 XIRR upstream dedup (secondary)

Consolidate `_buildCashFlowsCore`'s 3 loops into **one pass** building:
- `items` (cash flows)
- `holdingPositions` simultaneously

`items.sort` stays but once per call. Cache behavior is preserved (still keyed by range).

### 3.3 Console cleanup (low-risk, bundled)

Replace 17 raw `console.log/warn/error/info` with a thin `utils/helpers/logger.js`:

```js
// utils/helpers/logger.js
const LEVEL = { error: 0, warn: 1, info: 2, log: 3, debug: 4 };
const current = LEVEL[typeof __LOG_LEVEL__ !== "undefined" ? __LOG_LEVEL__ : "warn"];
module.exports = {
  error: (...a) => { if (LEVEL.error <= current) console.error(...a); },
  warn:  (...a) => { if (LEVEL.warn  <= current) console.warn(...a); },
  info:  (...a) => { if (LEVEL.info  <= current) console.info(...a); },
  log:   (...a) => { if (LEVEL.log   <= current) console.log(...a); },
  debug: (...a) => { if (LEVEL.debug <= current) console.debug(...a); },
};
```

Call sites in `pages/index/index.js` (5), `pages/stats/stats.js` (3), `components/quick-record/quick-record.js` (3), `utils/state/store.js` (3), plus 1-shot occurrences → `logger.*()` (default level `warn` suppresses `log`/`info`/`debug` in prod-like runs). `error`/`warn` preserved for diagnostics.

## 4. Interfaces (signatures)

```js
// statsService.js — new
/**
 * @param {Array<{date:string}>} transactions
 * @param {Array<{date:string}>} dividends
 * @param {Array<{label:string, start:number, end:number}>} periods  // ms boundaries
 * @returns {Map<string, {transactions: Array, dividends: Array}>}
 */
function _buildPeriodIndex(transactions, dividends, periods)
```

Existing exports unchanged: `calcStatsForRange`, `getTotalStats`, `getStatsByPeriod`, `getPeriodStatsList`, `getStrategyStats`, `calcXIRRForRange`, `getTotalXIRR`, `getPeriodStatsWithReturn`.

`xirrService.js` exports unchanged.

`logger.js` exports `{ error, warn, info, log, debug }`.

## 5. Migration / Compatibility

- **Backward compatible**: `statsService.js` exports same names; other modules consume same results shape.
- **Test-preserving**: existing tests in `tests/xirr.test.js` (pure `xirr()` math) unchanged.
- **New tests added**: `tests/statsService.test.js` covering `_buildPeriodIndex`, `getPeriodStatsList` result equivalence (same `label`, `buyAmount`, `sellAmount`, `pnL`, `dividendIncome` vs today's baseline), and `logger` level gating.

## 6. Success Criteria

1. `npx jest` green (existing + new tests).
2. `npx biome check` green.
3. Benchmark: with 200 mock transactions × 12 months, `getPeriodStatsList("MONTH", 12)` median runs in **< 25% of baseline** (measured by a dev-only `utils/dev/benchmark.js` script; not shipped in prod path).
4. `isRealizedOnly: true` semantics on period stats PnL preserved.
5. No change to XIRR outputs (cache key unchanged).

## 7. Test Plan

- Unit: `tests/statsService.test.js` (bucket index + period list)
- Unit: `tests/logger.test.js` (level gating)
- Existing: `tests/xirr.test.js`, `tests/feeCalculator.test.js`, `tests/memory.test.js`, `tests/transactionIndex.test.js`, `tests/stockPrice.test.js`, `tests/dateRange.test.js`, `tests/format.test.js`, `tests/searchHistory.test.js`, `tests/portfolio.test.js`, `tests/storageFree.test.js`
- E2E: devtools build + manual stats page reload (visual).

## 8. Open Questions

- Q1: Should `logger.level` be configurable at runtime via a storage flag (e.g., debug build only)? Default proposal: compile-time `__LOG_LEVEL__` injected by a local script (not in repo).
- Q2: `utils/dev/benchmark.js` shipped or not? Proposal: committed as dev-only script (no page imports).
- Q3: `pages/index/index.js` refresh pipeline defer to follow-up story? Yes (out of scope here).