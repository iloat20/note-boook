# 性能优化设计方案

> 日期：2026-06-30
> 基于：PERFORMANCE_AUDIT.md v2
> 目标：全面优化小程序性能，按 ROI 排序分 5 步实施

---

## 第 1 步：消除数据冗余三连发 🔴

### 问题

`pages/index/index.js` 中持仓数据同时存在于 data 的三个字段：

```
positions        ← 当前 tab 筛选后的全量
displayPositions ← positions 的前 N 条切片
_allPositions    ← 全市场全量
```

20 只持仓 × 20 个字段 = 400 个数据节点，三份就是 1200 个节点，每次相关 setData 都要 diff 这么多。

### 方案

| 数据 | 当前位置 | 改后位置 | 理由 |
|------|----------|----------|------|
| `_allPositions` | `this.data` | `this._allPositionsCache` | JS 逻辑用，不进渲染层 |
| `positions` | `this.data` | `this._positionsCache` | JS 逻辑用，不进渲染层 |
| `displayPositions` | `this.data` | `this.data`（保留） | WXML `wx:for` 唯一渲染源 |
| `positionCount` | `this.data` | `this.data`（保留） | WXML 计数用 |

### 配套改造

1. 新增 `this._positionIdIndex = new Map()` —— O(1) 按 id 定位
2. `_fetchPrices` 改为只更新 `displayPositions` 对应 index
3. `onMarketTabChange` 改为过滤 `_allPositionsCache`，写入 `this.data.displayPositions`
4. 移除 `this.data.positions` 和 `this.data._allPositions` 声明

### 验证

- `npm test` 通过
- 手动验证：持仓列表显示正常、价格刷新正常、切 tab 正常

---

## 第 2 步：动画帧率优化 🟠

### 问题

`animateAllValues` 用 `setTimeout(16ms)` 驱动，800ms 动画 ≈ 50 帧，每帧一次 setData。

### 当前状态

`animationHelper.js` 已经是简化版（单次 setData），WXML 中的 `displayValues` 需要配合 CSS transition。

### 方案

确认 CSS 中 `transition` 属性已正确应用到数字元素：

```css
/* 确保 index.wxss 中有 */
.value-animate {
  transition: all 0.3s ease-out;
}
```

### 验证

- 手动验证：数字滚动动画正常

---

## 第 3 步：onShow 行情刷新节流 🟠

### 问题

每次从详情/记录页返回持仓 tab，只要 `dataDirty` 为真，就会全量重算持仓 + 强制网络拉取所有股票现价。

### 方案

1. **最小间隔节流**：30s 内不重复拉取
2. **force: true 仅限主动操作**：提交交易后用 force，onShow 用普通模式
3. **首屏优先分片**：先拉 `displayPositions` 里的股票

```javascript
// onShow 中
const now = Date.now();
if (now - (this._lastFetchAt || 0) > 30000) {
  this._fetchPrices({ silent: true });  // 不用 force
  this._lastFetchAt = now;
}
```

### 验证

- 手动验证：onShow 不重复请求

---

## 第 4 步：缓存不可变性防护 🟡

### 问题

`getData()` 返回缓存对象的引用，外部修改会污染缓存。

### 方案

1. `getData` 返回冻结的只读视图
2. 开发期修改返回值会抛 TypeError
3. 生产环境只冻结顶层

```javascript
function getData(key) {
  // ... 读取逻辑
  if (Array.isArray(data)) {
    Object.freeze(data);
    data.forEach(Object.freeze);
  }
  return data;
}
```

### 验证

- `npm test` 通过
- 新增 freeze 测试

---

## 第 5 步：渲染与资源优化 🟡

### 子项 5.1：隐藏 canvas 按需挂载

**问题**：首页常驻隐藏 canvas 占内存。

**方案**：`wx:if="{{generatingShare}}"` 按需挂载。

**验证**：分享功能正常。

### 子项 5.2：分包预加载收敛

**问题**：3 个 tab 全都预加载 2 个分包，拖慢首屏。

**方案**：
- `index` 只预加载 `packageDetail`
- `history`/`stats` 移除预加载

```json
"preloadRule": {
  "pages/index/index": {
    "packages": ["packageDetail"]
  }
}
```

**验证**：首屏加载更快。

### 子项 5.3：入场动画精简

**问题**：列表项 stagger 动画触发首帧全量布局。

**方案**：列表项移除 stagger，只保留 summary fade-in。

**验证**：首屏布局更快。

---

## 实施顺序

| 步骤 | 改动文件 | 验证方式 |
|------|----------|----------|
| 1 | `index.js`, `index.wxml` | `npm test` + 手动验证 |
| 2 | 确认 CSS | 手动验证 |
| 3 | `index.js` | 手动验证 |
| 4 | `storageCore/core.js` | `npm test` + 新增测试 |
| 5 | `app.json`, `index.wxml`, `index.wxss` | 手动验证 |

---

## 风险评估

| 步骤 | 风险 | 缓解措施 |
|------|------|----------|
| 1 | 数据同步问题 | 单测覆盖 + 手动验证 |
| 2 | CSS 兼容性 | 确认基础库版本支持 |
| 3 | 行情刷新延迟 | 30s 节流足够短 |
| 4 | 开发期报错 | 只冻结顶层，内部按需 |
| 5 | 分享功能 | 按需挂载后测试分享流程 |
