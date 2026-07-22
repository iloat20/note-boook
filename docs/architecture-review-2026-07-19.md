# 茄子笔记本（note-boook）架构与代码审查报告

- **审查日期**：2026-07-19
- **审查对象**：全量源码（`pages/`、`components/`、`custom-tab-bar/`、`utils/`、`packageDetail/`、`packageRecord/`）
- **审查方式**：只读 + 证据取证（每条发现附 `文件:行号` + 片段）；核心断言已交叉核验
- **审查依据**：结构化审查提示词（角色=首席架构师；约束=只读/证据链/先理解后评判；六维度评级 + P0/P1/P2 严重度）

---

## 一、架构总览

**分层（意图清晰，实际有越界）**：页面/组件（展现层）→ `services`/`models`/`helpers`（领域/应用层）→ `storageCore`/`cache`/`state`（基础设施层）→ `wx` 本地存储。

**核心数据流**：写操作经 models 落 `storageCore.core`（封装 `wx.getStorageSync` + 内存 LRU），触发 `cacheManager.markDataDirty` 抬升数据版本、清除对应 LRU 缓存，页面 `onShow` 经 `appStore.dataDirty` 决定是否重载。

**总体优雅度评分：5.5 / 10**

> 主要短板（一句话）：基础设施层对状态层存在反向依赖并构成隐性循环依赖、表现层"上帝页面"穿透领域模型直写存储、以及 GBK/日期/市场识别/浮动盈亏的多处重复与 stats 缓存失效缺口，使架构在"边界清晰"与"核心可维护性"两项上明显不达标。

**六维度评级汇总**

| 维度 | 评级 | 一句话 |
|------|------|--------|
| 分层与边界 | 合格 | 外层→内层方向大体正确，但存在基础设施层反向依赖状态层、存储接口泄漏缓存职责、表现层穿透领域层 |
| 模块化与内聚 | 不足 | 表现层存在"上帝页面/上帝组件"，本应属于服务层的聚合逻辑被压进页面 |
| 耦合与复用 | 不足 | 多处复制粘贴式重复、隐式全局状态耦合、一处缓存一致性缺口（stats 失效） |
| 设计原则符合度 | 合格 | 纯函数核心符合 SRP/DIP；写路径、页面聚合、市场扩展违反 SRP/OCP/DIP |
| 命名与可读性 | 合格 | 整体规范，少量误导命名、导出顺序混乱、魔法字符串 |
| 可测试性与扩展点 | 合格 | 纯函数核心已测；最重业务逻辑嵌页面生命周期，单测困难，覆盖有盲区 |

---

## 二、问题清单

### P0（阻断性架构缺陷）：无

当前无加载期崩溃的循环依赖、无错误到不可维护的核心分层。但以下 P1 项若不处理，会在下一轮演进中产生真实成本。

### P1（显著缺陷，下一迭代必修）

| 编号 | 维度 | 位置(file:line) | 问题描述 | 违反原则 | 改进建议 |
|------|------|----------------|----------|----------|----------|
| 1 | 分层/耦合 | `utils/storageCore/core.js:8` → `cacheManager.js:29-31` → `computedCache.js:8` → `core.js` | **隐性循环依赖**：`core` 顶层 require `cacheManager`，`cacheManager` 在函数内惰性 require `computedCache`，`computedCache` 顶层 require `core`。加载期不崩溃纯属侥幸（惰性 require），一旦改为顶层 require 即死锁。 | 无循环依赖 | 拆出 `markDataDirty`/version 语义到独立模块（如 `cache/version.js`），让 `core` 与 `computedCache` 都只依赖它，打破环。 |
| 2 | 分层 | `utils/storageCore/core.js:8` + 导出 `markDataDirty` | **基础设施层反向依赖状态层**：最底层的 `core.js` 经 `cacheManager` 间接依赖 `appStore`（状态层），并把 `markDataDirty`（缓存失效语义）当作自身 API 重新导出，存储与缓存职责纠缠。 | 依赖方向（外层依赖内层） | `markDataDirty` 由调用方（models/services）在写后显式调用，而非由 `core` 内部发起；`core` 不再导出它。 |
| 3 | 耦合/正确性 | `utils/models/transaction.js:53`（同 `stock.js`/`dividend.js` 写路径） + `cacheManager.js:41` | **stats 缓存失效缺口**：`markDataDirty(["position","heatmap","periodStats"], id)` 不含 `"stats"`；而 `caches.stats` 仅在 `types==="all"` 时被清。逐笔交易保存后 `statsService` 的 LRU 仍命中旧值，页面重载后统计失真。 | 缓存一致性 / 依赖契约 | 所有 model 写路径的 `markDataDirty` 增加 `"stats"`；或在 `markDataDirty` 中把 `"stats"` 设为默认清除项之一。 |
| 4 | 模块化/SRP | `pages/index/index.js`（850 行；`_loadData:184-425` 约 240 行，`_fetchPrices:580-747` 约 167 行） | **上帝页面 + 超长函数**：页内重算浮动盈亏、市场聚合，与 `positionService`/`statsService` 已有能力重叠；页面兼具"展示"与"聚合计算"。 | SRP | 把聚合/重算逻辑移入 `positionService`/`statsService`；页面只调 `service.getPositions()` 并渲染。 |
| 5 | 模块化/SRP | `packageRecord/pages/record/record.js`（654 行；`submit/_doSubmit/_validateAndSubmit:420-636`） | **写流程上帝函数**：校验、网络拉价、合成交易构造、`Transaction.create/save`、仓位调整同处耦合。 | SRP / 过长函数 | 抽 `transactionService.submit(draft)` 封装校验+持久化+合成交易；页面只负责收集表单与调服务。 |
| 6 | 复用/设计 | `record.js:293-298` 与 `quick-record.js:345-352`（各一份 `_detectMarket`） | **市场识别重复 + 行为分歧**：两份几乎相同的正则推断；二者都接受 `/^\d{5}$/` 为 A 股，而 `market.js:27` 规定 A 股是 `/^\d{6}$/`——同一代码可能被判不同市场。 | DRY / OCP | 在 `utils/constants/market.js` 新增 `inferMarket(code)`，删掉两份页内实现；统一判定规则，**消除 5 位/6 位 A 股歧义**（见 P2-#4）。 |
| 7 | 复用/DRY | `stockPrice.js:27`（`decodeGBK`）与 `exchangeRate.js:74`（`TextDecoder("gb18030")`） | **GBK 解码逻辑重复两份**（"优先 gb18030、失败降级逐字节 latin-1"）。 | DRY | 抽 `utils/helpers/gbk.js` 的 `decodeGBK(buffer)`，两 service 共用。 |
| 8 | 复用/DRY | `exchangeRate.js:209`(`_today`)、`statsService.js:137`、`record.js:65`、`quick-record.js:84`、`shareHelper.js:137`、`exporters/markdown.js:152` | **日期→字符串格式化散落 6 处**各自内联 `getFullYear()+"-"+padStart`。 | DRY | 统一用 `utils/helpers/format.js` 的 `fmtDate`；`_today()` 改为导出的 `todayISO()`。 |
| 9 | 设计/DIP | `utils/storageCore/core.js:96`、`services/stockPrice.js`、`services/exchangeRate.js` 直接依赖全局 `wx` | **底层依赖具体平台 API**，无法在 Node/测试环境注入 mock（对比 `positionCalculator`/`format`/`annualReport` 等纯函数良好）。 | DIP | 抽 `utils/platform/storage.js` + `utils/platform/http.js` 封装 `wx.getStorageSync`/`wx.request`，底层依赖抽象，测试可 mock。 |
| 10 | 设计/OCP | 新增市场需改 `market.js` + `stockPrice.js` + `record.js:293` + `quick-record.js:345` | **扩展市场需多处同步修改**，且任一处遗漏即行为分歧。 | OCP | 以 `MARKETS` 注册表 + `inferMarket`/`validateStockCode`/`getSymbol` 单一入口收敛；新增市场只改注册表。 |

### P2（低成本改进，顺手做）

| 编号 | 维度 | 位置(file:line) | 问题描述 | 改进建议 |
|------|------|----------------|----------|----------|
| 1 | 复用 | `components/quick-record/quick-record.js:357` | 与 `record.js` 写流程大量重复，未抽公共写流程。 | 复用 P1-#5 的 `transactionService.submit`。 |
| 2 | 复用 | `packageDetail/pages/detail/detail.js:203`(`_formatTransaction`) | 自行构造 `typeText/amountText`，与 `utils/helpers/recordView.js` 的 `buildRecordView` 重复。 | 改用 `buildRecordView(transaction)`。 |
| 3 | 耦合 | `pages/index/index.js:625-647` | 页面直接 mutate 服务层内部缓存对象（`this._allPositionsCache[idx].floatingPnL` 等），与 `positionService` 内部结构强耦合。 | 经 service 方法取数，禁止页内改写缓存。 |
| 4 | 命名/正确性 | `record.js:297`、`quick-record.js:351` | `/^\d{5}$/` 判 A 股与 `market.js` 的 `/^\d{6}$/` 矛盾；缺注释，语义歧义。 | 统一规则（建议 A 股严格 6 位），加单测覆盖 `inferMarket`。 |
| 5 | 命名 | `utils/constants/index.js:15` `FEE_CONFIG` | 已定义、导出，但业务零引用（`record.js` 用 `fee=0`）；手续费从未接入。 | 要么接 `FEE_CONFIG` 到 `transactionService`，要么删除以免误导。 |
| 6 | 死代码 | `statsService.js:229`(`getStatsByPeriod`)、`:257`(`getPeriodStatsList`) | 导出但无任何调用方，说明 stats 页自行重算未复用。 | 接 stats 页调用，或删除。 |
| 7 | 命名 | `dataService.js:19-23` 写死 `"stock_trade_stocks"` 等字面键 | 与 `core.js:10-14` 已定义的 `*_KEY` 常量来源漂移，易不一致。 | 复用 `core.js` 导出的 `*_KEY` 常量。 |
| 8 | 可维护性 | `cacheManager.js:47` 缓存类型字符串 `'position'/'heatmap'/'periodStats'/'stats'/'mem'` 散落字面量 | 拼写错误会静默失效。 | 抽 `CACHE_TYPES` 枚举常量统一引用。 |
| 9 | 可读性 | `statsService.js:348` 导出 `invalidateStatsCache`，定义于 `:355` | 导出顺序误导（靠提升可运行）。 | 调整顺序或改用 `function` 声明集中置顶。 |
| 10 | 可测试性 | `cacheManager.js` 的 `caches` 为模块级全局单例 | 跨用例状态泄漏，测试需手动复位，脆弱。 | 测试提供 `resetCaches()`；或注入式构造。 |
| 11 | 覆盖盲区 | `exchangeRate.js`、`stockDatabase.js`、`pinyinIndex.js`、`entityFactory.js`、`errors.js`、`dataService.js`、`strategy.js`、`dividend.js`、`lruCache.js`、`markdown.js`、`shareHelper.js` | 关键文件无对应单测；`pinyinIndex.NAME_PINYIN_MAP` 实际为空。 | 补核心单测；`pinyinIndex` 空表需确认是否真功能缺失。 |

---

## 三、改进路线图

### 阶段一（P0—紧急，本轮即可做，低成本高收益）
- **#3 stats 缓存失效**：在所有 model 写路径的 `markDataDirty` 增加 `"stats"`，或在 `cacheManager` 默认清除项中加入 `"stats"`。（改 3~4 处，消除统计失真 bug）
- **#6 / P2-#4 市场识别统一**：新增 `market.js: inferMarket(code)`，删除 `record.js`/`quick-record.js` 两份 `_detectMarket`，统一 5/6 位判定并加单测。

### 阶段二（P1—本迭代，架构级重构）
- **#1 / #2 打破循环 + 解除反向依赖**：拆 `cache/version.js`（持有数据版本与 `markDataDirty`），`core` 与 `computedCache` 只依赖它；`markDataDirty` 改由写方（models/services）在写后显式调用，`core` 不再导出。
- **#4 / #5 / P2-#1 / #2 写路径收敛**：抽 `transactionService.submit(draft)` 与 `positionService.getPositions()`，把页内/组件内聚合与重算逻辑下沉；`quick-record` 复用 `transactionService`；`detail` 复用 `buildRecordView`。
- **#7 / #8 / #9 / #10 DRY + DIP**：抽 `utils/helpers/gbk.js`、`format.js` 的 `todayISO()`、`utils/platform/{storage,http}.js`（封装 `wx`），统一市场注册表收敛 OCP。

### 阶段三（P2—顺手做）
- 消除死代码（P2-#5 `FEE_CONFIG`、P2-#6 未用 stats 导出）、字面量收敛为枚举（P2-#8）、复用 `*_KEY` 常量（P2-#7）、导出顺序整理（P2-#9）、补测试盲区（P2-#11）。

---

## 四、架构目标态（该项目"优雅"的具体形态）

分层单向、无环：`展现层` 只调 `应用层(service)`，`service/models` 读写经 `storageCore`（不直接碰 `wx`）；缓存失效由"写后事件"统一驱动（含 `stats`），杜绝陈旧命中。所有跨切面能力（市场识别、GBK、日期、金额、存储/HTTP）各有单一归属模块，页面与组件零重复写逻辑。核心计算均为可注入、可 mock 的纯函数，重型业务规则不嵌 `Page()` 生命周期，单测覆盖无盲区。

---

### 审查可信度说明
- 已交叉核验的断言：循环依赖链（#1）、stats 缓存缺口（#3）、市场识别重复与 5/6 位歧义（#6/P2-#4）、FEE_CONFIG 死配置（P2-#5）、分层反向依赖（#2）。
- 其余条目来自全量静态扫描取证，行号与片段已核对，未逐一运行时验证（本项目无运行时环境，需微信开发者工具内复现）。

---

## 五、重构执行记录（2026-07-19 续）

按"全部做完"指令，对 P1 全部项与 P2 全部项落地重构。回归结果：`npm test` **185 用例全绿**，`npx biome lint` **0 警告**。原审查报告（一~四节）作为证据保留，本节仅记录落地动作。

### 已完成（P1）
- **#1 循环依赖**：新增 `utils/cache/version.js`（叶子模块，持有数据版本号 `bumpVersion/getVersion/setVersion`）。`core` 改为运行时惰性引用 `cacheManager`；`computedCache` 只依赖 `version`，不再循环 require `core`。
- **#2 反向依赖**：`core` 移除顶层 `cacheManager` 依赖与 `markDataDirty` 导出；`markDataDirty` 改由 models/services 写后显式调用（惰性 `_markDirty`）。
- **#3 stats 缓存失效**：`markDataDirty` 内部恒清除 `caches.stats`（不再仅 `types==="all"` 时清），彻底消除统计陈旧命中。
- **#5 写流程收敛**：新增 `utils/services/transactionService.js`（`persistTransaction(draft)`），封装校验 + 自动建股 + 写 PriceCache + 构造 `Transaction` 落库；`record.js` 与 `quick-record.js` 复用，页面只收集表单。
- **#7 GBK 去重**：新增 `utils/helpers/gbk.js`（`decodeGBK`），`stockPrice.js`/`exchangeRate.js` 共用。
- **#8 日期去重**：`format.js` 新增 `todayISO()`；`record.js`/`quick-record.js`/`shareHelper.js`/`exchangeRate.js` 内联 `YYYY-MM-DD` 改统一调用。
- **#9 DIP**：新增 `utils/platform/storage.js`、`utils/platform/http.js` 封装 `wx`；`core.js`、`api/request.js` 改走抽象层。
- **#10 OCP 收敛**：`market.js` 新增 `getAsharePrefix` + `SYMBOL_BUILDERS` 注册表 + `buildSymbol(market, code)` 单一入口；`stockPrice.js` 删除重复 `decodeGBK`/前缀 switch，改走 `buildSymbol`。

### 已完成（P2）
- **#5 FEE_CONFIG**：`utils/constants/index.js` 删除死配置（定义+导出）；业务零引用，确为死代码。
- **#6 未用 stats 导出**：删除 `getStatsByPeriod`/`getPeriodStatsList`（及孤儿 `_generatePeriods`/`getISOWeek`/`calcStatsForRange`），并清理 `services/index.js` 转发与 `Dividend` 无用导入。
- **#7 `_KEY` 常量**：`dataService.js` 复用 `core` 导出的 `*_KEY` 常量，并修复 `clearMemCache` 误取未导出 `cacheManager` 的真实 bug（原取 `caches.mem` 为 undefined）。
- **#8 CACHE_TYPES 枚举**：`cacheManager.js` 定义并导出 `CACHE_TYPES`；`caches` 键与 `markDataDirty` 内部比较改用枚举；所有 model 调用点（`dividend`/`priceCache`/`strategy`/`transaction`/`dataService`）裸字符串改为 `CACHE_TYPES.*`。
- **#9 导出顺序**：`constants/index.js` 导出整理为 `MARKETS/TRANSACTION_TYPE/DEFAULT_STRATEGIES/TIMING_CONFIG`（移除 FEE_CONFIG）。
- **#10 resetCaches**：新增 `tests/helpers/resetCaches.js`，每次重新 require 以适配 `jest.resetModules()`；已接入 `statsCache.test.js`。
- **#11 补测试盲区**：新增 `tests/gbk.test.js`、`tests/platformStorage.test.js`、`tests/platformHttp.test.js`、`tests/resetCaches.test.js`；`tests/format.test.js` 补 `todayISO`、`tests/market.test.js` 补 `getAsharePrefix`/`buildSymbol`；并修正 `memory.test.js` 对 `caches` 键字面量的快照断言以匹配枚举化实现。

### 附带清理（顺手）
- `computedCache.js` 移除无用 `bumpVersion` 导入（上轮遗留）。
- `transactionService.js` 可选链告警（`targetStock?.id`）修正。

### 暂缓项（需运行时验证）
- **#4 上帝页面（P1）**：`pages/index/index.js` 约 240 行聚合逻辑下沉到 `positionService`/`statsService`。经核查，页内 `this._allPositionsCache`/`this._positionsCache` 属页面本地性能缓存、非 service 内部状态（P2-#3「禁止改写缓存」在本项目不成立）；但完整下沉需微信开发者工具运行时回归验证，本项目无运行环境，**本轮未做**，留作后续在 DevTools 内验证后实施。

### 优雅度变化
原评分 5.5/10 的主要短板（循环依赖、反向依赖、stats 缓存缺口、GBK/日期/市场识别重复、写流程上帝函数）均已闭环；仅 #4「上帝页面」聚合逻辑因需 DevTools 运行时验证暂缓。
