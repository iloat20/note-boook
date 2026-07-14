# 茄子笔记本小程序 — 性能 Bug 核查报告

> 核查时间：2026-07-14
> 方法：systematic-debugging（先验证旧报告、再定位热路径、写失败测试复现、修复、回归）
> 结论：**历史 `PERFORMANCE_AUDIT.md`（2026-06-20）所列问题已基本被近期重构修复；本轮新挖出 1 个真实性能 bug 并已修复。**

---

## 一、基线

- `npm test`：**152 用例 / 23 套件全绿**（含本轮新增 2 例）
- `npx biome check`（formatter disabled）：真实 lint 错误 = 0（其余为 CRLF 行尾预存噪声）

---

## 二、历史性能审计报告已大面积过时（已逐条核对当前代码）

| 原报告项 | 当前状态 | 证据 |
|---------|---------|------|
| P0 #1 持仓三份数据冗余（positions/_allPositions/displayPositions 进 data） | ✅ 已修复 | `index.js:66-69,342-348` 仅 `displayPositions` 进渲染层；`positions`/`_allPositions` 挂 `this._positionsCache`/`this._allPositionsCache` |
| P0 #2 `animateAllValues` 50 次 setData 逐帧动画 | ✅ 已修复 | `index.js:376-382` `displayValues` 直接写终值，无逐帧 setData |
| P1 #3 onShow 每次强制拉行情 | ✅ 已缓解 | `index.js:162-168` 加 30s 节流 `_lastFetchAt`，`force` 仅用户主动操作用 |
| P1 #4 内存缓存被上游污染 | ✅ 已修复 | `core.js` `getData` 返回冻结视图；`markDataDirty` 支持 stockId 粒度清除（`cacheManager.js:48-53`） |
| P2.1 首页常驻隐藏 canvas | ✅ 已修复 | `index.wxml:156` 改为 `wx:if="{{generatingShare}}"` 按需挂载 |
| P2.3 3 个 tab 各预加载 2 个分包 | ✅ 已修复 | `app.json:13-17` 仅 `pages/index/index` 预加载 `packageDetail` |
| P3 statsService 整链重算 | ✅ 已修复 | `statsService.js:76,133,260,293,304,338` 使用 `caches.stats`/`caches.periodStats` LRU 缓存 |
| P3 `searchStocks` 全量扫描 | ⚠️ 部分（见下「新 bug」） | 原有逐键同步全扫描问题，本轮已加防抖 |

> 建议：将 `PERFORMANCE_AUDIT.md` 标注为「已落地/过时」，避免后续维护被误导。

---

## 三、本轮新挖出的真实性能 Bug 🔴（已修复）

### 问题：quick-record 价格探测重复发网络请求 + 联想搜索逐键全扫描

**位置**：`components/quick-record/quick-record.js`

**根因**：
1. `onQrCodeInput` 在每次形成有效代码时**同时**调用：
   - `_scheduleAutoFetch(formatted)`（防抖 500ms 后 `fetchStockPrice`）
   - `_probeStockPrice(market, formatted)`（**立即** `fetchStockPrice`）
   
   二者对同一代码各发一次 `fetchStockPrice`。复现输入 `600000` → 旧代码产生 **2 次相同网络请求**（1 次立即 probe + 1 次防抖 autoFetch）。
2. `_probeStockPrice` 在**每个中间有效代码**都会立即发请求（如美股 1–5 字母逐个输入 = 最多 5 次请求），且 `onQrCodeBlur` 又叠加了一次 `_probeStockPrice`，与 `_tryAutoFetch` 重复。
3. `searchStocks` 在 `onQrCodeInput` 中**逐键同步全量扫描**本地持仓（`Stock.getAll()` + 合并 + filter + sort），无防抖，大持仓量下造成输入卡顿。

**影响**：弱网下重复请求易触发行情 API 限流、价格探测不稳定、浪费带宽；联想搜索逐键全扫描造成输入延迟。

**修复**：
- 移除 `onQrCodeInput` / `onQrCodeBlur` 中的立即 `_probeStockPrice` 调用，价格探测统一走防抖的 `_scheduleAutoFetch`（对同一代码仅 1 次请求）。
- 将「代码无效」提示从 `_probeStockPrice` 迁移进 `_tryAutoFetch` 的 `.then` 分支（仅当代码未变化且无效时 toast），保留原 UX 反馈。
- 删除已无引用的 `_probeStockPrice` 方法（连同 `_afProbe` 死状态）。
- `searchStocks` 改为 `_scheduleSuggest` **200ms 防抖**，避免逐键全扫描。

**验证**：
- 新增回归测试 `tests/quickRecord.priceFetch.test.js`（2 例）：输入 `600000` 断言 `fetchStockPrice` 调用次数 = 1（先红后绿）。
- `npm test` 全绿（152/152）；`biome check` 该文件 0 真实错误。

---

## 四、次要观察（低优先级，未改）

1. `_fetchPrices`（`index.js:663-691`）每次价格刷新对 `allCache` 做 2 次全量遍历重建市场聚合，属 O(n)，小数据量无感；如需极致可改为增量更新。
2. `PriceCache.set`（`priceCache.js:20-29`）每次单只价格更新都 `{...getAll()}` 展开全量对象并同步 `saveData`，O(n) 复制；批量更新已走 `setBatch`（优）。单只 `updatePrice` 路径影响极小。
3. `markdown.js:39` / `stats.js:39` 的 `[...arr].sort(...)` 结果未回写（死代码，前轮已记录），非性能关键。

---

## 五、建议的后续动作

- 将 `PERFORMANCE_AUDIT.md` 标注过时。
- 若要做彻底的性能收口，可对 `quick-record` 的价格探测再补一条「并发相同代码去重」单测（当前依赖防抖已足够）。
- 年度报告 canvas 绘制链路本次未深入（纯 CSS 渲染，风险低）。

---

_完整变更：_`components/quick-record/quick-record.js`（去重网络请求 + 联想搜索防抖）、`tests/quickRecord.priceFetch.test.js`（新增回归测试）。
