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
| 2 | `pages/stats/stats` | Statistics summary, MD export, annual report (CSS-based, no chart library) |
| sub | `packageRecord/pages/record/record` | Add/edit BUY/SELL transaction form (subpackaged) |
| sub | `packageDetail/pages/detail/detail` | Single stock detail, position editing, dividend management (subpackaged) |

### Subpackages

`packageDetail/` and `packageRecord/` are lazy-loaded subpackages. `packageDetail/` contains the detail page (with dividend management). `packageRecord/` contains the add/edit transaction form. Preloaded via `preloadRule` — currently `pages/index/index` preloads `packageDetail`. Navigation uses `/packageDetail/pages/...` or `/packageRecord/pages/...` paths.

### Custom Tab Bar

`custom-tab-bar/index.js` — a `Component({})` with SVG icons that **auto-derives the selected tab** from `getCurrentPages()`; tab pages do not set `selected` manually in `onShow`.

### Rendering

- **Frosted Glass Design System** (`app.wxss` defines CSS custom properties for frosted glass effects, Apple system colors, SF Pro type scale, accent red `--xhs-primary` `#FF3B30`)
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
- `stockPrice` — Tencent Finance API (`https://qt.gtimg.cn/q=...`) for live prices, with concurrency control, retry, batch chunking. External source abstracted as a swappable `TencentPriceProvider` (see P2-5 in the architecture review)
- `exchangeRate` — currency conversion (USD/HKD → CNY) with fallback defaults
- `index.js` — re-exports

#### Helpers (`utils/helpers/`) — Pure Functions

- `positionCalculator` — P&L, cost, position metrics
- `entityFactory` — model instance creation
- `sortHelpers` — sorting comparators
- `stockHelpers` — `buildStockMap()` and similar utilities
- `format.js` — `fmt()` (comma-separated numbers), `fmtDate()`, `fmtTime()`, `fmtShortDate()`
- `dateRange.js` — date range calculations (today, week, month, yearToDate, fullYear, getByPeriod)

#### State Management (`utils/state/`)

Lightweight custom store pattern:

- `store.js` — `createStore({ state, mutations })` factory with `getState()`, `commit()`, `subscribe()`
- `appStore.js` — app-level state (`dataDirty` flag, MARK_DIRTY/MARK_CLEAN mutations)
- `positionStore.js` — position state (`positions`, `summary`, SET_POSITIONS/SET_SUMMARY mutations)

#### Cache (`utils/cache/`)

- `lruCache.js` — LRU cache implementation
- `cacheManager.js` — manages 3 LRU caches: `position` (100), `stats` (20), `mem` (100). `CACHE_TYPES` enum centralizes cache keys; `heatmap`/`periodStats` remain valid dirty tags (no dedicated instance allocated). `markDataDirty(types, stockId?)` supports per-stock granularity for the `position` cache.

#### Indices & Time-Series

- `utils/models/dateIndex.js` + `transactionIndex.js` — lazily-rebuilt indices for `Transaction` (not dividends). `dateIndex` answers date-range queries via binary search (O(log n)); `transactionIndex` answers `getByStockId` (date-descending). Both invalidate on every write. They read directly from `storageCore` (not the sibling `Transaction` model) to avoid a circular dependency.

#### Constants (`utils/constants/`)

- `index.js` — `MARKETS`, `TRANSACTION_TYPE`, `FEE_CONFIG`, `DEFAULT_STRATEGIES`, `TIMING_CONFIG`
- `market.js` — `getMarketLabel()`, `getMarketColor()`, `validateStockCode()`, `formatStockCode()`, `buildSymbol()`

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
- **Config access**: Use `utils/constants/index.js` for all configurable values, never `process.env`

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

### Charts

This project uses **no charting library (ECharts)**. All visualizations (stats summary, annual report) are CSS/WXSS-based. The only `<canvas>` is the portfolio share-card renderer in `pages/index`, mounted on-demand via `wx:if="{{generatingShare}}"`.

### Components

| Component | Purpose |
|-----------|---------|
| `annual-report/` | Yearly investment report with CSS charts |
| `empty-state/` | Empty state placeholder |
| `liquid-slider/` | Liquid animation slider |
| `quick-record/` | Quick transaction entry (floating quick-entry layer) |
| `strategy-tags/` | Trading strategy tag selector |

Note: do not reference a `components/section-header/` — it has been removed.

### API Layer (`api/`)

- `request.js` — unified request wrapper with retry, error handling, response parsing
- **Note**: No `interceptors/` directory exists (a previous design-doc mentioned `authInterceptor`/`cacheInterceptor`/`errorInterceptor`, but they were never implemented). `request.js` is a **real** `wx.request` wrapper (retries, error handling, response parsing) with no backend of its own. Live prices come directly from the Tencent Finance API (`qt.gtimg.cn`) via `utils/services/stockPrice.js`, not this layer.

### Tests (`tests/`)

Jest-based unit tests (run via `npm test`, watch via `npm run test:watch`):
- `memory.test.js` — storage/memory tests
- `portfolio.test.js` — portfolio calculation tests
- `stockPrice.test.js` — price parsing tests
- `format.test.js` — core financial functions
- `dateRange.test.js`, `dateIndex.test.js`, `transactionIndex.test.js` — date indexing
- `statsCache.test.js` — stats service caching
- `detailFlow.test.js`, `searchHistory.test.js`, `storageFreeze.test.js` — flows & edge cases

Coverage is limited but growing. New features should include corresponding tests.

## Important Caveats

- Import models from `utils/models/` (e.g., `require('../../utils/models/index')`); services from `utils/services/`; helpers from `utils/helpers/`.
- Import config from `utils/constants/index.js` — never use `process.env` directly.
- Import error types from `utils/errors.js` for semantic error handling (not raw strings).
- Annual report uses CSS-based charts (not Canvas) for cross-platform compatibility.

## GitHub Automation

`.github/workflows/claude.yml` triggers on PRs (auto-review), issue/PR comments that `@claude`, using the `anthropics/claude-code-action`. The `allowed_tools` gate only permits `npm test` and `npx jest` — never extend it to arbitrary bash. A separate `pr-automation.yml` handles PR housekeeping.
