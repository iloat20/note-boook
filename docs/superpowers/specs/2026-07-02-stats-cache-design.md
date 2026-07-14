# 统计缓存层 + 首屏并行化设计

## 背景

项目已有 LRU 缓存体系（position / heatmap / periodStats / mem），但统计服务 statsService.js 的三个核心函数 getTotalStats、getStrategyStats、getPeriodStatsList 没有缓存层，导致：

1. 统计页每次 onShow 都全量重算（含 getAllPositions(true) 强制清缓存）
2. 年报 onOpenAnnualReport 串行跑 4 次全量扫描
3. 首屏 index.js#onLoad 串行 await 阻塞渲染

## 设计决策

缓存存储：纯内存 LRU，与现有 cacheManager 一致，无序列化开销。
首屏并行：持仓 + 汇率。行情依赖持仓结果，三者并行增加失败传播。
年报策略：dirty 感知缓存，复用 appStore.dataDirty，零新增概念。

## 改动清单

### 1. utils/cache/cacheManager.js

新增 stats 缓存实例（capacity=20），markDataDirty 的 all 分支同时清除 stats。

### 2. utils/services/statsService.js

- getTotalStats：加 caches.stats 缓存，key="total"
- getStrategyStats：有传入 transactions 时不缓存（调用方自定义数据），无参数时缓存 key="strategy"
- getPeriodStatsList：保留现有 caches.periodStats，语义更清晰
- 新增 invalidateStatsCache() 统一清除接口

### 3. pages/stats/stats.js

年报缓存：用实例字段 _annualReportCache 缓存年报数据。
onShow 时记录 wasDirty = pageMixin.onShowMixin(this, 2)。
onOpenAnnualReport 里 if (this._annualReportCache && !wasDirty) 直接 setData 返回。

### 4. pages/index/index.js

首屏并行化（最小侵入）：
在 _loadData 开头把 const ratesPromise = _getRates() 提前到 getAllPositions 之前，
利用持仓计算（同步 CPU 时间）与汇率网络请求并行。

## 缓存失效矩阵

- 新增/编辑/删除 Transaction：position(by stockId) + stats + periodStats
- 新增/编辑/删除 Dividend：position(by stockId) + stats + periodStats
- 新增/编辑/删除 Stock：stats + periodStats
- 手动刷新行情 PriceCache.set：position(by stockId)（已有）
- 清除全部数据：all

## 测试计划

1. 缓存命中测试：连续调用 getTotalStats() 两次，第二次返回同一引用
2. 缓存失效测试：markDataDirty("stats") 后 getTotalStats() 重新计算
3. 并行化测试：_loadData 中 ratesPromise 在 getAllPositions 之前发起
4. 回归测试：现有 npm test 全部通过

## 风险评估

- 低风险：缓存层是纯加法，原有逻辑全部保留
- 中风险：首屏并行化需确认 _getRates 不依赖 allPositions（已确认：汇率是全局数据）
- 注意：getStrategyStats(transactions) 有传入自定义 transactions 的调用场景，此分支不缓存

## 工作量估算

- cacheManager 加 stats 缓存：15 行
- statsService 加缓存：60 行
- stats.js 年报缓存：30 行
- index.js 首屏并行：5 行
- 测试：80 行
- 总计：约 190 行
