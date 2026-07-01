# 持仓页刷新架构重构设计

## 概述

将 `pages/index/index.js` 中分散的 6 个刷新入口收敛为统一的 `refresh(opts)` 管道，串行执行 loadData → fetchPrices，消除竞态条件。

## 设计原则

- 单入口管道：所有刷新通过 `refresh(opts)` 触发
- 串行执行：loadData 完成后才 fetchPrices，无并发
- 智能拉取：依赖 PriceCache TTL 控制是否真正发请求，非交易时段也拉收盘价
- 最小改动：不改变 _loadData 和 _fetchPrices 的内部逻辑，只调整调用方式

## 1. refresh() 统一管道

新增 `refresh` 方法，替代所有直接调用 `_loadData` / `_fetchPrices` 的入口：

```javascript
async refresh({ force = false, fetchPrices = true } = {}) {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
        await this._loadData(force);
        if (fetchPrices && this._positionsCache?.length > 0) {
            await this._fetchPrices({ silent: true, force });
        }
    } finally {
        this._refreshing = false;
    }
}
```

参数说明：
- `force`：true 时清除 position 缓存 + 忽略 PriceCache TTL 强制拉取
- `fetchPrices`：false 时只刷数据不拉行情

## 2. 各入口映射

| 入口 | 调用 | 理由 |
|---|---|---|
| `onLoad` | `await this.refresh()` | 首次加载，PriceCache 为空会全量拉取 |
| `onShow` dirty=true | `await this.refresh()` | 添加交易后刷新，PriceCache 已有录入价格 |
| `onShow` 非dirty | `await this.refresh()` | 常规刷新，TTL 控制是否拉取 |
| `onPullDownRefresh` | `await this.refresh({ force: true })` | 手动下拉强制全刷 |
| `onQuickRecordSubmit` | `await this.refresh()` | 快捷记录后刷新 |
| `onSwipeDelete` | `await this.refresh()` | 删除后刷新 |
| `updatePrice` | `await this.refresh({ fetchPrices: false })` | 已手动写入 PriceCache |

## 3. onShow 简化

现有 onShow 包含 `isTradingTime()` 判断和 30 秒节流逻辑，全部移除。简化为：

```javascript
async onShow() {
    const dirty = pageMixin.onShowMixin(this, 0);
    if (dirty || this._allPositionsCache?.length > 0) {
        await this.refresh();
    }
}
```

- `dirty` 时 refresh 确保数据更新
- 非 dirty 但有持仓时 refresh，PriceCache TTL 自动跳过未过期的
- 无持仓时不调（空状态无需刷新）

## 4. _loadData 调整

1. 移除内部 `_loading` 守卫（`if (this._loading) return`）——由 `refresh` 的 `_refreshing` 统一管理
2. 保留 `_loading` 作为 UI 状态标记（控制骨架屏 `loading` 字段）
3. 其他内部逻辑不变

## 5. _fetchPrices 调整

1. 方法内部逻辑不变（TTL 过滤、批量更新、display path 更新等保持不变）
2. 方法内部两处 `_loadData()` 回退调用改为 `this.refresh()`，避免递归绕过管道
3. 去掉 `isTradingTime()` 和 30 秒节流相关的外部控制——已移入 refresh 管道由 PriceCache TTL 管理

## 6. 不变的部分

- `_loadData` 内部的数据计算、格式化、setData 逻辑不变
- `_fetchPrices` 内部的 PriceCache 读写、displayPositions path 更新、`_updateSummary` 调用不变
- `onMarketTabChange` 不涉及数据刷新，不变
- `onRefreshPrice`（单只股票手动刷新按钮）保持独立调用 `fetchStockPrice` + `_loadData`，不走 refresh 管道（只刷一只股票不需要全量刷新）
- `positionService`、`PriceCache`、`appStore` 等底层模块不变

## 7. 影响范围

- `pages/index/index.js` — 唯一修改文件
  - 新增 `refresh` 方法
  - 重写 `onShow`、`onLoad`、`onPullDownRefresh`、`onQuickRecordSubmit`、`onSwipeDelete`、`updatePrice`
  - 修改 `_loadData`（移除 _loading 守卫）
  - 修改 `_fetchPrices`（回退调用改为 refresh）
- 不修改其他文件
