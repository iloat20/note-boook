# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WeChat Mini Program (微信小程序) for stock trading record-keeping. Pure client-side — all data stored in `wx.setStorageSync` (local storage), no cloud backend.

## Build & Development

No CLI build tooling. Open the project root in **WeChat DevTools** to build, preview, and upload.

- `project.config.json` — appid, base library version, compiler settings
- `project.private.config.json` — local dev overrides (ES6 transpile, PostCSS, minification)

### Commands

```bash
npm test                 # run Jest unit tests (jest.config.js)
npm run test:watch       # watch mode
npx biome check pages/ utils/ components/ packageDetail/ packageRecord/   # lint + format check
npx biome check --write --unsafe pages/ utils/ ...                        # auto-fix
```

The project uses **Biome** (not ESLint/Prettier) — `biome.json` configures tab indent, 100-col width, double quotes, and `recommended` rules. Biome's editor assist auto-organizes imports on save.

## Architecture

### Pages

| Tab | Page | Role |
|-----|------|------|
| 0 | `pages/index/index` | Portfolio positions, market tabs, swipe actions, live price fetch, share card |
| 1 | `pages/history/history` | Transaction log, filters, search, pagination |
| 2 | `pages/stats/stats` | ECharts charts, heatmap, virtual list, MD export, annual report |
| sub | `packageRecord/pages/record/record` | Add/edit BUY/SELL transaction form (subpackaged) |
| sub | `packageDetail/pages/detail/detail` | Single stock detail, position editing, dividend management (subpackaged) |
| sub | `packageDetail/pages/dividend/dividend` | Add/edit dividend (subpackaged) |

### Subpackages

`packageDetail/` and `packageRecord/` are lazy-loaded subpackages. `packageDetail/` contains detail and dividend pages. `packageRecord/` contains the add/edit transaction form. Preloaded via `preloadRule` when user is on index, history, or stats. Navigation uses `/packageDetail/pages/...` or `/packageRecord/pages/...` paths.

### Custom Tab Bar

`custom-tab-bar/index.js` — a `Component({})` with SVG icons. Each tab page manually sets selection index in `onShow()` via `this.getTabBar().setData({ selected: N })`.

### Rendering

- **iOS 26.5 Frosted Glass Design System** (`app.wxss` defines CSS custom properties for frosted glass effects, Apple system colors, SF Pro type scale, accent orange `#FF6B35`)
- `app.json` → `navigationStyle: "custom"` — all pages manage their own frosted glass nav bar (`.nav-bar` class with `backdrop-filter: blur`) using `statusBarHeight` and `navBarHeight` from `app.globalData.systemInfo`
- Custom tab bar (`custom-tab-bar/`) also uses frosted glass style
- `componentFramework: "glass-easel"` — uses the glass-easel component framework
- `lazyCodeLoading: "requiredComponents"` — components loaded on demand

### Utils — Storage Layer

Modular architecture with three tiers: `utils/storageCore/` → `utils/models/` → `utils/services/`, plus `utils/helpers/` and `utils/state/`.

#### Storage Core (`utils/storageCore/`)

1. **`core.js`** — Low-level `getData()/saveData()/getNextId()/markDataDirty()` with LRU memory cache
2. **`constants.js`** — Storage key constants (e.g. `stock_trade_stocks`, `stock_trade_transactions`)
3. **`index.js`** — Re-exports for convenience

#### Models (`utils/models/`) — Active Record Pattern

Each model wraps one storage key and provides CRUD operations:

- `Stock` — stock info (code, name, market)
- `Transaction` — buy/sell records
- `Dividend` — dividend records
- `PriceCache` — cached price data
- `Strategy` — trading strategy tags
- `index.js` — re-exports all models

#### Services (`utils/services/`) — Business Logic

Higher-level services composing models + helpers:

- `positionService` — position calculations, merge logic (`mergePositions` extracted)
- `statsService` — statistics aggregation
- `stockPrice` — Tencent Finance API (`https://qt.gtimg.cn/q=...`) for live prices, with concurrency control, retry, batch chunking
- `chartService` — ECharts data preparation
- `exchangeRate` — currency conversion (USD/HKD → CNY) with fallback defaults
- `index.js` — re-exports

#### Helpers (`utils/helpers/`) — Pure Functions

- `positionCalculator` — P&L, cost, position metrics
- `feeCalculator` — per-market fee breakdown (A-share: commission+stamp+transfer; HK: 5 fees; US: commission+SEC+TAF)
- `entityFactory` — model instance creation
- `sortHelpers` — sorting comparators
- `stockHelpers` — `buildStockMap()` and similar utilities
- `format.js` — `fmt()` (comma-separated numbers), `fmtDate()`, `fmtTime()`, `fmtShortDate()`
- `dateRange.js` — date range calculations (today, week, month, yearToDate, fullYear, getByPeriod)
- `xirr.js` — XIRR computation with Newton-Raphson + bisection fallback, `buildCashFlows()`, `calcXIRRForRange()`, `getTotalXIRR()`

#### State Management (`utils/state/`)

Lightweight custom store pattern:

- `store.js` — `createStore({ state, mutations })` factory with `getState()`, `commit()`, `subscribe()`
- `appStore.js` — app-level state (`dataDirty` flag, MARK_DIRTY/MARK_CLEAN mutations)
- `positionStore.js` — position state (`positions`, `summary`, SET_POSITIONS/SET_SUMMARY mutations)

#### Cache (`utils/cache/`)

- `lruCache.js` — LRU cache implementation
- `cacheManager.js` — manages 4 LRU caches: `position` (100), `heatmap` (50), `periodStats` (50), `mem` (50). Supports `markDataDirty(types, stockId?)` with per-stock granularity for position cache.
- `computedCache.js` — disk-backed, version-bumped cache for expensive computations. Entries auto-invalidate via `bumpVersion()` whenever `markDataDirty()` fires on a data write, so callers never manage TTLs by hand. Persists across page reloads.

#### Indices & Time-Series

- `utils/models/dateIndex.js` + `transactionIndex.js` — pre-index transactions/dividends into time buckets. Range queries locate the start/end buckets in O(1) instead of scanning all records. Time-range filtering (month/year/period) goes through these, not a linear scan.

#### Constants (`utils/constants/`)

- `index.js` — `MARKETS`, `TRANSACTION_TYPE`, `FEE_CONFIG`, `DEFAULT_STRATEGIES`, `TIMING_CONFIG`
- `config.js` — centralized config (API URLs, timeouts, rate defaults, XIRR params, validation limits, cache TTLs, storage keys)
- `errorCodes.js` — HTTP and business error code constants
- `market.js` — `getMarketLabel()`, `getMarketColor()`, `validateStockCode()`, `formatStockCode()`

#### Error Types (`utils/errors.js`)

Semantic error classes inheriting from `AppError`:

- `ValidationError` — data validation failures
- `NotFoundError` — entity not found
- `NetworkError` — request failures
- `CalculationError` — computation failures (e.g. XIRR)

#### UI Utilities (`utils/ui/`)

- `pageMixin.js` — shared page lifecycle mixin (dataDirty check in onShow)
- `touchGestureMixin.js` — swipe gesture logic extracted from index page
- `feedback.js` — `toast()`, `success()`, `loading()`, `hideLoading()`
- `animationHelper.js` — number scroll animation (`animateAllValues`)
- `confirmDialog.js` — `confirmDelete()` and `confirm()` returning Promises

#### Render (`utils/render/`)

- `canvasRenderer.js` — Canvas 2D portfolio card rendering for sharing
- `shareHelper.js` — `sharePortfolio()` orchestrating canvas → temp file → action sheet (save/share)

#### Exporters (`utils/exporters/`)

- `markdown.js` — `buildMarkdown()` generates transaction + dividend tables, `exportMD()` writes file and triggers `wx.shareFileMessage`

#### Data (`utils/data/`)

- `stockDatabase.js` — built-in stock code database (~130 stocks) with pre-built search pools

### Key Patterns

- **Active Record**: `Stock.save()`, `Transaction.getAll()` etc. call `saveData()/getData()` from storageCore
- **Timestamp IDs**: `getNextId()` = `Date.now() * 1000 + seq` — collision-free, no scanning
- **Dirty flag**: `markDataDirty()` sets `appStore.dataDirty` via `appStore.commit('MARK_DIRTY')`, clears caches. Pages check via `pageMixin.onShowMixin()` or direct `appStore.getState('dataDirty')`
- **LRU Cache**: 4 caches in `cacheManager` avoid repeated `wx.getStorageSync` reads; kept in sync via `cacheManager.markDataDirty()` with per-stock granularity
- **Batch delete**: `Transaction.deleteByStockId()` and `Dividend.deleteByStockId()` for cascading stock deletion
- **Error handling**: Use `AppError` subclasses (from `utils/errors.js`), not raw strings or try/catch swallowing
- **Config access**: Use `utils/constants/config.js` for all configurable values, never `process.env`

### Data Flow

```
User action → Page calls Stock/Transaction.save()
  → wx.setStorageSync (persist)
  → markDataDirty() (set flag + clear caches)
  → navigateBack()
  → target page onShow() checks dataDirty
  → loadData() → getPositionSummary() → calculatePosition() (cached)
```

### Annual Report Component (`components/annual-report/`)

Displays yearly investment statistics:
- Total P&L, win rate, trade counts
- Monthly P&L visualization (CSS-based horizontal bar chart)
- Top performing stocks, strategy distribution, fund flow overview

Uses CSS-based charts (not Canvas) for cross-platform compatibility. Data processed in `_processData()` method with observers on `data` property.

### Charts (Stats Page)

ECharts 5.3.3 custom build (bar/line/scatter + tooltip/legend/grid only, ~614KB) via `components/ec-canvas/`. Three charts:
1. Position distribution (bar)
2. PnL trend (mixed bar + line, dual Y-axis)
3. Return distribution (scatter)

Charts initialized in `initCharts()` via `ec.onInit` callback pattern. Gradient objects cached in `gradientCache` to avoid GC pressure.

The `ec-canvas` component uses Canvas 2D (`type="2d"`) by default. The echarts.js build includes a `process` polyfill at the top to prevent `ReferenceError` in the mini program environment. Charts are disposed in `onUnload`, not `onHide` (disposing on hide causes touch event crashes on the ec-canvas component).

### Components

| Component | Purpose |
|-----------|---------|
| `annual-report/` | Yearly investment report with CSS charts |
| `empty-state/` | Empty state placeholder |
| `liquid-slider/` | Liquid animation slider |
| `market-tag/` | Market type label (A/HK/US) |
| `quick-record/` | Quick transaction entry (floating quick-entry layer) |
| `strategy-tags/` | Trading strategy tag selector |

Note: do not reference a `components/section-header/` — it has been removed.

### API Layer (`api/`)

- `request.js` — unified request wrapper with retry, error handling, response parsing
- **Note**: No `interceptors/` directory exists (a previous design-doc mentioned `authInterceptor`/`cacheInterceptor`/`errorInterceptor`, but they were never implemented). Currently a placeholder pointing at `api.example.com` — not connected to any real backend. Live prices come directly from the Tencent Finance API (`qt.gtimg.cn`) via `utils/services/stockPrice.js`, not this layer.

### Tests (`tests/`)

Jest-based unit tests (run via `npm test`, watch via `npm run test:watch`):
- `memory.test.js` — storage/memory tests
- `portfolio.test.js` — portfolio calculation tests
- `stockPrice.test.js` — price parsing tests
- `feeCalculator.test.js`, `xirr.test.js`, `format.test.js` — core financial functions
- `dateRange.test.js`, `dateIndex.test.js`, `transactionIndex.test.js` — date indexing
- `computedCache.test.js`, `statsCache.test.js` — computation caching
- `detailFlow.test.js`, `searchHistory.test.js`, `storageFreeze.test.js` — flows & edge cases

Coverage is limited but growing. New features should include corresponding tests.

## Important Caveats

- Import models from `utils/models/` (e.g., `require('../../utils/models/index')`); services from `utils/services/`; helpers from `utils/helpers/`.
- Import config from `utils/constants/config.js` — never use `process.env` directly.
- Import error types from `utils/errors.js` for semantic error handling (not raw strings).
- Annual report uses CSS-based charts (not Canvas) for cross-platform compatibility.
- XIRR uses Newton-Raphson with bisection fallback — handles extreme rates and oscillation. Don't "simplify" it.

## GitHub Automation

`.github/workflows/claude.yml` triggers on PRs (auto-review), issue/PR comments that `@claude`, using the `anthropics/claude-code-action`. The `allowed_tools` gate only permits `npm test` and `npx jest` — never extend it to arbitrary bash. A separate `pr-automation.yml` handles PR housekeeping.
