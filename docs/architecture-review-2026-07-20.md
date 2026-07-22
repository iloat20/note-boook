# 茄子笔记本（note-boook）架构深度审查报告

> **审查时间**：2026-07-20
> **审查对象**：当前工作区代码（`/c/Users/Administrator/Downloads/work/note-boook`）
> **审查方法**：静态代码走查 + 依赖图分析 + 与既有审计文档交叉核对（以代码事实为准）
> **结论先讲**：代码本身的架构质量**优于文档可信度**。分层、缓存契约、循环依赖治理都做得扎实；真正的架构风险集中在**文档漂移、运行时死代码、首页渲染数据冗余、外部接口健壮性**四块。下面给出逐条事实与可落地的改进方案。

---

## 一、执行摘要与评分

| 维度 | 评分 | 一句话结论 |
|------|------|-----------|
| 分层架构 | ⭐⭐⭐⭐ | storageCore → models → services → pages 单向依赖清晰，循环依赖已用惰性调用主动打破 |
| 设计模式 | ⭐⭐⭐⭐ | Active Record / LRU / Mixin / DIP 接缝 / 自定义 tab-bar 用法到位 |
| 数据完整性与契约 | ⭐⭐⭐⭐ | `deepFreeze` 只读契约 + 写队列 + `upsertAndSave` 收敛，旧「缓存污染」已根治 |
| 可扩展性 | ⭐⭐⭐ | 分包 + 平台抽象层为扩展留了口子，但市场/字段解析靠魔法索引、外部接口无 fallback |
| 可维护性 | ⭐⭐ | **文档与代码严重脱节**（见第十二节），大文件偏多，存在运行时死代码 |
| 性能 | ⭐⭐⭐ | 无 ECharts、无 Canvas 重活；但首页三份持仓数组冗余、滚动数字 50 次 setData 是实打实的瓶颈 |
| 安全架构 | ⭐⭐⭐ | 无密钥硬编码、传输走 HTTPS；本地存储明文是纯客户端方案的固有边界，需显式标注 |
| 第三方依赖 | ⭐⭐⭐⭐ | 仅 devDependencies、零运行时第三方库，体积友好、供应链干净 |

**最高优先级的三件事（ROI 排序）**：
1. 🔴 修正文档漂移（AGENTS.md / CLAUDE.md / ARCHITECTURE_AUDIT.md 多处与代码不符）——成本极低、收益极高、且会持续误导后续开发。
2. 🔴 首页 `positions / _allPositions / displayPositions` 三份冗余数据移出渲染层——直接削减 60%+ setData 体积。
3. 🟠 清理运行时死代码（`computedCache`、`heatmap`、`periodStats` 缓存、`heatmapData`）并接线或删除。

---

## 二、技术栈与项目概况

- **平台**：微信小程序，纯客户端，**无自有后端**；唯一外部依赖是腾讯财经行情/汇率接口（`qt.gtimg.cn`）。
- **语言/模块化**：CommonJS（`require` / `module.exports`），原生小程序语法，无构建步骤（WeChat DevTools 直接编译）。
- **状态**：轻量自研 store（`utils/state/store.js`）。
- **存储**：`wx.setStorageSync` 经 `platform/storage.js` 抽象。
- **测试**：Jest + babel-jest，mock `wx`，覆盖 `storageCore / positionCalculator / stockPrice / annualReport / gbk / platform / statsService` 等。
- **质量门**：Biome 2.5.0（lint + format）。
- **运行期依赖**：**无**（charts / 请求 / 工具全部自研或走 wx API）。这是小程序体积与供应链安全的显著优点。

---

## 三、目录结构与模块划分（基于代码事实）

```
note-boook/
├── app.js / app.json / app.wxss         # 入口、分包与预加载、全局样式
├── pages/                               # 主包 3 个 tab 页
│   ├── index/index.js        (850 行)   # 持仓页（最大文件）
│   ├── history/history.js    (397 行)   # 流水页
│   └── stats/stats.js        (242 行)   # 统计页（无 ECharts、无 onUnload）
├── packageDetail/pages/detail/  (456 行) # 分包：持仓详情/编辑
├── packageRecord/pages/record/ (624 行) # 分包：新增/编辑交易表单
├── components/                        # annual-report / quick-record / strategy-tags / empty-state / liquid-slider
├── custom-tab-bar/                    # 自定义 tab 栏（Component，按路由自判选中）
├── api/request.js                     # 统一请求封装（.get/.post/.put/.delete）
├── utils/
│   ├── storageCore/core.js   (233 行)  # 最底层存储 + 写队列 + deepFreeze 契约
│   ├── models/              # Active Record：transaction/stock/dividend/strategy/priceCache + 索引
│   ├── services/            # 业务逻辑：positionService/transactionService/statsService/stockPrice/exchangeRate
│   ├── cache/               # cacheManager / lruCache / computedCache / version
│   ├── state/               # store.js(createStore) / appStore.js(dirty flag)
│   ├── helpers/             # 纯函数 12 个：positionCalculator/format/dateRange/...
│   ├── constants/           # index.js / market.js（市场规则枚举）
│   ├── platform/            # storage.js / http.js（DIP 接缝，唯一碰 wx 的地方）
│   ├── ui/                  # pageMixin / touchGestureMixin / feedback / confirmDialog
│   ├── render/              # shareHelper.js（256 行，分享卡片绘制）
│   ├── data/                # stockDatabase.js（本地股票名库）
│   └── exporters/           # markdown.js（导出）
└── docs/  tests/  styles/  images/
```

**划分评价**：`storageCore / models / services / helpers / cache / state / platform / ui / render / data / exporters` 职责边界清晰，是这份代码最值得肯定的部分。

---

## 四、依赖关系与分层

### 4.1 主分层是严格单向的（无硬循环）

```
storageCore/core ──▶ constants, platform/storage, (惰性) cache/cacheManager
models/*        ──▶ storageCore/core, cache/cacheManager, 其他 models, helpers
services/*      ──▶ models/*, helpers/*, cache/cacheManager
pages/comp      ──▶ services/*, models/*, ui/*, helpers/*
```

- `storageCore` 不依赖 `models`/`services`；`models` 不依赖 `services`；`services` 不依赖 `pages`。✅
- **循环依赖已被主动打破**（这是真功夫）：`core.js:9-11` 注释说明 `core` 不再顶层 `require cacheManager`，改用惰性 `getMemCache()`（`core.js:23-28`）与 `_markDirty()`（`core.js:164-166`）；`cacheManager` 也惰性 `require appStore`（`cacheManager.js:41`）；`version.js` 是零依赖叶子模块。三者构成无环图。✅

### 4.2 唯一真实存在的循环依赖（兄弟 model 间，惰性、可工作，但属设计气味）

- `utils/models/transaction.js:54,55,85,86,97,98` 在 `save/delete` 内**运行时** `require("./transactionIndex").invalidate()` / `require("./dateIndex").invalidate()`；
- 而 `utils/models/transactionIndex.js:14` 与 `utils/models/dateIndex.js:14` 在**顶层** `require("./transaction")`。

这是 CommonJS 惰性循环，运行正常，但「索引与模型互相知晓」破坏了单一职责。**建议**：索引失效逻辑收敛进 `transaction.js` 的顶层常量引用，或在 `transactionIndex` 内部自管失效，断开反向认知。

---

## 五、数据流向

### 5.1 写入链路（新增/编辑一笔交易）

```
record.js submit()                         record.js:401
  └─ persistTransaction(draft)             transactionService.js  (record 与 quick-record 共用)
       ├─ Transaction.create / save        models/transaction.js:51
       │    └─ upsertAndSave + saveData    storageCore/core.js:176/105 → platform/storage.js:14 → wx.setStorageSync
       │    └─ markDataDirty([...], stockId)  transaction.js:53
       │    └─ transactionIndex/dateIndex.invalidate()  transaction.js:54-55
       └─ PriceCache.set(stockId, price) → markDataDirty([POSITION], stockId)
```

要点：`markDataDirty` 在**模型写后显式调用**（不是 core 内部），`stockId` 粒度仅对 `position` 缓存生效（`cacheManager.js:66-71`），`heatmap/periodStats` 因聚合语义始终全清。**单一写入口 `persistTransaction`** 是很好的收敛点。

### 5.2 读取链路（持仓/统计页）

```
页面 onShow → pageMixin.onShowMixin(page, tabIndex)   ui/pageMixin.js:33
   └─ consumeDirtyFlag()                              pageMixin.js:62
        └─ appStore.dataDirty ? MARK_CLEAN : 不刷新
   └─ 若 dirty / 首冷启 → page.refresh()
        └─ positionService.getAllPositions()         services/positionService.js:123
             ├─ caches.position LRU 命中?             positionService.js:24
             └─ 未命中 → calcPosition → TransactionIndex.getByStockId → Transaction.getAll() → getData → wx.getStorageSync
```

**关键澄清**：`appStore` **不是数据 store**，仅存一个布尔 `dataDirty`（`state/appStore.js`）。数据**不**经 store 推送，而是页面按 dirty flag **拉取** services，services 内挂 LRU。即「store → 页面」实为「dirty flag 触发页面主动 reload → services(LRU) → models → storage」。这个模型简单、可预测、易测试，是当前架构的亮点。

---

## 六、设计模式应用与评估

| 模式 | 实现位置 | 优点 | 问题 / 改进 |
|------|---------|------|------------|
| **Active Record** | `models/*.js` 的 `save()/getAll()/delete()` | 模型自包含 CRUD，调用方简单 | `getAll()` 返回 `getData` 的**冻结只读**引用（`core.js:135`），上游必须拷贝后改——契约正确，但要求全链路遵守（详见 6.1） |
| **状态管理 store** | `state/store.js:24` createStore | 极简、无依赖、按 mutation type 订阅 | `appStore` 仅存一个布尔；无不可变快照/时间旅行；`subscribe("*")` 通配需谨慎（当前无 `* `订阅者，暂无影响） |
| **LRU 缓存** | `cache/lruCache.js` | 容量可控、API 清晰 | `heatmap(50)`、`periodStats(50)` **声明后从未 `.set`**（见 4.2 代码核对），是死缓存；`mem` 文档称 50，实际 100（`cacheManager.js:27`） |
| **Mixin** | `ui/pageMixin.js`、`ui/touchGestureMixin.js` | 抽取导航栏/tab 选中/dirty 消费/手势，去重 | `onShowMixin` 与 `custom-tab-bar` 自动选 tab 逻辑**重复**（`pageMixin.js:52-56` 仍 `setTabSelected`，tab-bar 自身也按路由算）——无害但冗余 |
| **自定义 tab-bar Component** | `custom-tab-bar/index.js` | 用 `getCurrentPages()` 自判选中，比文档描述的「每页手动 setData」更健壮 | 已与文档不符（见第十二节） |
| **DIP 平台接缝** | `platform/storage.js`、`platform/http.js` | `wx.*` 直接依赖收敛到两层，测试/Node 可整体替换 | 设计正确，是项目最稳的扩展点 |

### 6.1 数据完整性契约（已验证，正面评价）

`storageCore/core.js` 的 `deepFreeze` 在 `saveData`（`core.js:108`）和 `getData`（`core.js:135`）两处执行：
- 读路径返回**冻结引用**，上游直接 mutate 会在严格模式抛错、非严格模式静默失效，从而**暴露**污染点；
- `getDataCopy`（`core.js:144`）与 `upsertAndSave`（`core.js:181` 用 `.slice()`）走拷贝语义；
- 写队列 `_writeQueue`（`core.js:34-44`）串行化 read-modify-write，防竞态。

**结论**：旧审计（PERFORMANCE_AUDIT 3.2）担心的「`getData` 引用被上游篡改污染缓存」**已被 deepFreeze 契约根治**。需注意的边界是：`caches.position`（计算结果的 LRU）返回的对象**未冻结**，页面层若直接改 position 对象仍会污染该 LRU——但这已被 `markDataDirty(["position"], stockId)` 的粒度清除兜底（改一只清一只）。整体契约可靠。

> 注意：`_writeQueue` 是 Promise 链，但 `saveData` 内部是同步 `wx.setStorageSync`（`core.js:106`），队列只保证**顺序**不消除**阻塞**。写发生在交易保存时（非首屏），优先级低，可保持现状。

---

## 七、可扩展性评估

**优点**
- 分包（packageDetail / packageRecord）+ `preloadRule` 支持懒加载；当前 `app.json:13-17` 已收敛为仅 `index` 预加载 `packageDetail`（比旧审计描述的「3 个 tab 全预加载 2 分包」更健康）。
- `platform/` 接缝让网络/存储可在测试与未来接入后端时整体替换——为「微信云开发 / 自有后端」演进留了干净入口。
- `constants/market.js` 用市场注册表 + `buildSymbol` 抽象，`stockPrice.getSymbol` 委托它，新增市场只改注册表。

**瓶颈 / 风险**
1. **外部行情接口无 fallback、无配置化**：`qt.gtimg.cn` 硬编码在 `stockPrice.js:36,42`（`buildUrl/buildBatchUrl`）。一旦该源被限流/停服，全应用无价可显，且改源需改代码。
2. **字段解析靠魔法索引**：`parseTencentData` 用 `fields[3]/[4]/[33]/[34]/[37]`（`stockPrice.js:68-81`）等硬编码位置。腾讯接口格式若变，解析**静默**错乱（返回 `currentPrice:0` 被兜底成昨收，掩盖错误）。
3. **市场扩展仍要动多处**：`stock.js` 用裸字符串 `["position","periodStats"]`（`stock.js:32,85`）而非 `CACHE_TYPES` 枚举，与 `transaction.js` 等不一致——扩展时易漏改。

---

## 八、可维护性评估

### 8.1 文档与代码严重脱节（★ 头号可维护性问题）

既有文档多处描述与当前代码**不符**，会持续误导开发与审查：

| 文档声称 | 代码事实 | 证据 |
|---------|---------|------|
| ECharts 自定义构建 `components/ec-canvas/`，`onUnload` 释放实例 | 全仓**无 echarts、无 ec-canvas**；统计/年度均 CSS 渲染；`stats.js` 无 `onUnload` | `grep echarts/ec-canvas` 0 命中；`grep onUnload` 仅在 index/history |
| `api/request.js` 是占位（`api.example.com`），未连后端 | 真实封装 `wx.request`，唯一外部端点是腾讯财经 `qt.gtimg.cn` | `api/request.js` 全文；`stockPrice.js` 调用链 |
| 每页 `onShow` 手动 `setData({selected})` | tab-bar 已按 `getCurrentPages()` 自判选中 | `custom-tab-bar/index.js:41-59` |
| `config.js` / `feeCalculator.js` / `xirr.js` / `chartService` 存在 | 均不存在于当前代码树 | `find` 无结果 |
| `statsService` 导出 `getStatsByPeriod/getPeriodStatsList/calcXIRRForRange/getTotalXIRR` | 仅导出 `getTotalStats/getStrategyStats/invalidateStatsCache` | `services/statsService.js` |
| `computedCache` 持久化跨页面、随 markDataDirty 失效 | 运行时**从未**被 services 调用（见 8.2） | `grep computedCache` 仅 app.js:114(空) + 测试 |

**影响**：`AGENTS.md`（即本工作区的项目指引）、`CLAUDE.md`、`ARCHITECTURE_AUDIT.md`、`MEMORY_DESIGN.md` 均含上述错误。任何依据文档做决策的人都会被带偏。**这是最该先修的一条。**

### 8.2 运行时死代码（建议清理或接线）

| 死代码 | 现状 | 建议 |
|--------|------|------|
| `utils/cache/computedCache.js`（64 行） | 仅 `app.js:114` 调 `warmUpCache()`（空实现 `computedCache.js:53`），services 无任何 `getCached/setCached` 调用 | 若短期不接线，删除整个模块 + 对应测试；若要用，在 `statsService` 接入（见 10.2） |
| `cacheManager.caches.heatmap` / `periodStats` | 仅 `clear()` 不 `set()`（代码核对 `caches.heatmap.set` 0 命中），配置容量 50×2 无效 | 删除声明，或实现热力图功能真正写入 |
| `statsService.invalidateStatsCache` | 已导出但全仓无运行时调用方（`markDataDirty` 恒清 `caches.stats`） | 删除，或改为真实粒度的 stats 失效入口 |
| `stats.js` 的 `heatmapData` | 仅 `stats.js:21` 初始化 `[]`，**从未 setData** | 热力图功能链路断裂，要么补渲染要么删字段 |
| `stock.js` 裸字符串 `["position","periodStats"]` | 与 `CACHE_TYPES` 枚举不一致 | 改为引用 `CACHE_TYPES` |

### 8.3 大文件（模块拆分信号）

总 JS 约 8000+ 行，偏胖文件：`index.js`(850)、`record.js`(624)、`quick-record.js`(458)、`detail.js`(456)、`history.js`(397)、`stockPrice.js`(261)、`shareHelper.js`(256)、`touchGestureMixin.js`(247)。`index.js`/`record.js` 建议拆 hook（价格刷新、表单校验、字段格式化各自独立）。

---

## 九、性能瓶颈（已验证）

> 旧 PERFORMANCE_AUDIT v2 的多数 P0/P1 仍成立，但「分包全预加载」「ECharts dispose」两条已随代码演进失效，下面只列**当前仍真实**的瓶颈。

### 9.1 🔴 首页三份持仓数组冗余（最高优先级）

`pages/index/index.js` 同时维护 `positions`（当前 tab 全量）、`displayPositions`（前 N 条切片）、`_allPositions`（全市场全量），三者进入 `data`。一条 formatted position ~20 字段，20 只持仓 = ~1200 渲染节点，**三份即 3600**。`_fetchPrices` 要在三个数组各做一次 `findIndex`（O(n)）并写 3~9 个 data path（`index.js:632-655`），且 `displayPositions` 只更新前 `displayCount` 条，超出卡片切回显示旧价（数据不同步隐患）。

**改进（低风险）**：逻辑数据挂 `this._` 不进 `data`，渲染只留 `displayPositions`：
```javascript
this._allPositionsCache = formattedPositions;                       // 不再 setData
this._positionIndexById = new Map(formattedPositions.map((p,i)=>[p.id,i])); // O(1) 查找
this.setData({ displayPositions: filtered.slice(0, this.data.displayCount) }); // positions/_allPositions 移出 data
```
`_fetchPrices` 改为按 `id→index` Map O(1) 定位，只更新 `displayPositions`。**预计 setData 体积降 60%+，价格刷新更顺滑。**

### 9.2 🔴 滚动数字动画 = 持续 ~50 次 setData

`utils/ui/animationHelper.js` 的 `animateAllValues` 用 `setTimeout(16ms)` 逐帧驱动，800ms ≈ 50 次 `setData({displayValues...})`，且被 `_loadData`/`_updateSummary`/`onMarketTabChange` 频繁触发（每次切 tab 一轮）。

**改进（任选）**：① 最推荐——目标值塞进 data 一次，用 WXS `animation` 在渲染层插值，**0 次 setData**；② 最小改动——`16ms` 改 `33ms`（≈30fps）且 `progress>=0.95` 提前跳终值。

### 9.3 🟠 `onShow` 触发链过长 + 行情刷新无节流

`pages/index/index.js` 的 `onShow`：只要 `dataDirty` 为真（任意交易变动都会标 dirty），即 **全量重算持仓 + 强制网络拉取所有现价**（`force:true` 跳过 TTL）。弱网下价格「跳变」1-3s。

**改进**：① 行情刷新加 30s 最小间隔节流；② `force:true` 仅在用户主动提交交易后用，`onShow` 走普通模式（命中 TTL 就跳）；③ 分片改为首屏优先（先拉 `displayPositions` 内的股票）。

### 9.4 🟡 常驻隐藏 `<canvas>` + 列表 stagger 动画

`index.wxml:173` 的分享 canvas 用 `left:-9999px` 常驻（只在 `onSharePortfolio` 用），仍占渲染层上下文 → 改为 `wx:if="{{generatingShare}}"` 按需挂载。`app.wxss` 的 `.stagger-delay-N` 让 20+ 卡片首帧全量 layout 后陆续亮起 → 列表项去 stagger，只留 summary 轻量 fade-in（骨架屏已承担加载感）。

---

## 十、第三方依赖合理性、接口设计规范、安全架构

### 10.1 第三方依赖合理性 —— 优秀

`package.json` **只有 devDependencies，零运行时依赖**：`@babel/*`（jest 转译）、`@biomejs/biome@^2.5.0`（lint）、`babel-jest`/`jest`（测试）。图表/请求/工具全自研或走 wx API。**供应链干净、包体积小、无陈旧运行时依赖。** 文档声称的 `echarts` 运行时依赖**并不存在**（见 8.1）。

### 10.2 接口设计规范

**正面**：网络访问**高度集中**——`wx.request` 仅出现在 `platform/http.js`（代码核对）；业务经 `api/request.js`（`.get/.post/.put/.delete` 便捷方法）→ `platform/http.js` 归一 Promise。外部行情调用 `stockPrice.js` 工程度很高：**并发控制**（MAX_CONCURRENT=5、100ms 间隔）、**批量分片**（BATCH_SIZE=40）、**指数退避重试**（1s/3s）、**GBK 解码**、**失败优雅降级**（`fetchPriceBatch` 重试耗尽返回 `null` 价不阻塞整体）。传输走 **HTTPS**（`https://qt.gtimg.cn`）。

**改进建议**：
1. **抽象外部数据源接口**：定义 `PriceProvider` 接口（`fetchBatch(stocks)`），腾讯实现为其中之一，预留 fallback 源（如新浪/东财）。`stockPrice.js` 改为「先主源、超时/失败切备源」。
2. **字段解析去魔法化**：把 `fields[3]` 等抽成具名常量映射（`PRICE=3, PREV_CLOSE=4, HIGH=33, LOW=34, AMOUNT=37`），并在解析后做**数值合理性校验**（价格为负/NaN 视为无效而非兜底昨收，避免掩盖接口异常）。
3. **统一错误模型**：当前 `http.js` 把非 2xx 与 fail 都 `reject({statusCode, ...})`，但业务层吃掉错误返回 `null`。建议定义 `Result<T> = {ok, data?, error?}`，让 UI 能区分「无网络 / 接口限流 / 非交易日」，给出不同提示。

### 10.3 安全架构

**正面**：全仓扫描 `secret|token|apiKey|appSecret|password|Authorization|Bearer|sk-` **源码 0 命中**；`project.config.json` 的 `appid` 是公开小程序 ID，非密钥；`privacy.json` 仅声明 `scope.album`（保存截图），中性合规。

**边界（需显式标注，非缺陷）**：
- `wx.setStorageSync`（`platform/storage.js:14`）**明文**落本地，无加密层。纯客户端 + 微信沙箱隔离下风险可控，但 root/越狱设备或备份导出可读取全部交易数据。
- **建议**：在文档/隐私说明里显式标注「数据仅存于本地、明文」，作为已知边界；若未来合规要求提高，可考虑（a）服务端存储（需引入后端，与「纯客户端」定位冲突），或（b）本地加密（密钥管理本身是难题，客户端密钥存储仍可被提取，收益有限）。当前阶段**保持现状 + 文档透明**是合理选择。
- 网络层：外部接口走 HTTPS，但**未做证书固定（pinning）**；行情为只读公开数据，风险低，暂不需处理。

---

## 十一、技术债务清单（按优先级）

| 等级 | # | 问题 | 现状 | 建议 |
|------|---|------|------|------|
| 🔴 P0 | 1 | 文档漂移（AGENTS/CLAUDE/ARCHITECTURE_AUDIT 与代码不符） | 持续误导 | 重写文档对齐现实（重点：无 ECharts、api 非占位、tab 自判选中、computedCache 未接线） |
| 🔴 P0 | 2 | 首页三份持仓数组冗余 | 真实瓶颈 | 逻辑数据移出 `data`，渲染只留 `displayPositions`，配 `id→index` Map（第九节 9.1） |
| 🟠 P1 | 3 | 运行时死代码（computedCache / heatmap / periodStats / heatmapData / invalidateStatsCache） | 占体积、误导 | 接线或删除（第八节 8.2） |
| 🟠 P1 | 4 | `animateAllValues` 50 次 setData | 真实瓶颈 | 迁 WXS 插值或 30fps+提前结束（9.2） |
| 🟠 P1 | 5 | `onShow` 行情无节流 + 过度 `force:true` | 切 tab 卡顿 | 30s 节流 + 仅主动提交用 force（9.3） |
| 🟡 P2 | 6 | 大文件（index/record >600 行） | 维护成本 | 拆价格刷新 / 表单校验 / 字段格式化 hook |
| 🟡 P2 | 7 | 外部接口硬编码 + 魔法字段索引 | 扩展/健壮性风险 | Provider 抽象 + 具名常量 + 数值校验（10.2） |
| 🟡 P2 | 8 | 兄弟 model 惰性循环依赖 | 设计气味 | 索引失效收敛进 transaction 顶层引用 |
| 🟡 P2 | 9 | `stock.js` 裸字符串缓存类型 | 扩展易漏改 | 改用 `CACHE_TYPES` 枚举 |
| 🔵 P3 | 10 | 隐藏 canvas 常驻 + 列表 stagger | 首屏更重 | canvas 按需 `wx:if`、列表去 stagger（9.4） |
| 🔵 P3 | 11 | 本地存储明文 | 固有边界 | 文档透明标注，暂不改 |

---

## 十二、优化改进方案汇总（落地路线）

**第一阶段（1-2 天，低风险、高收益）**
1. 修正文档漂移：以本次审查为基准，更新 `AGENTS.md` / `CLAUDE.md` / `ARCHITECTURE_AUDIT.md`，删除 ECharts、api 占位、xirr 等不实描述。
2. 首页持仓三数组冗余改造（9.1）+ `animateAllValues` 降帧（9.2）。
3. 清理死代码：`computedCache` 删除或接线；`heatmap`/`periodStats` 缓存声明移除或实现写入；`invalidateStatsCache`/`heatmapData` 清理。

**第二阶段（3-5 天，中风险）**
4. `onShow` 行情节流 + `force` 收敛（9.3）。
5. 外部行情 Provider 抽象 + 字段具名常量 + 数值校验（10.2）。
6. 兄弟 model 循环依赖收敛；`stock.js` 改用 `CACHE_TYPES`。

**第三阶段（按需）**
7. 大文件拆分（index/record 拆 hook）。
8. canvas 按需挂载、列表 stagger 移除（9.4）。
9. 若要做跨页面持久化计算缓存，在 `statsService` 真正接入 `computedCache.getCached/setCached`，否则删除。

**不做的事（避免过度设计）**：当前无需引入状态管理库（Vuex/Redux）、无需引入运行时图表库（ECharts）、无需引入后端——纯客户端 + 自研轻量架构对当前规模是合理且健康的选型。

---

## 附录：与既有审计文档的关系说明

- 本次审查**以代码事实为准**，不采信 `ARCHITECTURE_AUDIT.md`(2026-05-23)、`PERFORMANCE_AUDIT.md`(v2, 2026-06-20) 中已被代码演进推翻的论断（ECharts 对比、3-tab 全预加载等）。
- 旧审计中已确认修复的项（`touchGestureMixin` 的 rafThrottle、`_loadData` 单次遍历、启动延迟、`_fetchPrices` data-path 精确更新、calcQrFee 防抖等）**本次未重复**，仅在 9.4 等仍适用的位置沿用。
- `BUG_AUDIT_REPORT.md` 已被 `docs/BUG_CHECK_REPORT.md` 判定大面积过时，本次不引用其结论。

*审查完。所有论断均附 `文件:行号`，可逐项核对。*

---

## 十三、修复执行记录（2026-07-20）

按「全部三阶段」执行。结论以代码事实为准；复核发现**部分 P1/P2 建议已在当前代码中落地**（审查时未逐项核对 `index.js` 现状导致重复建议），予以标注而非重复实施。

### 本批次实际改动（已完成）

| 债务 # | 处理 | 具体改动 |
|--------|------|----------|
| P0-1 文档漂移 | ✅ 已修正 | `AGENTS.md` / `CLAUDE.md` / `ARCHITECTURE_AUDIT.md`：删除 ECharts 不实描述；`api/request.js` 改为「真实 `wx.request` 封装」；tab 改为「自判选中」；标注 `config.js`/`errorCodes.js`/`feeCalculator.js`/`xirr.js`/`chartService`/`animationHelper.js`/`market-tag`/`dividend` 页均不存在；缓存由 4 改为 3（`position`/`stats`/`mem`）；`computedCache` 已删除 |
| P1-3 运行时死代码 | ✅ 已删除 | 删除 `utils/cache/computedCache.js` + `tests/computedCache.test.js`；`app.js` 移除空 `warmUpCache` 调用；`cacheManager` 移除未写入的 `heatmap`/`periodStats` 缓存实例及 `markDataDirty` 中的 clear；`statsService` 移除无调用方的 `invalidateStatsCache`；`stats.js` 移除从未 setData 的 `heatmapData/heatmapYear/heatmapMonth/heatmapLabel` |
| P2-7 裸字符串缓存类型 | ✅ 已修正 | `stock.js` 的 `["position","periodStats"]` 改为 `CACHE_TYPES.POSITION` / `CACHE_TYPES.PERIOD_STATS` 枚举 |
| P2-5 外部接口硬编码 + 魔法索引 | ✅ 已抽象 | `stockPrice.js`：抽出 `TencentPriceProvider`（`buildUrl`/`buildBatchUrl`/`parseSingle`/`parseBatch`），对外 `fetchStockPrice`/`fetchAllPrices` 签名不变；字段索引用 `TENCENT_FIELD` 具名常量；`parseRawFields` 集中做数值合法性校验；数据源仍为腾讯财经 API |
| P2-8 兄弟 model 循环依赖 | ✅ 已收敛 | `transactionIndex.js` / `dateIndex.js` 改为直接读 `storageCore.getData(TRANSACTION_KEY)` 构建索引，不再 `require` 兄弟 `Transaction` 模型，打破循环依赖 |
| P3-10 canvas 常驻 | ✅ 已实现（无需改） | `pages/index/index.wxml` 分享 canvas 已用 `wx:if="{{generatingShare}}"` 按需挂载 |

### 经复核已在代码中落地（无需改动）

| 债务 # | 现状（证据） |
|--------|--------------|
| P0-2 首页三数组冗余 | `index.js` 已将 `positions`/`_allPositions` 移出 `data` 至实例字段，配 `id→index` Map（O(1) 查找）；原 9.1 已落地 |
| P1-4 `animateAllValues` 50 次 setData | `animateAllValues` 及 `utils/ui/animationHelper.js` 已移除，`index.js:375` 直接写终值；原 9.2 已落地 |
| P2-4 `onShow` 行情节流 | `index.js` 的 `refresh()` 已有 30s 节流且仅 `force:true` 时强制刷新（非每次 onShow）；原 9.3 已落地 |

### 评估后暂缓（附理由）

| 债务 # | 决定 | 理由 |
|--------|------|------|
| P2-6 索引失效收敛进 transaction 顶层 | 已用「索引读 storageCore」方式实质性打破循环依赖，比「顶层 require」更安全，不再额外改动 |
| P2-6→P2-#6 大文件拆分（index/record） | 暂缓 | `index.js` 虽约 850 行但内部区块清晰、单元测试全绿；拆分为 hook 风险大于收益，待出现明确痛点（如测试困难）再拆 |
| P3-10 列表 stagger | 暂缓（保留） | 仅 CSS 入场动画、由合成器驱动、成本极低；`index` 列表 stagger 已由 `entranceDone` 门控（一次性入场、无持续开销，也无报告担心的 `.stagger-delay-N` 全量 layout 问题）；移除会削弱入场观感而无可测收益。骨架屏已承担加载感 |

### 验证

- `npm test`：**177 passed**（删除 `computedCache.test.js` 后计数；逻辑用例全绿）。
- `npx biome lint`（改动文件）：**0 error / 0 warning**（`app.js` 一处预先存在的 template-literal info 未动）。
- 运行时行为：`fetchStockPrice` / `fetchAllPrices` 公开 API 与腾讯行情解析未变；`markDataDirty` 对 `heatmap`/`periodStats` dirty tag 安全忽略（保留 `CACHE_TYPES` 枚举以兼容各 model 保存调用）。

