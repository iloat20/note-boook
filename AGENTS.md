# AGENTS.md

WeChat Mini Program (微信小程序) — stock trading record-keeping app. Pure client-side, all data in `wx.setStorageSync`. No cloud backend.

## Commands

| Task | Command |
|------|---------|
| Lint | `npx biome check pages/ utils/ components/ packageDetail/ packageRecord/` |
| Auto-fix lint | `npx biome check --write --unsafe pages/ utils/ components/ packageDetail/ packageRecord/` |
| Test | `npm test` |
| Test (watch) | `npm run test:watch` |
| Format check | `npx biome check --formatter-enabled=true pages/ utils/` |

No CLI build step. Open project root in **WeChat DevTools** to build, preview, and upload.

## Code Style

- **Indentation**: Tabs in JS, 2-space in WXSS (enforced by biome).
- **Quotes**: Double quotes in JS.
- **Module system**: CommonJS `require()` / `module.exports` — no ES modules.
- **Naming**: Files are `camelCase.js`, components are `kebab-case/` directories.
- **Line width**: 100 chars.

## Architecture

### Subpackages (lazy-loaded)

- `packageDetail/` — stock detail + dividend pages
- `packageRecord/` — add/edit transaction form
- Preloaded from main tab pages via `preloadRule` in `app.json`.

### Storage Layer (`utils/`)

Three tiers: `storageCore/core.js` → `utils/models/` → `utils/services/`.

- Models use **Active Record** pattern: `Stock.save()`, `Transaction.getAll()` etc.
- IDs are timestamp-based: `Date.now() * 1000 + seq` — no collision scanning.
- `markDataDirty()` sets `appStore.dataDirty` flag + clears LRU caches.
- Pages check dirty flag in `onShow()` via `pageMixin.onShowMixin(this, tabIndex)`.

### Key Gotchas

- `utils/constants/config.js` does **not exist** — use `utils/constants/index.js` for constants.
- `request.js` in `api/` is a placeholder (`api.example.com`) — not connected to any real backend.
- Biome 2.5.0 schema: use `includes` (not `include`), `preset` (not `recommended` at top level), no `diagnostics` key.
- Charts use ECharts custom build via `components/ec-canvas/` with Canvas 2D. Dispose in `onUnload`, not `onHide`.
- Custom tab bar (`custom-tab-bar/index.js`) is a `Component({})` — each tab page must manually set `selected` in `onShow()`.

### State Management

Lightweight custom store (`utils/state/store.js`) — `createStore({ state, mutations })`. Not Vuex/Redux.

- `appStore` — app-level dirty flag
- `positionStore` — position data cache

### Cache System

4 LRU caches in `utils/cache/cacheManager.js`: `position` (100), `heatmap` (50), `periodStats` (50), `mem` (50). `markDataDirty(types, stockId?)` supports per-stock granularity for position cache.

## Testing

- Jest with babel-jest transform (Node environment).
- Tests mock `wx` API globally (`wx.getStorageSync`, `wx.setStorageSync`).
- Run `npm test` — covers `utils/storageCore`, `utils/helpers/positionCalculator`, `utils/services/stockPrice`.
- Coverage collection: `utils/**/*.js`, `pages/**/*.js`.
