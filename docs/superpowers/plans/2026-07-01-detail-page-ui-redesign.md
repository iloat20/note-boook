# 股票详情页 UI 全局重排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the stock detail page (`packageDetail/pages/detail/`) from flat stacked cards to a 3-tier visual hierarchy: Hero → Data Panel → List Zone, matching the index page's visual richness.

**Architecture:** Pure UI restructuring of 3 files. No new components, no new data logic. The WXML template is restructured into new semantic sections, WXSS is rewritten for the new layout (grid-based data panel, hero with gradient bg, improved record items), and one JS data field (`heroBgClass`) is added for profit/loss-aware hero background.

**Tech Stack:** WeChat Mini Program (WXML + WXSS + JS), project CSS variable system (`app.wxss` design tokens), existing animation system (`animate-stagger`).

## Global Constraints

- Use existing design tokens only (`--xhs-*` CSS variables from `app.wxss`). No new tokens.
- Use existing animation classes (`animate-stagger`, `stagger-delay-*`). No new animations.
- All cards: `--page-margin` horizontal padding, `--xhs-radius-md` border-radius, `--xhs-elevation-2` box-shadow.
- Keep CommonJS module system, double quotes in JS, tabs for JS indentation.
- Edit mode JS logic stays unchanged; only visual placement changes.
- Delete animations (`dissolving` class) stay unchanged.

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packageDetail/pages/detail/detail.js` | Modify | Add `heroBgClass` data field computed from totalPnL |
| `packageDetail/pages/detail/detail.wxml` | Rewrite | New template structure: Hero, Data Panel, Record lists |
| `packageDetail/pages/detail/detail.wxss` | Rewrite | New styles for all sections, grid layout, hero gradient |

---

### Task 1: JS — Add heroBgClass

**Files:**
- Modify: `packageDetail/pages/detail/detail.js`

**Step 1:** Add `heroBgClass: ""` to the `data` object (after `heroPnLPercentText`):

```js
heroPnLPercentText: "",
heroBgClass: "",
```

**Step 2:** In `loadData()`, inside the `this.setData({...})` call, add after the `heroPnLPercentText` line:

```js
heroBgClass: totalPnL > 0 ? "hero-profit" : totalPnL < 0 ? "hero-loss" : "hero-flat",
```

**Step 3:** In `_updatePriceFields()`, inside the `this.setData({...})` call, add after the `heroPnLPercentText` line:

```js
heroBgClass: totalPnL > 0 ? "hero-profit" : totalPnL < 0 ? "hero-loss" : "hero-flat",
```

**Step 4:** Run lint to verify:

```bash
cd C:/Users/Administrator/Downloads/work/note-boook
npx biome check packageDetail/pages/detail/detail.js
```

Expected: No errors.

---

### Task 2: WXML — Full template rewrite

**Files:**
- Rewrite: `packageDetail/pages/detail/detail.wxml`

Replace the entire file content with:

```html
<view class="page-container page-entrance" style="padding-top: {{statusBarHeight + navBarHeight}}px;">
  <scroll-view wx:if="{{stock}}" class="scroll-container" scroll-y>
    <!-- ===== Hero 区：标题 + 价格 + 总盈亏 ===== -->
    <view class="hero-card {{heroBgClass}} animate-stagger stagger-delay-1">
      <view class="hero-top-row">
        <view bindtap="goBack" class="hero-back-btn">
          <text class="hero-back-icon">‹</text>
        </view>
        <view class="hero-stock-info">
          <view class="hero-name-row">
            <market-tag market="{{stock.market}}" label="{{marketLabel}}" />
            <text class="hero-stock-name">{{stock.name}}</text>
            <text class="hero-stock-code">{{stock.code}}</text>
          </view>
        </view>
        <view bindtap="toggleEditMode" class="hero-edit-btn {{editMode ? 'hero-edit-btn-active' : ''}}">
          <text class="hero-edit-text">{{editMode ? '完成' : '编辑'}}</text>
        </view>
      </view>
      <view class="hero-price">{{formatCurrentPrice}}</view>
      <view class="hero-pnl-row">
        <text class="hero-pnl-amount {{totalPnLClass}}">{{totalPnLText}}</text>
        <view class="profit-badge {{totalPnLClass}}">
          <text class="mono-num">{{heroPnLPercentText}}</text>
        </view>
      </view>
    </view>

    <!-- ===== 数据面板：持仓摘要 + 盈亏明细 ===== -->
    <view class="data-panel animate-stagger stagger-delay-2">
      <!-- 持仓摘要 -->
      <view class="data-panel-section">
        <text class="data-panel-title">持仓摘要</text>
        <view class="data-grid-2col">
          <view class="data-cell">
            <text class="data-cell-label">持股数量</text>
            <text class="data-cell-value">{{position.quantity}}<text class="data-cell-unit"> 股</text></text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">平均成本</text>
            <text class="data-cell-value">{{formatAvgCost}}</text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">当前价格</text>
            <text class="data-cell-value">{{formatCurrentPrice}}</text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">持仓市值</text>
            <text class="data-cell-value">{{formatMarketValue}}</text>
          </view>
        </view>
      </view>

      <!-- 编辑模式 -->
      <block wx:if="{{editMode}}">
        <view class="data-panel-divider"></view>
        <view class="data-panel-edit">
          <view class="edit-field-row">
            <text class="edit-field-label">数量</text>
            <input class="edit-input" type="digit" placeholder="0" value="{{editQuantity}}" bindinput="onEditQuantityInput"/>
          </view>
          <view class="edit-field-row">
            <text class="edit-field-label">成本</text>
            <input class="edit-input" type="digit" placeholder="0.00" value="{{editAvgCost}}" bindinput="onEditAvgCostInput"/>
          </view>
          <view class="edit-field-row">
            <text class="edit-field-label">现价</text>
            <input class="edit-input" type="digit" placeholder="0.00" value="{{editCurrentPrice}}" bindinput="onEditCurrentPriceInput"/>
          </view>
          <view class="edit-actions">
            <view class="btn-cancel" bindtap="cancelEdit">取消</view>
            <view class="btn-save" bindtap="savePosition">保存修改</view>
          </view>
        </view>
      </block>

      <!-- 盈亏明细 -->
      <view class="data-panel-divider"></view>
      <view class="data-panel-section">
        <text class="data-panel-title">盈亏明细</text>
        <view class="data-grid-4col">
          <view class="data-cell">
            <text class="data-cell-label">浮动盈亏</text>
            <text class="data-cell-value data-cell-value-sm {{floatingPnLClass}}">{{floatingPnLText}}</text>
            <text class="data-cell-sub {{floatingPnLClass}}">{{floatingPnLPercent}}%</text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">已实现</text>
            <text class="data-cell-value data-cell-value-sm {{realizedPnLClass}}">{{realizedPnLText}}</text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">分红收入</text>
            <text class="data-cell-value data-cell-value-sm dividend">{{formatDividendIncome}}</text>
          </view>
          <view class="data-cell">
            <text class="data-cell-label">总盈亏</text>
            <text class="data-cell-value data-cell-value-lg {{totalPnLClass}}">{{totalPnLText}}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ===== 交易记录 ===== -->
    <view class="detail-card detail-card-no-pad animate-stagger stagger-delay-3">
      <view class="detail-card-header detail-card-header-with-action">
        <text class="detail-card-title">交易记录</text>
        <view class="detail-card-action" bindtap="goToRecord">添加</view>
      </view>
      <view wx:if="{{transactions.length > 0}}">
        <view wx:for="{{transactions}}" wx:key="id"
          class="record-item {{disTransId === item.id ? 'dissolving' : ''}}"
          bindtap="showTransactionActions" data-id="{{item.id}}" data-type="transaction">
          <view class="record-main">
            <view class="record-left">
              <view class="record-tag-row">
                <view class="tag {{item.type === 'BUY' ? 'tag-buy' : 'tag-sell'}}">{{item.typeText}}</view>
                <text class="record-date">{{item.dateText}}</text>
              </view>
              <text class="record-qty">{{item.quantity}}股</text>
            </view>
            <view class="record-right">
              <text class="record-price {{item.type === 'BUY' ? 'record-price--buy' : 'record-price--sell'}}">{{item.priceText}}</text>
              <text class="record-amount">{{item.amountText}}</text>
            </view>
          </view>
          <view wx:if="{{item.fee > 0}}" class="record-fee-row">
            <text class="record-fee-text">手续费 {{item.feeText}}</text>
          </view>
          <view wx:if="{{item.hasJournal}}" class="record-journal-wrap">
            <strategy-tags wx:if="{{item.strategies.length > 0}}" tags="{{item.strategies}}" />
            <text wx:if="{{item.reason}}" class="record-reason">{{item.reason}}</text>
          </view>
        </view>
      </view>
      <view wx:else class="detail-card-empty">
        <text class="detail-card-empty-text">暂无交易记录</text>
      </view>
    </view>

    <!-- ===== 分红记录 ===== -->
    <view class="detail-card detail-card-no-pad animate-stagger stagger-delay-4">
      <view class="detail-card-header detail-card-header-with-action">
        <text class="detail-card-title">分红记录</text>
        <view class="detail-card-action" bindtap="goToDividend">添加</view>
      </view>
      <view wx:if="{{dividends.length > 0}}">
        <view wx:for="{{dividends}}" wx:key="id"
          class="dividend-item {{disDivId === item.id ? 'dissolving' : ''}}"
          bindtap="showDividendActions" data-id="{{item.id}}" data-type="dividend">
          <view class="dividend-main-row">
            <view class="tag tag-dividend">分红</view>
            <text class="dividend-date">{{item.dateText}}</text>
          </view>
          <view class="dividend-detail-row">
            <text class="dividend-detail">每股 {{item.perShareText}}</text>
            <text class="dividend-detail">{{item.quantity}}股</text>
          </view>
          <text class="dividend-amount dividend">+{{item.totalText}}</text>
        </view>
      </view>
      <view wx:else class="detail-card-empty">
        <text class="detail-card-empty-text">暂无分红记录</text>
      </view>
    </view>

    <!-- ===== 策略复盘 ===== -->
    <view wx:if="{{strategySummary.length > 0}}" class="detail-card animate-stagger stagger-delay-5">
      <view class="detail-card-header">
        <text class="detail-card-title">策略复盘</text>
      </view>
      <view class="detail-card-body">
        <view wx:for="{{strategySummary}}" wx:key="tag" class="strategy-row {{index > 0 ? 'strategy-row-bordered' : ''}}">
          <view class="strategy-tag">{{item.tag}}</view>
          <view class="strategy-right">
            <text class="strategy-pnl" style="color: {{item.netPnL >= 0 ? 'var(--xhs-profit)' : 'var(--xhs-loss)'}};">{{item.netPnL >= 0 ? '+' : ''}}{{item.netPnLFormatted}}</text>
            <text class="strategy-count">{{item.count}}笔</text>
          </view>
        </view>
      </view>
    </view>

    <view style="height: 60px;"></view>
  </scroll-view>

  <empty-state
    wx:else
    icon="📈"
    title="股票不存在"
  />
</view>
```

---

### Task 3: WXSS — Full style overhaul

**Files:**
- Rewrite: `packageDetail/pages/detail/detail.wxss`

Replace the entire file content with:

```css
@import '../../../styles/common.wxss';

page {
  background: var(--xhs-bg);
}

/* =============================
   Hero 区
   ============================= */
.hero-card {
  background: var(--xhs-surface);
  border-radius: var(--xhs-radius-md);
  padding: 40rpx var(--page-margin) 36rpx;
  margin-bottom: var(--xhs-space-lg);
  box-shadow: var(--xhs-elevation-2);
  position: relative;
  overflow: hidden;
}

.hero-profit {
  background: var(--xhs-surface) radial-gradient(
    ellipse at top right,
    rgba(255, 215, 0, 0.08) 0%,
    transparent 60%
  );
}

.hero-loss {
  background: var(--xhs-surface) radial-gradient(
    ellipse at top right,
    rgba(0, 170, 0, 0.06) 0%,
    transparent 60%
  );
}

.hero-flat {
  /* default white, no gradient */
}

.hero-top-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}

.hero-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: var(--xhs-radius-round);
  background: var(--xhs-surface);
  box-shadow: var(--xhs-elevation-1);
  transition: var(--xhs-transition);
  flex-shrink: 0;
}

.hero-back-btn:active {
  transform: scale(0.92);
  opacity: 0.75;
}

.hero-back-icon {
  font-size: 36rpx;
  font-weight: 400;
  color: var(--xhs-title);
  line-height: 1;
}

.hero-stock-info {
  flex: 1;
  min-width: 0;
}

.hero-name-row {
  display: flex;
  align-items: center;
  gap: var(--xhs-space-sm);
}

.hero-stock-name {
  font-size: 40rpx;
  font-weight: var(--xhs-weight-bold);
  color: var(--xhs-title);
  letter-spacing: -0.02em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.hero-stock-code {
  font-size: 26rpx;
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-body);
  flex-shrink: 0;
  line-height: 1.2;
}

.hero-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48rpx;
  padding: 0 24rpx;
  border-radius: var(--xhs-radius-pill);
  background: var(--xhs-bg-secondary);
  transition: var(--xhs-transition);
  flex-shrink: 0;
}

.hero-edit-btn:active {
  transform: scale(0.94);
  opacity: 0.75;
}

.hero-edit-btn-active {
  background: var(--xhs-primary);
}

.hero-edit-text {
  font-size: 24rpx;
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-caption);
  line-height: 1;
}

.hero-edit-btn-active .hero-edit-text {
  color: #fff;
}

.hero-price {
  font-size: var(--xhs-font-5xl);
  font-weight: var(--xhs-weight-bold);
  color: var(--xhs-title);
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin-bottom: 12rpx;
}

.hero-pnl-row {
  display: flex;
  align-items: center;
  gap: var(--xhs-space-sm);
}

.hero-pnl-amount {
  font-size: var(--xhs-font-2xl);
  font-weight: var(--xhs-weight-bold);
  letter-spacing: -0.01em;
}

/* =============================
   数据面板
   ============================= */
.data-panel {
  background: var(--xhs-surface);
  border-radius: var(--xhs-radius-md);
  box-shadow: var(--xhs-elevation-2);
  margin-bottom: var(--xhs-space-md);
  overflow: hidden;
}

.data-panel-section {
  padding: var(--page-margin);
}

.data-panel-title {
  font-size: var(--xhs-font-md);
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-title);
  letter-spacing: -0.01em;
  margin-bottom: 20rpx;
  display: block;
}

.data-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx 32rpx;
}

.data-grid-4col {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx 12rpx;
}

.data-cell {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.data-cell-label {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption);
  font-weight: var(--xhs-weight-medium);
  letter-spacing: 0.02em;
}

.data-cell-value {
  font-size: var(--xhs-font-xl);
  font-weight: var(--xhs-weight-bold);
  color: var(--xhs-title);
  letter-spacing: -0.01em;
}

.data-cell-value-sm {
  font-size: var(--xhs-font-lg);
}

.data-cell-value-lg {
  font-size: var(--xhs-font-xl);
}

.data-cell-unit {
  font-size: var(--xhs-font-sm);
  color: var(--xhs-caption);
  font-weight: var(--xhs-weight-medium);
}

.data-cell-sub {
  font-size: var(--xhs-font-xs);
  font-weight: var(--xhs-weight-medium);
}

.data-panel-divider {
  height: 1px;
  background: var(--xhs-divider);
  margin: 0 var(--page-margin);
}

/* =============================
   编辑模式（面板内）
   ============================= */
.data-panel-edit {
  padding: var(--page-margin);
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.edit-field-label {
  font-size: var(--xhs-font-sm);
  color: var(--xhs-caption);
  font-weight: var(--xhs-weight-medium);
  width: 64rpx;
  flex-shrink: 0;
}

.edit-input {
  flex: 1;
  height: 40px;
  background: var(--xhs-bg-secondary);
  border: 1.5px solid var(--xhs-divider-strong);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 16px;
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-title);
  transition: var(--xhs-transition);
  text-align: right;
}

.edit-input:focus {
  border-color: var(--xhs-primary);
  background: var(--xhs-surface);
  box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.08);
}

.edit-actions {
  display: flex;
  gap: var(--xhs-space-sm);
  margin-top: 8rpx;
}

.btn-cancel {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: var(--xhs-font-md);
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-caption);
  background: var(--xhs-bg-secondary);
  border-radius: 12px;
  transition: var(--xhs-transition);
}

.btn-cancel:active {
  opacity: 0.7;
  transform: scale(0.98);
}

.btn-save {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: var(--xhs-font-md);
  font-weight: var(--xhs-weight-semibold);
  color: #fff;
  background: var(--xhs-primary);
  border-radius: 12px;
  box-shadow: var(--xhs-btn-shadow);
  transition: var(--xhs-transition);
}

.btn-save:active {
  opacity: 0.85;
  transform: scale(0.98);
}

/* =============================
   通用卡片
   ============================= */
.detail-card {
  background: var(--xhs-surface);
  border-radius: var(--xhs-radius-md);
  box-shadow: var(--xhs-elevation-2);
  padding: var(--page-margin);
  margin-bottom: var(--xhs-space-md);
  position: relative;
  overflow: hidden;
  transition: var(--xhs-transition-slow);
}

.detail-card-no-pad {
  padding: 0;
}

.detail-card-header {
  padding: var(--page-margin) var(--page-margin) 0;
}

.detail-card-header-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-card-title {
  font-size: var(--xhs-font-lg);
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-title);
  letter-spacing: -0.01em;
}

.detail-card-action {
  font-size: var(--xhs-font-sm);
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-primary);
  padding: 8rpx 20rpx;
  border-radius: var(--xhs-radius-pill);
  background: var(--xhs-primary-bg);
  transition: var(--xhs-transition);
}

.detail-card-action:active {
  opacity: 0.7;
  transform: scale(0.95);
}

.detail-card-body {
  padding: var(--page-margin);
}

.detail-card-empty {
  padding: var(--page-margin);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80rpx;
}

.detail-card-empty-text {
  font-size: var(--xhs-font-sm);
  color: var(--xhs-caption);
}

/* =============================
   交易记录
   ============================= */
.record-item {
  padding: var(--page-margin);
  margin: 0 var(--page-margin);
  border-top: 1px solid var(--xhs-divider);
  transition: var(--xhs-transition-slow);
}

.record-item:first-child {
  border-top: none;
}

.record-item:active {
  background: rgba(0, 0, 0, 0.02);
}

.record-item.dissolving {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
  max-height: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  overflow: hidden !important;
  transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 400ms cubic-bezier(0.4, 0, 0.2, 1),
    max-height 400ms cubic-bezier(0.4, 0, 0.2, 1),
    padding 400ms cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.record-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.record-left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.record-tag-row {
  display: flex;
  align-items: center;
  gap: var(--xhs-space-xs);
}

.record-date {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption-light);
  font-weight: var(--xhs-weight-regular);
}

.record-qty {
  font-size: var(--xhs-font-sm);
  font-weight: var(--xhs-weight-medium);
  color: var(--xhs-body);
}

.record-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.record-price {
  font-weight: var(--xhs-weight-bold);
  font-size: var(--xhs-font-md);
  letter-spacing: 0.01em;
  line-height: 1.2;
}

.record-price--buy {
  color: var(--xhs-profit);
}

.record-price--sell {
  color: var(--xhs-loss);
}

.record-amount {
  font-size: var(--xhs-font-sm);
  font-weight: var(--xhs-weight-medium);
  color: var(--xhs-caption);
}

.record-fee-row {
  margin-top: 12rpx;
  padding-top: 8rpx;
  border-top: 1px solid var(--xhs-divider);
}

.record-fee-text {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption-light);
  font-weight: var(--xhs-weight-regular);
}

.record-journal-wrap {
  margin-top: 12rpx;
  padding: 12rpx 16rpx;
  background: var(--xhs-bg-secondary);
  border-radius: var(--xhs-radius-sm);
}

.record-reason {
  font-size: var(--xhs-font-sm);
  color: var(--xhs-body);
  line-height: 1.5;
  margin-top: 6rpx;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* =============================
   分红记录
   ============================= */
.dividend-item {
  padding: var(--page-margin);
  margin: 0 var(--page-margin);
  border-top: 1px solid var(--xhs-divider);
  transition: var(--xhs-transition-slow);
}

.dividend-item:first-child {
  border-top: none;
}

.dividend-item:active {
  background: rgba(0, 0, 0, 0.02);
}

.dividend-item.dissolving {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
  max-height: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  overflow: hidden !important;
  transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 400ms cubic-bezier(0.4, 0, 0.2, 1),
    max-height 400ms cubic-bezier(0.4, 0, 0.2, 1),
    padding 400ms cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.dividend-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.dividend-date {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption-light);
  font-weight: var(--xhs-weight-regular);
}

.dividend-detail-row {
  display: flex;
  gap: var(--xhs-space-md);
  margin-bottom: 8rpx;
}

.dividend-detail {
  font-size: var(--xhs-font-sm);
  color: var(--xhs-caption);
  font-weight: var(--xhs-weight-medium);
}

.dividend-amount {
  font-size: var(--xhs-font-xl);
  font-weight: var(--xhs-weight-bold);
}

.dividend-amount.dividend,
.data-cell-value.dividend {
  color: var(--xhs-dividend);
}

/* =============================
   策略复盘
   ============================= */
.strategy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
}

.strategy-row-bordered {
  border-top: 1px solid var(--xhs-divider);
}

.strategy-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--xhs-radius-pill);
  font-size: var(--xhs-font-xs);
  background: var(--xhs-primary-bg);
  color: var(--xhs-primary);
  font-weight: var(--xhs-weight-medium);
}

.strategy-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.strategy-pnl {
  font-size: var(--xhs-font-md);
  font-weight: var(--xhs-weight-semibold);
}

.strategy-count {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption);
  font-weight: var(--xhs-weight-regular);
}
```

---

### Task 4: Lint + Visual Verification

**Step 1:** Run biome lint on all changed files:

```bash
cd C:/Users/Administrator/Downloads/work/note-boook
npx biome check packageDetail/pages/detail/detail.js
```

Expected: No errors. Fix any warnings with `--write --unsafe` if needed.

**Step 2:** Run existing tests to confirm no regressions:

```bash
npm test
```

Expected: All tests pass (this change doesn't affect tested utils, but confirms no accidental breakage).

**Step 3:** Open project in WeChat DevTools, navigate to a stock detail page. Visually verify:

- Hero card shows stock name, code, large price, PnL with badge
- Hero background has subtle gradient tint based on profit/loss state
- Data panel shows 2-column grid for position summary, 4-column grid for PnL breakdown
- Edit mode opens within data panel with labeled inputs
- Transaction records have journal section wrapped in gray bg pill
- Dividend records show 3-line layout
- Strategy review shows tag left + PnL/count right
- Stagger animation plays correctly on page entrance
- All cards have consistent margin, radius, shadow

**Step 4:** Commit all changes:

```bash
git add packageDetail/pages/detail/detail.js packageDetail/pages/detail/detail.wxml packageDetail/pages/detail/detail.wxss
git commit -m "style: redesign stock detail page with Hero-DataPanel-List hierarchy"
```
