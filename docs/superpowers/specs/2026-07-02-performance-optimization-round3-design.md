# 性能优化全面深度设计（第三轮）

> 日期：2026-07-02
> 基于：第一轮（数据去重/单次setData）+ 第二轮（freeze修复/索引/增量/缓存）已实施
> 目标：日期范围查询索引 + 昂贵计算持久化 + 渲染层虚拟列表

---

## 背景与定位

前两轮优化已完成：

- ✅ 持仓数据移出渲染层、单次 setData 合并
- ✅ getData freeze 修复、TransactionIndex 按 stockId 索引
- ✅ 增量汇总更新、市场 tab 预计算
- ✅ 流水页格式化缓存、统计页去重合并
- ✅ stats/periodStats 缓存层、年报 dirty 感知缓存
- ✅ _sortKey 预计算消除重复 Date 构造

本轮聚焦三个尚未解决的瓶颈：

| 方向 | 问题 | 影响面 |
|------|------|--------|
| A. 日期索引 | getByDateRange 全量扫描+逐条 new Date() | XIRR/周期统计/年报/流水筛选 |
| B. 昂贵计算持久化 | XIRR 和 totalStats 每次进入页面重算 | 统计页加载延迟 |
| C. 渲染层虚拟列表 | completeTrades 全量格式化+渲染 | 交易量大时 stats 页卡顿 |

---

## 方案 A：Transaction DateIndex（日期范围查询索引）

### 问题

`Transaction.getByDateRange(startDate, endDate)` 当前实现：

```javascript
getByDateRange(startDate, endDate) {
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);
    return this.getAll().filter((t) => {
        const d = t.date.length > 10 ? t.date.slice(0, 10) : t.date;
        return d >= start && d <= end;
    });
}
```

每次调用 O(n) 全量扫描，且 `getTotalXIRR()` 传入 `new Date(0)` 作为 start，等于处理全部交易。该函数在以下场景被频繁调用：

- `xirrService.calcXIRRForRange()` — 按周期计算 XIRR
- `xirrService.getTotalXIRR()` — 处理全部交易
- `statsService.getPeriodStatsWithReturn()` — 按周期统计
- `stats.js onOpenAnnualReport()` — 年报周期过滤

### 设计

新增 `utils/models/dateIndex.js`，维护按日期升序排序的交易引用数组，支持 O(log n + k) 范围查询（k 为命中数）。

```javascript
// dateIndex.js
const _sortedByDate = []; // [{ date: "2024-01-15", _sortKey: 1705276800000, ref: transaction }]
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

// 二分查找左边界（第一个 _sortKey >= target）
function _lowerBound(targetKey) {
    let lo = 0, hi = _sortedByDate.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (_sortedByDate[mid]._sortKey < targetKey) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// 二分查找右边界（最后一个 _sortKey <= target）
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
 * 按日期范围获取交易（已排序）
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array} 交易引用数组
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

function invalidate() {
    _built = false;
    _sortedByDate.length = 0;
}

module.exports = { getByDateRange, invalidate };
```

### 索引同步

在 `transaction.js` 的写操作后调用 `dateIndex.invalidate()`：

```javascript
save(transaction) {
    const result = upsertAndSave(TRANSACTION_KEY, transaction);
    markDataDirty(["position", "heatmap", "periodStats"], transaction.stockId);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();  // 新增
    return result;
}

delete(id) {
    deleteAndSave(TRANSACTION_KEY, id, ["position", "heatmap", "periodStats"]);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();  // 新增
}

deleteByStockId(stockId) {
    const transactions = this.getAll().filter((t) => t.stockId !== stockId);
    saveData(TRANSACTION_KEY, transactions);
    markDataDirty(["position", "heatmap", "periodStats"], stockId);
    require("./transactionIndex").invalidate();
    require("./dateIndex").invalidate();  // 新增
}
```

### 调用方切换

| 调用方 | 当前 | 改后 |
|--------|------|------|
| `xirrService.calcXIRRForRange` | `Transaction.getByDateRange(s, e)` | `DateIndex.getByDateRange(s, e)` |
| `xirrService._buildCashFlowsCore` dividends 过滤 | `Dividend.getAll().filter(...)` | 直接传全量（XIRR 内部再过滤）|
| `statsService.getPeriodStatsWithReturn` | `Transaction.getByDateRange(s, e)` | `DateIndex.getByDateRange(s, e)` |
| `stats.js onOpenAnnualReport` | `Transaction.getByDateRange(s, e)` | `DateIndex.getByDateRange(s, e)` |
| `Transaction.getByDateRange` | 保留作为 deprecated fallback | 标注 @deprecated |

### 向后兼容

- `_sortKey` 已在 entityFactory 预计算，旧数据 fallback `new Date(t.date).getTime()`
- `getByDateRange` 仍可调用 `Transaction.getByDateRange`（保留但标记 deprecated）

### 收益预估

| 场景 | 当前 | 优化后 |
|------|------|--------|
| getTotalXIRR（全量） | O(n) 全量扫描 | O(n) 直接取全量（无需过滤） |
| getByDateRange(1年) | O(n) | O(log n + k)，k ≈ n/10 |
| getByDateRange(1月) | O(n) | O(log n + k)，k ≈ n/12 |

---

## 方案 B：昂贵计算持久化缓存

### 问题

以下计算每次进入统计页都全量重算，数据量大时阻塞 UI：

1. `getTotalXIRR()` — 处理全部现金流 + 迭代求解
2. `getTotalStats()` — 遍历全部持仓 + 交易
3. `onOpenAnnualReport` — 多轮全量聚合

虽然已有内存 LRU 缓存（stats/periodStats），但页面退出即丢失。

### 设计

引入 **计算结果持久化缓存层** `utils/cache/computedCache.js`：

```javascript
// computedCache.js
const { getData, saveData } = require("../storageCore/core");

const CACHE_KEYS = {
    TOTAL_STATS: "computed_total_stats",
    TOTAL_XIRR: "computed_total_xirr",
    ANNUAL_REPORT_PREFIX: "computed_annual_",
};

// 缓存有效期：与 dataDirty 联动，无固定 TTL
// 存储格式：{ value, dataVersion, computedAt }

let _dataVersion = 0; // 每次 markDataDirty 递增

/**
 * 递增数据版本（在 markDataDirty 时调用）
 */
function bumpVersion() {
    _dataVersion++;
}

/**
 * 获取当前数据版本
 */
function getVersion() {
    return _dataVersion;
}

/**
 * 读取缓存（版本匹配则命中）
 * @param {string} key
 * @returns {any|null}
 */
function getCached(key) {
    const entry = getData(`${key}_v2`);
    if (!entry) return null;
    if (entry.dataVersion !== _dataVersion) return null; // 版本过期
    return entry.value;
}

/**
 * 写入缓存
 * @param {string} key
 * @param {value} value
 */
function setCached(key, value) {
    saveData(`${key}_v2`, {
        value,
        dataVersion: _dataVersion,
        computedAt: Date.now(),
    });
}

/**
 * 按前缀清除缓存
 */
function clearAll() {
    // 实际实现可用 wx.getStorageInfoSync + removeStorageSync
    // 或维护一个 key 列表
    saveData(`${CACHE_KEYS.TOTAL_STATS}_v2`, null);
    saveData(`${CACHE_KEYS.TOTAL_XIRR}_v2`, null);
}

module.exports = {
    CACHE_KEYS,
    bumpVersion,
    getVersion,
    getCached,
    setCached,
    clearAll,
};
```

### 与 markDataDirty 联动

```javascript
// cacheManager.js 修改 markDataDirty
function markDataDirty(types, stockId) {
    try {
        const appStore = require("../state/appStore");
        appStore.commit("MARK_DIRTY");
        require("./computedCache").bumpVersion();  // 新增：版本递增
    } catch (e) {
        console.warn("[markDataDirty]", e);
    }
    // ... 其余不变
}
```

### 调用方集成

```javascript
// statsService.js
const { getCached, setCached, CACHE_KEYS } = require("../cache/computedCache");

function getTotalStats() {
    const memHit = caches.stats.get(STATS_CACHE_KEYS.TOTAL);
    if (memHit) return memHit;

    const diskHit = getCached(CACHE_KEYS.TOTAL_STATS);
    if (diskHit) {
        caches.stats.set(STATS_CACHE_KEYS.TOTAL, diskHit); // 回填内存
        return diskHit;
    }

    const result = _computeTotalStats();
    caches.stats.set(STATS_CACHE_KEYS.TOTAL, result);
    setCached(CACHE_KEYS.TOTAL_STATS, result);
    return result;
}
```

```javascript
// xirrService.js
async function getTotalXIRR() {
    const cacheKey = CACHE_KEYS.TOTAL_XIRR;
    const memHit = caches.periodStats.get(cacheKey);
    if (memHit !== undefined) return memHit;

    const diskHit = getCached(cacheKey);
    if (diskHit !== null && diskHit !== undefined) {
        caches.periodStats.set(cacheKey, diskHit);
        return diskHit;
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const result = await calcXIRRForRange(new Date(0), today);
    caches.periodStats.set(cacheKey, result);
    setCached(cacheKey, result);
    return result;
}
```

### 缓存失效策略

| 事件 | 动作 |
|------|------|
| 任何数据写入（Transaction/Dividend/Stock） | markDataDirty → bumpVersion → 所有 disk 缓存失效 |
| 页面退出 | 内存 LRU 保留（不清除）|
| 下次进入页面 | 内存未命中 → 读磁盘 → 版本匹配则回填 |

### 启动预热

`app.js onLaunch` 中异步预热：

```javascript
async onLaunch() {
    // ... 现有逻辑
    // 异步预热：回填内存缓存
    const { warmUpCache } = require("./utils/cache/computedCache");
    warmUpCache();
}
```

### 收益

| 场景 | 当前 | 优化后 |
|------|------|--------|
| 冷启动进统计页 | 全量重算 ~200ms | 磁盘读取 ~5ms |
| 切换周期 tab | 内存命中（已有） | 内存命中 |
| XIRR 计算（全量） | 每次重算 ~100ms | 首次计算 + 缓存 |

---

## 方案 C：渲染层虚拟列表 + 延迟计算

### 问题

`pages/stats/stats.js` 中 `completeTrades` 包含全部交易+分红的格式化对象，即使只显示前几条。当交易记录 > 200 条时：

1. `_buildTradeListAndCleared()` 全量 map + sort
2. `setData({ completeTrades })` 传递完整数组到渲染层
3. WXML `wx:for` 即使有 `wx:if` 隐藏也需遍历

### 设计

#### C1. stats 页 completeTrades 虚拟列表

在 stats 页添加分页加载：

```javascript
// stats.js data 新增
data: {
    // ... 已有
    tradesDisplayCount: 30,
    tradesLoadingMore: false,
}
```

```javascript
// stats.js 方法新增
_loadMoreTrades() {
    const current = this.data.tradesDisplayCount;
    const all = this._allCompleteTrades || [];
    if (current >= all.length) return;
    const newCount = Math.min(current + 30, all.length);
    this.setData({
        tradesDisplayCount: newCount,
        completeTrades: all.slice(0, newCount),
    });
}
```

WXML 中触发加载更多：

```xml
<view wx:if="{{completeTrades.length < _allCompleteTrades.length}}"
      class="load-more-btn" bindtap="_loadMoreTrades">
    加载更多 ({{completeTrades.length}}/{{_allCompleteTrades.length}})
</view>
```

#### C2. 年报延迟计算

将 `onOpenAnnualReport` 拆分为首屏 + 延迟：

```javascript
async onOpenAnnualReport() {
    if (this._annualReportCache && !this._statsDirty) {
        this.setData({
            showAnnualReport: true,
            annualReportData: this._annualReportCache,
        });
        return;
    }

    // 首屏：快速展示基础数据
    const quickData = this._buildQuickAnnualReport();
    this.setData({
        showAnnualReport: true,
        annualReportData: quickData,
    });

    // 延迟：计算 XIRR 等昂贵指标
    const fullData = await this._buildFullAnnualReport();
    this._annualReportCache = fullData;
    this.setData({ annualReportData: fullData });
}

_buildQuickAnnualReport() {
    // 只计算交易次数/金额/盈亏，不做 XIRR
    // 复用 this._positionsCache（已有）
}

async _buildFullAnnualReport() {
    // XIRR 计算 + 策略统计（已有逻辑）
}
```

#### C3. 交易列表格式化惰性化

当数据量 > 100 条时，`_buildTradeListAndCleared` 改为只格式化可见部分：

```javascript
// stats.js
_buildTradeListAndCleared() {
    // ... positions 计算不变

    // 构建轻量引用数组（不格式化）
    const rawTrades = this._buildRawTradeRefs(); // O(n) 但不创建完整对象
    const allSorted = rawTrades.sort((a, b) => b._sortKey - a._sortKey);
    this._allTradeRefs = allSorted;

    // 只格式化可见部分
    const initialSlice = allSorted.slice(0, 30);
    const completeTrades = initialSlice.map((ref) => this._formatTradeView(ref));

    // clearedPositions 计算（不变）

    return { completeTrades, clearedPositions };
}
```

### 收益

| 场景 | 当前 | 优化后 |
|------|------|--------|
| stats 加载 200+ 交易 | 全量格式化 ~80ms | 首屏格式化 30 条 ~12ms |
| 打开年报 | 阻塞全部算完 ~200ms | 首屏 50ms + 延迟补全 |
| 加载更多交互 | 无 | 按需格式化 |

---

## 实施顺序

| 顺序 | 方案 | 改动文件 | 验证方式 |
|------|------|----------|----------|
| 1 | A - DateIndex | +`dateIndex.js`, `transaction.js`, `xirrService.js`, `statsService.js`, `stats.js` | npm test + 手动验证 XIRR/年报 |
| 2 | B - computedCache | +`computedCache.js`, `cacheManager.js`, `statsService.js`, `xirrService.js`, `app.js` | npm test + 冷启动验证 |
| 3 | C - 虚拟列表 | `stats.js`, `stats.wxml` | 手动验证长列表流畅度 |

---

## 新增文件清单

| 文件 | 用途 |
|------|------|
| `utils/models/dateIndex.js` | 按日期排序的二分索引 |
| `utils/cache/computedCache.js` | 计算结果持久化缓存 |

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `utils/models/transaction.js` | 写操作后 invalidate dateIndex |
| `utils/services/xirrService.js` | 使用 DateIndex；getTotalXIRR 加磁盘缓存 |
| `utils/services/statsService.js` | getByDateRange 改用 DateIndex；getTotalStats 加磁盘缓存 |
| `utils/cache/cacheManager.js` | markDataDirty 调用 bumpVersion |
| `pages/stats/stats.js` | 虚拟列表 + 年报延迟计算 |
| `pages/stats/stats.wxml` | 加载更多按钮 |
| `app.js` | onLaunch 预热缓存 |

---

## 测试计划

### 新增测试

| 测试文件 | 内容 |
|----------|------|
| `tests/dateIndex.test.js` | 二分查找正确性、范围查询准确性、invalidate 重建 |
| `tests/computedCache.test.js` | 读写、版本过期、clearAll |

### 回归测试

- 现有 `npm test` 全部通过
- 手动验证：年报/XIRR/周期统计/流水筛选

---

## 风险评估

| 风险 | 缓解措施 |
|------|----------|
| DateIndex 与 Date 对象时区偏差 | 统一用 _sortKey（UTC 毫秒），不依赖字符串比较 |
| 磁盘缓存版本不一致 | bumpVersion 在所有写路径调用；fallback 到重算 |
| 虚拟列表 WXML 复杂度 | 首屏直接 setData 切片，不做 premature optimization |
| 旧数据无 _sortKey | entityFactory 已预计算；老数据有 fallback |

---

## 总工作量估算

| 模块 | 行数 |
|------|------|
| dateIndex.js | ~80 |
| computedCache.js | ~70 |
| 索引集成（transaction + services）| ~30 |
| 虚拟列表 + 延迟计算 | ~60 |
| 测试 | ~120 |
| 总计 | ~360 行 |