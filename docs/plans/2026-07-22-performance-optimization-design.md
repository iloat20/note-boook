# 茄子笔记本（note-boook）· 性能优化真实瓶颈报告

> **日期**：2026-07-22
> **作者**：WorkBuddy（基于 brainstorming 流程，用户提供「全栈 8 层性能优化」需求后收敛为「项目真实瓶颈报告」）
> **校准原则**：以 **2026-07-22 当前代码事实** 为准；沿用 `docs/improvement-master-report-2026-07-21.md` 的「文档漂移须以代码为准」原则。
> **配套文档**：`PERFORMANCE_AUDIT.md`(06-20)、`docs/improvement-master-report-2026-07-21.md`、`docs/performance-optimization-plan-2026-07-21.md`、`docs/perf/performance-optimization-design.md`、`docs/architecture-review-2026-07-20.md`

---

## 〇、报告定位（必读）

用户原始需求是一份标准「全栈 Web 服务」的 8 层性能优化清单（前端资源/渲染/后端逻辑/数据库/缓存/网络/基础设施/容器化）。

**本项目是纯客户端微信小程序**：所有数据在 `wx.setStorageSync` 本地，唯一网络请求是拉腾讯财经行情（`qt.gtimg.cn`），**没有后端、没有数据库、没有服务器、没有容器**。因此这份清单里约一半层级在本项目物理上不存在，硬写只会产出脱离代码的「水文」。

本报告的价值在于：
1. **逐层判定 N/A**：把用户 8 层需求映射到本项目事实，明确哪些不适用、为什么。
2. **复用既有优化谱系**：项目已有完整性能优化史（见第二节），避免重复造轮子。
3. **以当前代码校准**：复核发现上一轮方案（7-21）Top5 中有 2 项在当前代码已修复（doc drift），不再重复。
4. **补齐空白**：既有文档普遍低估「网络/缓存层」与「可测量指标」，本报告重点补这两块，并给出**优化前后指标对照 + 验证方法**（用户明确要求，既有文档偏弱）。

---

## 一、逐层判定表（用户 8 层需求 → 本项目事实）

| 用户要求的层 | 本项目结论 | 依据（代码事实） |
|---|---|---|
| 前端资源加载 | ✅ 已基本到位 | 分包 + `lazyCodeLoading:"requiredComponents"`（`app.json:46`）+ `componentFramework:"glass-easel"`（:47）+ SVG 矢量图 + 无图表库；主包运行时代码 ≈ **660KB**（pages 175K + utils 293K + components 91K + 其他 ≈100K），分包 57K/53K，远低于微信 2MB/包、20MB 总量限制 |
| 渲染性能(setData) | ✅ 大头已做 | 持仓三数组移出 `data`、删除 `animateAllValues` 逐帧 setData、`onShow` 行情 30s 节流、价格局部更新（`_applyPriceResults`）、手势/拖拽 rAF 节流 |
| 后端代码逻辑 | ⛔ **N/A** | 纯客户端，无后端、无服务端代码；唯一的「逻辑」是客户端 JS，其并发/算法已在行情请求层处理（见缓存/网络层） |
| 数据库优化 | ⛔ **N/A** | 无数据库；本地 KV 存储无查询优化器。「索引」等价物（`transactionIndex`/`dateIndex`）已是「写时 invalidate、查时惰性一次性 O(n) 重建」，非热路径 |
| 缓存层设计 | 🟡 可补 3 处 | 已有 3 级 LRU（`position`/`stats`/`mem`）+ `PriceCache` TTL + `deepFreeze` 只读契约；缺「负结果缓存 / 请求合并 / TTL 抖动」 |
| 网络传输 | 🟡 可补 2 处 | 已有批量(40/请求)/并发(5)/指数退避重试/GBK 解码；CDN/HTTP2 由微信托管我们无法控制；缺「负结果缓存 / 请求合并」 |
| 基础设施 | ⛔ **N/A** | 无容器/负载均衡/自建监控；上传即微信托管，监控用微信后台 |
| 容器化部署 | ⛔ **N/A** | 同上；小程序没有「容器化部署」概念 |

> **一句话**：你清单里约一半（后端/数据库/基础设施/容器化）在此不存在；真正还能榨性能的，是「缓存层 + 网络层」的 3 个具体点，以及既有文档已识别但**当前代码仍真实存在**的少数渲染/存储项。

---

## 二、既有优化谱系（已完成，不重复做）

性能优化史（按时间）：`PERFORMANCE_AUDIT.md`(06-20) 识别 P0/P1 → 7/14–7/20 批次修复 → `improvement-master-report`(07-21) 判定「性能已达标，转 P3 维护」→ `performance-optimization-plan`(07-21) 第二轮 Top5 → `perf/performance-optimization-design.md`（stats/XIRR 草稿，DRAFT）。

**已落地且本次不再触碰的关键项**（证据见 `architecture-review-2026-07-20.md` 第十三节，`npm test` 177 passed、biome lint 0 error/0 warning）：

| 项 | 状态 | 证据 |
|---|---|---|
| 首页持仓三数组冗余 | ✅ | `positions`/`_allPositions` 移出 `data`，挂 `this._*`，配 `id→index` Map（O(1)） |
| `animateAllValues` 50 次 setData | ✅ | 直接写终值（`index.js:422-428`） |
| `onShow` 行情节流 | ✅ | 30s 节流（`index.js:182`）+ 仅主动提交用 `force:true` |
| 外部行情 Provider 抽象 | ✅ | `TencentPriceProvider` + `TENCENT_FIELD` 具名常量（`stockPrice.js`） |
| 运行时死代码清理 | ✅ | `computedCache`/`heatmap`/`periodStats` 等相关代码已删 |
| 兄弟 model 循环依赖 | ✅ | 索引改读 `storageCore`，不再 `require` 兄弟 `Transaction` |
| 分包预加载收敛 | ✅ | 仅 `index` 预加载 `packageDetail`（`app.json:13-17`） |
| 隐藏 canvas 常驻 | ✅ | 分享 canvas 按需 `wx:if="{{generatingShare}}"`（`index.wxml:210`） |
| 列表 stagger 入场动画 | ⏸ 刻意保留 | `improvement-master-report` 明确决策：仅 CSS 合成器驱动、一次性，移除反损观感 |
| stats 页强制 `force=true` 冲缓存 | ✅ **本次复核新确认** | 当前 `stats.js:34-43` 传 `wasDirty`，`_computeAllPositions(forceRefresh)` 透传 `getAllPositions(forceRefresh)`，已非硬编码 `true` |
| 拖拽排序无 rAF | ✅ **本次复核新确认** | 当前 `index.js:1071-1086` `onDragMove` 已用 `setTimeout(16)` 合并为每帧一次 setData |

> ⚠️ **doc drift 警示**：`docs/performance-optimization-plan-2026-07-21.md` 的 Top5 中 #1（stats force）与 #2（拖拽 rAF）**在当前代码中已修复**，本报告的「待做清单」不再列入，以免重复劳动。

---

## 三、按模块现状实测（逐一分析）

### 3.1 首页持仓页（`pages/index/index.js`）
- **现状**：数据三冗余已消除、30s 节流已落地、单只改价走 `_applyPriceResults` 局部更新（不整页重建）。渲染层当前状态良好。
- **瓶颈（仍真实）**：
  - **(C) 单点操作触发整页 `_loadData`**：`updatePrice`(:532)、`saveAssetMeta`(:1003)、`togglePin`(:1038)、`onDragEnd`(:1120)、`onSwipeDelete` 回调(:915) 均调 `this.refresh()` → 全量重读 `getAllPositions` + `Transaction.getAll` + 重建 `formattedPositions` + marketAgg + 重过滤，O(持仓+交易)。改一只价格/备注/置顶却全量重建。
  - **(C 子项) `_applyPriceResults` 聚合重建**：每次价格刷新（含自动刷新每 30s）对**全部持仓**做两遍 O(n) 扫描重建 `marketAgg`（`index.js:762-802`）。应改为在遍历 `validResults` 时增量累加。
- **状态**：渲染主体已优；C 为剩余真实瓶颈。

### 3.2 统计页（`pages/stats/stats.js`）
- **现状**：`force=true` 冲缓存问题已修复（见第二节）。`onShow` 复用 `pageMixin` 的 dirty 判定。
- **瓶颈**：
  - **(F) `statsService` 多遍扫描**：`getPeriodStatsList("MONTH",12)` 对每周期各调一次 `calcStatsForRange`，每次 `transactions.filter` + `dividends.filter` → O(交易×周期×4)。200 笔 × 12 月 ≈ 2400 次全扫（见 `perf/performance-optimization-design.md`）。应单遍分桶。
  - **(G, P3) 重模块同步 require**：`onLoad` 顶部同步 require `shareHelper`(含 canvas)/`exporters(markdown/csv)`/`exportDetailImage`；切到统计 tab 首次加载即付出这些成本。应改为按需（参考 `index.js` 的 `_ensureShareModule` 风格）。
- **状态**：缓存冲撞已修；F 真实待做，G 低优。

### 3.3 历史页（`pages/history/history.js`）
- **瓶颈（沿用 7-21 #5，待复核）**：`_applyFilters` 每次切筛选 tab / 搜索输入（防抖后）都 O(总记录数) 重建 `grouped` 字典 + 数组。建议缓存「无关键字」分组基线，搜索只在基线上 filter。
- **状态**：现状待对当前 `history.js` 复核确认，方向成立。

### 3.4 行情网络（`utils/services/stockPrice.js`）
- **现状**：并发 5（`MAX_CONCURRENT_REQUESTS`）、重试 2 次指数退避、批量 40/请求（`BATCH_SIZE`）、请求节流队列（`_executeWithThrottle`）、GBK 解码、15s 超时。健壮性已较好。
- **瓶颈（NEW，未在任何既有文档覆盖）**：
  - **(A) 负结果无缓存**：已知无效代码（停牌/非交易日/无效代码）每次刷新都重新请求 `qt.gtimg.cn`，返回 null 后再抛弃。`fetchStockPrice` 已对无效结果 `resolve(null)` 不重试，但**下次刷新仍会再打一次网络**。
  - **(B) 并发请求未合并**：若两个组件/页面几乎同时调 `_fetchPrices`（如首页自动刷新 + 用户手动下拉），会对同一批股票发重复网络请求。缺 in-flight 去重。
- **状态**：健壮性优；A/B 为真实新增瓶颈。

### 3.5 存储与缓存（`storageCore/core.js` / `cacheManager.js` / `PriceCache.js`）
- **现状**：3 级 LRU（`position`100 / `stats`20 / `mem`100）、`markDataDirty` 支持 `stockId` 粒度、`deepFreeze` 只读契约（`getData`/`saveData` 均冻结，防缓存污染）、`PriceCache` 30 分钟 TTL（`PRICE_TTL_MS`）。
- **瓶颈**：
  - **(D) `deepFreeze` 每写仍 O(N) 遍历**：`saveData` → `deepFreeze(data)` 对整份数组逐元素 `Object.isFrozen` 短路（已冻结跳过递归，但**仍遍历 N 个元素**）。N 大且写入频繁时累积成本。建议改为「浅冻结顶层 + 仅冻结本次新增/改动那条」，或仅读路径冻结。
  - **(A 子项) `PriceCache.set` 全量拷贝**：单只 `set` 做 `{...this.getAll()}` 全量拷贝 + `saveData`；批量已用 `setBatch`（优），但单点改价路径（`updatePrice`）走 `PriceCache.set`（见 3.1）——可与负结果缓存一并优化。
- **状态**：缓存架构优；D 为真实但低优（数据量大时升中）。

### 3.6 组件与通用（`components/` / `touchGestureMixin`）
- **现状**：滑动手势 `rafThrottle` + `requestAnimationFrame`；拖拽已 rAF 节流（见第二节）。
- **瓶颈**：无显著项。

### 3.7 构建与加载（`app.json` / 分包）
- **现状**：`lazyCodeLoading` + `glass-easel` + 分包 + 预加载已收敛。
- **实测**：主包运行时代码 ≈ 660KB（见第一节），远未触限。**包体积不是瓶颈**。
- **瓶颈**：无（可选 CSS 按页拆分，ROI 极低，需微信开发者工具「代码依赖分析」验证未引用类）。

---

## 四、真实剩余瓶颈清单（按 ROI 排序，附代码位置与改法）

> 下表中 A/B 为本次新识别（既有文档未覆盖）；C/D/E/F 源自 7-21 方案或 perf/ 草稿，经本次代码校准后保留；G/H 为低优/可选。

### A 🟢 负结果缓存（网络/缓存）— ROI 高、成本低
- **现象**：已知无效代码（停牌/非交易日/无效代码）每次刷新重复打网络返回 null。
- **根因**：`PriceCache.get` 对无效/过期返回 `null`，但**从不记录「此码确认无效」**，`_fetchPrices` 的 `needFetch = force ? positions : positions.filter(p => !PriceCache.has(p.id))` 每次都把它放进待请求列表。
- **位置**：`utils/models/PriceCache.js`（`set`/`get`/`has`）+ `pages/index/index.js:658`。
- **改法**：无效结果也写入缓存 `{price:null, negative:true, timestamp:Date.now()}`，短 TTL（如 5min，`NEGATIVE_TTL_MS`）；`has`/`get` 对 negative 条目返回「已缓存无效」，使刷新跳过。注意与正常 TTL 区分，避免永久不刷。
- **风险**：低。需测试「停牌股恢复交易后能否在 negative TTL 后重新拉到」。
- **✅ 实施状态（2026-07-22）**：已落地。`utils/constants/index.js` 新增 `NEGATIVE_TTL_MS: 5*60*1000`；`PriceCache` 新增 `markNegative`/`setBatchNegative`、`get`/`getBatch`/`has`/`pruneExpired` 按 `entry.negative` 走 `NEGATIVE_TTL`；`pages/index/index.js` 的 `_fetchPrices` 在 `results.__ok !== false` 时把 `price===null` 的 stockId 批量写负结果缓存（网络失败时不写，留待重试）。新增 `tests/priceCache.test.js`（6 用例）。

### B 🟢 请求合并去重（网络/缓存）— ROI 高、成本低
- **现象**：并发 `_fetchPrices` 对同一批股票发重复请求。
- **根因**：`stockPrice.fetchAllPrices` 无 in-flight 去重；并发调用各自建请求。
- **位置**：`utils/services/stockPrice.js`（`fetchAllPrices`/`fetchPriceBatch`）。
- **改法**：维护 `Map<string, Promise>` 按 `stockId` 去重；同一股票在途请求复用同一 Promise；请求完成/失败后清理。配合 A 的负结果，可进一步减少空请求。
- **风险**：低。需测试「快速连续两次刷新不重复发网络」。
- **✅ 实施状态（2026-07-22）**：已落地。`stockPrice.js` 新增模块级 `_pricePromises` Map（按股票列表签名去重），`fetchAllPrices` 复用在途 Promise，`.finally` 结算后清理避免泄漏；原 `fetchPriceBatch` 重命名为内部 `_fetchPriceBatchRaw`，返回 `{results, ok}`，由 `_fetchAllPricesCore` 聚合为数组并在实例上挂 `__ok`（true=网络成功 / false=全重试耗尽），供 A 区分「网络故障」与「代码无行情」。`tests/stockPrice.test.js` 新增「并发同列表仅发 1 次网络」用例。

### C 🟠 单点操作局部更新（渲染/CPU）— ROI 中、含增量聚合
- **现象**：改价/备注/置顶/拖拽落点触发整页 `_loadData`（见 3.1）。
- **根因**：这些单点交互未走局部更新路径，直接 `this.refresh()`。
- **位置**：`pages/index/index.js:532/1003/1038/1120/915`。
- **改法**：
  - 为高频单点操作提供「局部更新」：只更新该 position 在 `displayPositions` 的对应 index（复用现有 `id→index` Map）+ 增量重算 summary，避免整页重建。
  - **增量聚合**：`_applyPriceResults`（`index.js:762-802`）改为在遍历 `validResults` 时增量累加 marketAgg delta（而非两遍全扫全部持仓），复杂度从 O(n) 降为 O(改动数)。自动刷新每 30s 一次，累积收益明显。
- **风险**：中。需保证 summary / 占比条与局部更新同步（否则汇总与明细不一致）。
- **建议先做**：改价局部化（收益最大、逻辑最独立），其余观察后再推广。

### D 🟠 `deepFreeze` 浅冻结（存储）— ROI 中（数据量大时高）
- **现象**：每存一条记录都对整份数组逐元素遍历冻结，O(N)。
- **根因**：`saveData` → `deepFreeze(data)` 遍历 N 个元素（`core.js:90-108`），虽对已冻结元素短路递归，但遍历本身 O(N)。
- **位置**：`utils/storageCore/core.js:115-121`。
- **改法（渐进，低风险优先）**：
  - A（推荐）：只 `Object.freeze(data)` 顶层 + 冻结本次新增/改动的那一条；历史元素仅首次读时冻结（加 `_frozen` 标记跳过）。
  - B：仅读路径冻结、写路径不冻结；或 C：开发环境 deep、生产环境浅冻结（`__DEV__` 门控）。
- **风险**：中。改只读契约需回归 `tests/memory.test.js` + 各 model 测试，确认无缓存污染回归。**独立提交 + 全量跑测试**。

### E 🟡 历史页筛选基线缓存（渲染）— 待复核
- **现象**：每次筛选/搜索全量重建分组字典。
- **位置**：`pages/history/history.js:_applyFilters`（沿用 7-21 #5，需对当前代码复核）。
- **改法**：缓存「无关键字」分组基线，搜索/筛选只在基线上 filter；避免每次按键全量重分组。
- **风险**：低-中。需保证 `mergeRelated` 与 `collectFilterIds` 在过滤后仍正确。

### F 🟡 `statsService` 单遍分桶 + XIRR 单遍 + logger（统计/CPU）
- **现象**：`getPeriodStatsList` O(交易×周期×4) 冗余扫描；`_buildCashFlowsCore` 3 遍 forEach。
- **位置**：`utils/services/statsService.js`、`utils/services/xirrService.js`。
- **改法**：新增 `_buildPeriodIndex` 单遍分桶（`statsService`）；XIRR 合并为单遍；用 `utils/helpers/logger.js` 替换 17 处裸 `console.*`（生产默认 `warn` 级，抑制 `log/info/debug`）。
- **风险**：中。需保证分桶后 `label/buyAmount/sellAmount/pnL/dividendIncome` 与基线一致。详见 `docs/perf/performance-optimization-design.md`（已有完整设计）。

### G ⚪ stats 重模块延迟加载（前端加载）— P3 低优
- **现象**：`stats.js:1-15` 顶部同步 require `shareHelper`(含 canvas)/`exporters`/`exportDetailImage`。
- **改法**：改为 `_ensureShareModule`/`_ensureExportModule` 按需加载（导出按钮触发），降低切到统计 tab 的首次成本。
- **风险**：低。

### H ⚪ TTL 抖动 / CSS 拆分（缓存/前端）— P3 可选
- **现象**：所有价格缓存同时写入 → 倾向同时过期 → 刷新瞬间集中回源（单用户场景影响小）。
- **改法**：TTL 加随机抖动（±10%）。CSS 按页拆分（需微信开发者工具「代码依赖分析」验证未引用类）。
- **风险**：极低。

---

## 五、优化前后性能对比指标（可测）

> 小程序无法跑 Lighthouse；下列指标均用「微信开发者工具 + Jest + 轻量埋点」可实测。基线值为实测或基于当前代码的合理估算。

| 指标 | 当前基线 | 优化后预期 | 测量方式 |
|---|---|---|---|
| 主包体积 | ≈ 660KB（运行时代码） | 基本不变；G 降低统计 tab 首屏 JS 解析成本 | `du -sh pages utils components ...` |
| setData 节点数（持仓首屏） | 已降 60%+（数据冗余修复后） | C 增量聚合后再降刷新类 setData 节点 | 包装 `Page.prototype.setData`，统计 key 数/序列化字节 |
| 每次刷新网络请求数 | 无效代码每次都请求；并发会重复 | A+B 后：无效代码刷新趋近 0；并发重复请求消除 | 包装 `wx.request` 计数（dev-only） |
| 价格刷新 p50/p95 | 受并发重复拖累 | B 合并后并发场景重复请求消除，p95 下降 | `stockPrice` 内加 `performance.mark` |
| 聚合/统计计算耗时 | `getPeriodStatsList(12月)` ≈ 2400 次全扫 | F 单遍后 <25% baseline（perf/ 草稿目标） | Jest 微基准（200tx×12月，dev-only `benchmark.js`） |
| 价格刷新 CPU（聚合） | `_applyPriceResults` 每 30s 两遍 O(n) | C 增量后 O(改动数) | Jest 微基准（50/200/500 持仓，断言 <Xms） |
| 写入耗时（冻结） | O(N) 遍历/写 | D 浅冻结后 O(1)~O(改动条数) | Jest 微基准（批量写入 1000 条） |
| 冷启 / 切 tab 流畅度 | 已达标 | G 延迟加载后统计 tab 首屏更稳 | 微信开发者工具 Audits 体验评分 + `wx.getPerformance()` 条目 |

---

## 六、测试与验证方法

### 6.1 单元测试（已有，`npm test`，当前 177 passed）
- 既有：`tests/statsService.test.js`、`tests/stockPrice.test.js`、`tests/memory.test.js`、`tests/storageFree.test.js`、`tests/transactionIndex.test.js`、`tests/xirr.test.js`。
- 新增（对应本次改动）：
  - `PriceCache` 负结果缓存（A）：无效码写入后 `get`/`has` 在 negative TTL 内返回「已缓存无效」，正常 TTL 后恢复。
  - `stockPrice` 请求合并（B）：快速连续两次 `fetchAllPrices` 同一批股票，断言 `wx.request` mock 仅被调用一次。
  - `deepFreeze` 浅冻结（D）：回归 `tests/memory.test.js` 确认无缓存污染。

### 6.2 微基准（dev-only，不进生产路径）
- 新增 `utils/dev/benchmark.js`：合成 50/200/500 持仓，测量 `_applyPriceResults` 增量前后、`getPeriodStatsList` 单遍前后耗时，输出 median/p95。
- 运行：`node utils/dev/benchmark.js`（或 jest 内 `@bench` 标记，仅 dev 跑）。

### 6.3 小程序专属埋点（验证 setData/网络）
- setData 体积：临时包装 `Page.prototype.setData`，累计每次 key 数 + `JSON.stringify` 字节，开发期 `console` 输出。
- 网络计数：临时包装 `wx.request`，统计每次刷新/切 tab 的请求数。
- 完成后移除埋点（或 `__DEV__` 门控），不进生产。

### 6.4 真机 / 开发者工具验证清单
- 微信开发者工具 → 调试器 → **Audits**（体验评分）跑优化前后对比。
- **Performance 面板** 录首屏 / 切 tab / 拖拽，看 setData 频次与长任务。
- 真机：低配安卓验证拖拽跟手、自动刷新不卡顿、统计页打开速度。

---

## 七、实施顺序与风险

| 批次 | 项 | 优先级 | 风险 | 提交策略 |
|---|---|---|---|---|
| **第一批（低风险高收益）** | A 负结果缓存 + B 请求合并 + G stats 延迟加载 | 🟢高 | 低 | 可独立提交，`npm test` 应保持 177→+新增 passed |
| **第二批（需回归）** | C 单点局部更新（先改价）+ D deepFreeze 浅冻结 | 🟠中 | 中 | 独立提交 + 全量测试；C 先做改价局部化观察 |
| **第三批（按需）** | E 历史筛选基线 + F statsService 单遍 + H 可选 | 🟡低-中 | 中 | F 已有 `perf/` 草稿可直接落地 |

**明确不做**（与 `improvement-master-report` 一致，避免过度设计）：
- 不引入虚拟列表（数据规模未到千级，C 的局部更新已够）。
- 不引入图表库/ECharts（保持供应链干净，合规约束）。
- 不引入后端/云同步（纯客户端定位）。

---

## 八、结论

茄子笔记本的性能**主体已在 7/14–7/20 批次与 7-21 主报告中达标**（数据冗余、动画 setData、节流、Provider 抽象、死代码、循环依赖、分包、canvas 按需均已落地）。你清单里的后端/数据库/基础设施/容器化约一半层级在本项目**物理不存在**，硬写无意义。

**真实剩余可榨性能 = 缓存/网络层 2 个新点（负结果缓存、请求合并）+ 渲染/存储层少数仍真实存在的项（单点局部更新、增量聚合、deepFreeze 浅冻结、历史筛选、statsService 单遍）**。其中 A/B 是既有文档从未覆盖、且成本低收益高的「免费午餐」，建议优先落地；指标与验证方法见第五、六节，全部可在微信开发者工具 + Jest 下实测，不画饼。

> 本报告不重复既有优化谱系（见第二节引用），仅以当前代码事实校准并补齐空白。落地前请先对 E（历史页）按当前 `history.js` 复核，确认 doc drift 范围。
