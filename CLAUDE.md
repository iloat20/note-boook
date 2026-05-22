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
| sub | `packageRecord/pages/record/record` | Add/edit BUY/SELL transaction form (subpackaged) |
| sub | `packageDetail/pages/detail/detail` | Single stock detail (subpackaged) |
| sub | `packageDetail/pages/dividend/dividend` | Add/edit dividend (subpackaged) |

### Subpackages

`packageDetail/` and `packageRecord/` are lazy-loaded subpackages. `packageDetail/` contains detail and dividend pages. `packageRecord/` contains the add/edit transaction form. Preloaded when user is on index or history. Navigation uses `/packageDetail/pages/...` or `/packageRecord/pages/...` paths.

### Custom Tab Bar

`custom-tab-bar/index.js` — a `Component({})` with SVG icons. Each tab page manually sets selection index in `onShow()` via `this.getTabBar().setData({ selected: N })`.

### Rendering

- **iOS 26.5 Frosted Glass Design System** (`app.wxss` defines CSS custom properties for frosted glass effects, Apple system colors, SF Pro type scale, accent orange `#FF6B35`)
- `app.json` → `navigationStyle: "custom"` — all pages manage their own frosted glass nav bar (`.nav-bar` class with `backdrop-filter: blur`) using `statusBarHeight` and `navBarHeight` from `app.globalData.systemInfo`
- Custom tab bar (`custom-tab-bar/`) also uses frosted glass style

### Utils — Storage Layer

Modular architecture (`utils/storageCore/` + `utils/models/` + `utils/helpers/`):

1. **`utils/storageCore/core.js`** — Low-level `getData()/saveData()/getNextId()/markDataDirty()` with LRU memory cache
2. **`utils/models/`** — Active Record models (`Stock`, `Transaction`, `Dividend`, `PriceCache`, `Strategy`) each wrapping one storage key
3. **`utils/helpers/`** — Pure function helpers (`positionCalculator`, `feeCalculator`, `entityFactory`, `sortHelpers`)
4. **`utils/services/`** — Higher-level services (`positionService`, `statsService`, `stockPrice`, `chartService`) composing models + helpers
5. **`utils/ui/`** — UI utilities (`pageMixin`, `feedback`)

Key patterns:
- **Active Record**: `Stock.save()`, `Transaction.getAll()` etc. call `saveData()/getData()` from storageCore
- **Timestamp IDs**: `getNextId()` = `Date.now() * 1000 + seq` — collision-free, no scanning
- **Dirty flag**: `markDataDirty()` sets `appStore.dataDirty` via `appStore.commit('MARK_DIRTY')`, clears caches. Pages check via `pageMixin.onShowMixin()` or direct `appStore.getState('dataDirty')`
- **LRU Cache**: `LRUCache` instances in `cacheManager` (4 caches: mem/position/heatmap/periodStats) avoid repeated `wx.getStorageSync` reads; kept in sync via `cacheManager.markDataDirty()`
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

- Import models from `utils/models/` (e.g., `require('../../utils/models/index')`)
- Import services from `utils/services/` for higher-level operations
- Import helpers from `utils/helpers/` for pure functions
- `request.js` is a placeholder pointing at `api.example.com` — not connected to any real backend
- Tests exist in `tests/` (memory, portfolio, stockPrice) but coverage is limited

## Available Skills

The following skills are available for use via `/skill-name`:

| Skill | Purpose |
|-------|---------|
| `frontend-design` | Create distinctive, production-grade frontend interfaces |
| `superpowers:brainstorming` | Explore requirements before creative/feature work |
| `superpowers:dispatching-parallel-agents` | Run independent tasks in parallel |
| `superpowers:executing-plans` | Execute multi-step implementation plans |
| `superpowers:receiving-code-review` | Process code review feedback with rigor |
| `superpowers:requesting-code-review` | Verify work before merging |
| `superpowers:finishing-a-development-branch` | Guide completion and integration of dev work |
| `superpowers:subagent-driven-development` | Execute independent tasks in current session |
| `superpowers:systematic-debugging` | Debug bugs/test failures before proposing fixes |
| `superpowers:verification-before-completion` | Verify work before claiming completion |
| `superpowers:writing-skills` | Create/edit/verify skills |
| `superpowers:writing-plans` | Plan multi-step tasks before coding |
| `superpowers:using-git-worktrees` | Create isolated worktrees for feature work |
| `superpowers:test-driven-development` | TDD before implementation |
