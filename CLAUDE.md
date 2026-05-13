# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WeChat Mini Program (微信小程序) for stock trading record-keeping. Pure client-side — all data stored in `wx.setStorageSync` (local storage), no cloud backend.

## Build & Development

No CLI build tooling. Open the project root in **WeChat DevTools** to build, preview, and upload.

- `project.config.json` — appid, base library version, compiler settings
- `project.private.config.json` — local dev overrides (ES6 transpile, PostCSS, minification)
- No package.json, no npm scripts, no linter, no test framework

## Architecture

### Pages

| Tab | Page | Role |
|-----|------|------|
| 0 | `pages/index/index` | Portfolio positions, market tabs, swipe actions, live price fetch |
| 1 | `pages/history/history` | Transaction log, filters, search, pagination |
| 2 | `pages/stats/stats` | ECharts charts, heatmap, virtual list, MD export |
| — | `pages/record/record` | Add/edit BUY/SELL transaction form |
| sub | `packageDetail/pages/detail/detail` | Single stock detail (subpackaged) |
| sub | `packageDetail/pages/dividend/dividend` | Add/edit dividend (subpackaged) |

### Subpackage

`packageDetail/` is a lazy-loaded subpackage. Detail and dividend pages live there. Preloaded when user is on index or history. Navigation uses `/packageDetail/pages/...` paths.

### Custom Tab Bar

`custom-tab-bar/index.js` — a `Component({})` with SVG icons. Each tab page manually sets selection index in `onShow()` via `this.getTabBar().setData({ selected: N })`.

### Rendering

- **Glass Easel** component framework (`app.json` → `componentFramework: "glass-easel"`)
- `app.wxss` defines the full design system as CSS custom properties (Apple iOS 17+ system colors, SF Pro type scale, frosted glass tokens, accent orange `#FF6B35`)
- `app.json` → `navigationStyle: "custom"` — all pages manage their own frosted glass nav bar (`.nav-bar` class with `backdrop-filter: blur`) using `statusBarHeight` and `navBarHeight` from `app.globalData.systemInfo`
- Custom tab bar (`custom-tab-bar/`) also uses frosted glass style

### Utils — Storage Layer

Two coexisting implementations (mid-refactoring):

1. **`utils/storage.js`** (833 lines) — the monolithic module. Contains all CRUD objects (`Stock`, `Transaction`, `Dividend`, `PriceCache`) plus all calculation/summary functions. **This is what most pages import.**
2. **`utils/storage/`** — modular split (`core.js`, `stock.js`, `transaction.js`, `dividend.js`, `priceCache.js`, `calculator.js`). Its `index.js` re-exports but falls back to the monolith for calculation functions not yet migrated.

Key patterns in `storage.js`:
- **Active Record**: `Stock.save()`, `Transaction.getAll()`, etc. directly call `wx.setStorageSync`
- **Timestamp IDs**: `getNextId()` = `Date.now() * 1000 + seq` — collision-free, no scanning
- **Dirty flag**: `markDataDirty()` sets `app.globalData.dataDirty = true` and clears `_positionCache`/`_heatmapCache`. Pages check this in `onShow()` to decide whether to reload.
- **Memory cache**: `_memCache` avoids repeated `wx.setStorageSync` reads; kept in sync on `saveData()` (writes through)
- **Position cache**: `_positionCache` stores `calculatePosition()` results per stockId; cleared by `markDataDirty()`
- **Batch delete**: `Transaction.deleteByStockId()` and `Dividend.deleteByStockId()` for cascading stock deletion

### Utils — Other Modules

| Module | Purpose |
|--------|---------|
| `constants.js` | `MARKETS`, `TRANSACTION_TYPE`, `FEE_CONFIG` enums |
| `format.js` | `fmt()` (comma-separated numbers), `fmtDate()`, `fmtTime()`, `fmtShortDate()` |
| `market.js` | `getMarketLabel()`, `getMarketColor()`, `validateStockCode()`, `formatStockCode()` |
| `feeCalculator.js` | Per-market fee breakdown (A-share: commission+stamp+transfer; HK: 5 fees; US: commission+SEC+TAF) |
| `stockPrice.js` | Tencent Finance API (`https://qt.gtimg.cn/q=...`) for live prices. `getAsharePrefix()` maps codes to sh/sz. |
| `stockDatabase.js` | Built-in stock code database (~130 stocks) with pre-built search pools for fast fuzzy search |
| `export.js` | Markdown export (`exportMD()`) via `wx.shareFileMessage` — generates tables for all transactions and dividends |
| `backup.js` | JSON backup/import (merge or overwrite modes) |

### Data Flow

```
User action → Page calls Stock/Transaction.save()
  → wx.setStorageSync (persist)
  → markDataDirty() (set flag + clear caches)
  → navigateBack()
  → target page onShow() checks dataDirty
  → loadData() → getPositionSummary() → calculatePosition() (cached)
```

### Charts (Stats Page)

ECharts 5.3.3 custom build (bar/line/scatter + tooltip/legend/grid only, ~614KB) via `components/ec-canvas/`. Three charts:
1. Position distribution (bar)
2. PnL trend (mixed bar + line, dual Y-axis)
3. Return distribution (scatter)

Charts initialized in `initCharts()` via `ec.onInit` callback pattern. Gradient objects cached in `gradientCache` to avoid GC pressure.

The `ec-canvas` component uses Canvas 2D (`type="2d"`) by default. The echarts.js build includes a `process` polyfill at the top to prevent `ReferenceError` in the mini program environment. Charts are disposed in `onUnload`, not `onHide` (disposing on hide causes touch event crashes on the ec-canvas component).

## Important Caveats

- `storage.js` and `utils/storage/` both exist — import from `utils/storage.js` (the monolith) unless you're specifically working on the modular migration
- `request.js` is a placeholder pointing at `api.example.com` — not connected to any real backend
- `workers/dataProcessor.js` is a stub — not in use
- No tests exist anywhere in the project
