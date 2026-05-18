# Memory Design & Robustness Guide

## Overview
This document describes the memory management strategy, budget thresholds, and robustness patterns used in the stock trading mini program.

## Memory Budgets

### Storage Layer (`utils/storage.js`)
| Cache | Max Size | Strategy | Purpose |
|-------|----------|----------|---------|
| `_memCache` | 50 entries | LRU eviction | Avoid repeated `wx.getStorageSync` calls |
| `_positionCache` | 100 entries | Slice oldest | Cache position calculation results |
| `_heatmapCache` | 50 entries | Slice oldest | Cache heatmap data |

### Network Layer (`utils/stockPrice.js`)
| Resource | Limit | Behavior |
|----------|-------|----------|
| Concurrent requests | 5 | Queue excess, execute with 100ms delay |
| Request timeout | 10s | Per-request timeout via `wx.request` |

### Page-Level Caches
| Page | Cache | Strategy |
|------|-------|----------|
| `pages/history/history.js` | `_cachedAllRecords` | Build once, filter from cache |
| `pages/stats/stats.js` | `gradientCache` | Reuse ECharts gradient objects |
| `pages/index/index.js` | `_animTimer` | Cleanup on `onUnload` |

## Lifecycle Cleanup
| Page | Cleanup Actions |
|------|----------------|
| `pages/index/index.js` | `onUnload`: `clearTimeout(_animTimer)` |
| `pages/stats/stats.js` | `onUnload`: `dispose()` both ECharts instances |
| `pages/history/history.js` | `onUnload`: `clearTimeout(_searchTimer)` |

## Key Storage Keys
| Key Pattern | Type | Description |
|-------------|------|-------------|
| `stock_trade_stocks` | Array | All stock records |
| `stock_trade_transactions` | Array | All transaction records |
| `stock_trade_dividends` | Array | All dividend records |
| `stock_trade_prices` | Object | Price cache by stock ID |

## Robustness Patterns
1. **LRU Cache Eviction**: `_memCache` uses `Map` with insertion-order eviction when exceeding 50 entries
2. **Request Throttling**: `fetchAllPrices()` limits concurrent network requests to 5
3. **Data Copy**: `getDataCopy()` returns shallow copies to prevent cache pollution
4. **Dirty Flag**: `markDataDirty()` clears position/heatmap caches and sets `app.globalData.dataDirty`

## Testing
- `tests/memory.test.js` validates LRU eviction, cache size limits, and data isolation
- Run with: `npx jest tests/memory.test.js`

## Future Improvements
- Add storage quota monitoring via `wx.getStorageInfo`
- Implement LRU for `_positionCache` and `_heatmapCache` (currently uses naive slice)
- Add request retry with exponential backoff in `stockPrice.js`