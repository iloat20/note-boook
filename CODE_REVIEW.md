# 项目代码审查报告

审查日期：2026-05-22
审查范围：全部页面、组件、样式、逻辑

---

## 一、代码逻辑错误 (需优先修复)

### 1. ❌ 严重: `packageDetail/pages/dividend/dividend.json` 缺失

`packageDetail/pages/dividend/` 目录下**缺少 `dividend.json`** 配置文件。

微信小程序要求每个页面必须有对应的 `.json` 配置（即使内容为空也需要 `{}`）。当前目录只有 `dividend.js`, `dividend.wxml`, `dividend.wxss`，缺少 `dividend.json` 会导致**编译警告或运行时错误**，iOS 真机上甚至可能白屏。

**修复:** 创建 `packageDetail/pages/dividend/dividend.json`:

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

---

### 2. ⚠️ `record.wxml` 导航标题逻辑错误

文件: `packageRecord/pages/record/record.wxml` 第 9 行

```xml
<text class="nav-title">{{isEdit ? (type === 'SELL' ? '编辑卖出交易' : '编辑买入交易') : (type === 'SELL' ? '编辑卖出交易' : '编辑交易')}}</text>
```

当新建卖出交易（`isEdit=false`, `type='SELL'`）时，标题显示 **"编辑卖出交易"**，但应该显示**"新增卖出"**或**"确认卖出"**。

**修复建议:**

```xml
<text class="nav-title">{{isEdit ? (type === 'SELL' ? '编辑卖出' : '编辑买入') : (type === 'SELL' ? '新增卖出' : '新增交易')}}</text>
```

---

### 3. ❌ `detail.wxml` / `detail.wxss` 使用未定义的旧 CSS 变量

文件: `packageDetail/pages/detail/detail.wxml` 第 59-61 行

```html
<view style="...border-top: 1px solid var(--color-separator);">
  <text style="font-weight: var(--weight-title); color: var(--color-title);">总盈亏</text>
  <text style="font-weight: var(--weight-display);">{{totalPnLText}}</text>
</view>
```

以及 detail.wxml 第 125 行:

```html
<view wx:for="{{strategySummary}}" wx:key="tag" style="padding: 8px 0; {{index > 0 ? 'border-top: 1px solid var(--color-separator);' : ''}}">
```

以及 detail.wxss 第 59-61 行、第 125 行、第 285 行:

```css
border-top: 1px solid var(--color-separator);
font-weight: var(--weight-title);
color: var(--color-title);
font-weight: var(--weight-display);
```

这些旧变量名（`--color-separator`, `--weight-title`, `--color-title`, `--weight-display`）在小红书设计系统 (`app.wxss`) 中**不存在**，会回退为无效值，导致样式错误。

**修复:** 替换为 XHS 设计系统变量:

| 旧变量 | 替换为 |
|--------|--------|
| `var(--color-separator)` | `var(--xhs-divider)` |
| `var(--weight-title)` | `var(--xhs-weight-semibold)` |
| `var(--color-title)` | `var(--xhs-title)` |
| `var(--weight-display)` | `var(--xhs-weight-bold)` |

---

### 4. ⚠️ `index.js` `onSwipeEdit` 编辑按钮跳转逻辑错误

文件: `pages/index/index.js` 第 401-408 行

```js
onSwipeEdit(e) {
  let stockId = e.currentTarget.dataset.stockId
  let transactions = Transaction.getAll().filter(function(t) { return t.stockId === stockId })
  if (transactions.length > 0) {
    wx.navigateTo({ url: '/packageRecord/pages/record/record?id=' + transactions[0].id })
  }
}
```

左滑菜单点击"编辑"按钮时，跳转到该股票**第一条交易记录的编辑页**，而不是进入该股票的**详情页**或**新增交易页**。这个行为对用户来说非常困惑——用户可能期望进入该股票详情页或进入新增交易页。

**修复建议:** 改为跳转到股票详情页或带 stockId 参数跳转到新增交易页:

```js
onSwipeEdit(e) {
  let stockId = e.currentTarget.dataset.stockId
  wx.navigateTo({ url: '/packageDetail/pages/detail/detail?stockId=' + stockId })
}
```

---

### 5. ⚠️ `stats.js` `getPositionSummary()` 变量语义与实际不符

文件: `pages/stats/stats.js` 第 183 行

```js
const allPositions = getPositionSummary().concat(clearedPositions.map(function (p) {
  return Object.assign({}, p, { floatingPnL: 0 })
}))
```

`getPositionSummary()` 函数名暗示返回"汇总对象"（总市值、总盈亏等），但实际上返回**持仓数组**（仅 quantity > 0 的持仓）。虽然代码能运行（`concat` 可用），但:

- 函数名与返回值语义不一致，容易误导后续维护者
- 如果 `getPositionSummary()` 未来改返回 summary 对象，此处的 `.concat()` 会静默失败

**修复建议:** 将函数语义明确化:

```js
// 统一使用 getAllPositions 代替 getPositionSummary 来获取完整持仓
const allPositions = getAllPositions().filter(p => p.quantity > 0).concat(clearedPositions.map(...))
```

或者将 stats.js 中的调用改为 `getAllPositions()` + filter，保持与年度报告函数的逻辑一致。

---

## 二、XHS 小红书设计风格不一致 (需要统一)

### 6. ⚠️ `dividend.wxml` 大量使用内联样式

文件: `packageDetail/pages/dividend/dividend.wxml`

与 `record.wxml`（使用完整的 `.nav-bar`, `.nav-back` 等类名体系）不同，`dividend.wxml` 大量使用内联样式:

```xml
<!-- dividend 页面: 内联样式 -->
<view bindtap="goBack" style="min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: flex-start;">
  <text style="font-size: 44rpx; color: var(--xhs-primary); font-weight: 300;">‹</text>
</view>
<text class="nav-header-title" style="flex: 1;">...
```

而 record.wxml 使用类名:

```xml
<view class="nav-back">
  <view class="nav-back-circle">
    <text class="nav-back-arrow">‹</text>
  </view>
</view>
```

**修复建议:** 统一使用 record 页面的导航栏类名体系，删除内联样式。

---

### 7. ⚠️ `dividend.wxml` 底部按钮缺少 `.cta-btn` 类名定义

文件: `packageDetail/pages/dividend/dividend.wxml` 第 90 行

```xml
<view class="cta-btn" style="margin: 0 var(--xhs-space-lg); position: fixed; ..." bindtap="submit">
  {{isEdit ? '保存修改' : '确认添加'}}
</view>
```

但 `dividend.wxss` 中**未定义 `.cta-btn` 类**，仅引用了 `@import '../../../styles/common.wxss'`，而 common.wxss 中也没有 `.cta-btn`。按微信小程序规则，未定义的类名不会报错但也不会有样式。

**修复建议:** 使用 `app.wxss` 中定义的 `.xhs-btn-primary` 类:

```xml
<view class="xhs-btn-primary" style="margin: 0 var(--xhs-space-lg); position: fixed; ..." bindtap="submit">
```

或者在 dividend.wxss 中补充 `.cta-btn` 样式。

---

### 8. ⚠️ `stats` 页面使用的骨架屏类名体系与 `index` 页面不一致

- **index 页面:** 使用自定义类名 `skeleton-card`, `skeleton-header`, `shimmer`（定义在 index.wxss 中）
- **stats 页面:** 使用 `xhs-skeleton-card`, `xhs-shimmer` 等（定义在 app.wxss 中的 XHS 体系）
- **history 页面:** 使用 `xhs-skeleton-card` 等

index 页面和历史/统计页面使用了不同的骨架屏类名体系，应统一。

**修复建议:** 将 index 页面的骨架屏类名统一为 `xhs-skeleton-*` 体系（已在 app.wxss 中定义），删除 index.wxss 中重复的骨架屏样式定义。

---

### 9. ⚠️ `detail.wxml` `record-header` / `record-body` 等样式与 `history.wxml` 不一致

detail 页面中的交易记录卡片使用了与 history 页面不同的布局结构:

- **history 页面:** 使用左侧色条 + 两行内容 + 策略标签
- **detail 页面:** 使用三行布局（标签/日期/价格→股数/手续费→笔记）

虽然不同页面可以有不同布局，但**类型标签**（买入/卖出/分红）的颜色语义需要保持一致——当前两者都使用了 `var(--xhs-loss-bg)` / `var(--xhs-profit-bg)` / `var(--xhs-dividend-bg)`，这一点是一致的。

---

### 10. ⚠️ 年度报告（`annual-report`）使用深色主题

`annual-report` 组件使用深色主题（`#0D1117` 背景），与主应用的小红书浅色主题完全不同。如属有意设计，建议在组件名称中体现（如 `annual-report-dark`）；如需统一，应改为小红书浅色卡片风格。

---

### 11. ⚠️ 各页面搜索框/筛选栏风格未统一

- **history 页面:** 使用圆形搜索框（`border-radius: var(--xhs-radius-pill)`）+ `liquid-slider` 组件
- **stats 页面:** 没有搜索框，使用自定义 `period-tabs`（带下划线激活态）+ 2x2 网格
- **index 页面:** 没有搜索框，使用 `liquid-slider` 组件（市场筛选）

stats 页面的 `period-tabs` 激活态使用**底部小红线**（`#FF2442`），而其他页面的 `liquid-slider` 使用**白色滑块**。建议统一为 `liquid-slider` 组件或统一激活态样式。

---

## 三、潜在隐患 & 改进建议

### 12. ℹ️ `project.config.json` 中配置了 `workers` 目录但目录不存在

```json
"workers": ["workers/positionWorker"]
```

但项目中不存在 `workers/` 目录，编译时会产生警告。如果不需要 Worker，应移除该配置。

### 13. ℹ️ 费用计算浮点数精度

`feeCalculator` 中的费用计算和 `calcFee` 方法涉及多次浮点运算，个别计算结果可能出现极小误差（如 `0.010000000000000009`）。当前使用了 `parseFloat(x.toFixed(2))` 做容错，但部分地方未做（如 record.js `_calcFee` 中的 `tradeAmount` 赋值）。建议统一使用 `fmt()` 或 `toFixed(2)` 处理。

### 14. ℹ️ `index.js` `_loadData` 中 market tab 计数和价格获取时机

`_loadData` 函数中第 231-233 行对 `positions` 进行了市场筛选，但随后第 253 行调用了 `_updateMarketTabs(positions)` —— 这里的 `positions` 是**筛选前的全部持仓**还是**筛选后的数据**？

实际代码用的是筛选前的 `formattedPositions`（已通过 `_updateMarketTabs(formattedPositions)` 传递），但阅读代码时容易混淆。建议将变量命名对齐或添加注释。

---

## 四、总结与优先级

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 🔴 **P0** | dividend.json 缺失 (#1) | 编译/运行时可能报错 |
| 🔴 **P0** | 旧 CSS 变量名 (#3) | 样式无法正确渲染 |
| 🟡 **P1** | record 标题逻辑错误 (#2) | UX 文字误导 |
| 🟡 **P1** | onSwipeEdit 跳转错误 (#4) | 功能行为不符合预期 |
| 🟡 **P1** | dividend 页面缺少 .cta-btn 定义 (#7) | 按钮无样式 |
| 🔵 **P2** | 各页 XHS 风格不一致 (#6-#11) | 视觉不统一 |
| 🔵 **P2** | 骨架屏类名体系不统一 (#8) | 维护成本增加 |
| ⚪ **P3** | workers 配置 (#12) | 编译警告 |
| ⚪ **P3** | 浮点数精度 (#13) | 极小误差风险 |
