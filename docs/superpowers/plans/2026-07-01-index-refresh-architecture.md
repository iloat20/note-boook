# 持仓页刷新架构重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 6 scattered refresh entry points in `pages/index/index.js` into a single `refresh(opts)` pipeline that serializes loadData → fetchPrices, eliminating race conditions.

**Architecture:** Add a `refresh({ force, fetchPrices })` method that all entry points call. Remove `_loading` guard from `_loadData` (replaced by `_refreshing` in refresh). Remove `isTradingTime()` checks and 30s throttle from entry points — PriceCache TTL handles throttling.

**Tech Stack:** WeChat Mini Program JS (Page lifecycle), existing positionService, PriceCache, appStore.

## Global Constraints

- Only modify `pages/index/index.js` — no other files
- Keep CommonJS module system, double quotes, tab indentation
- `_loadData` internal data computation logic stays unchanged
- `_fetchPrices` internal update logic stays unchanged
- `onRefreshPrice` (single stock manual refresh button) stays independent — does not go through refresh pipeline
- `onMarketTabChange` stays unchanged — it only filters cached data

---

### Task 1: Add refresh() method + rewrite entry points + adjust _loadData/_fetchPrices

**Files:**
- Modify: `pages/index/index.js`

**Step 1:** Add `refresh` method and `_refreshing` field. Insert after the `onUnload()` method (around line 165):

```javascript
	// ========== 统一刷新管道 ==========
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
	},
```

**Step 2:** Rewrite `onLoad`. Replace the existing `onLoad` (lines 114-138):

```javascript
	async onLoad() {
		pageMixin.onLoadMixin(this);
		this.updateDate();

		const systemInfo = getApp().globalData.systemInfo || wx.getWindowInfo() || {};
		const windowHeight = systemInfo.windowHeight || 667;
		const statusBarHeight = this.data.statusBarHeight || systemInfo.statusBarHeight || 44;
		const fixedHeight = statusBarHeight + 180;
		const scrollHeight = windowHeight - fixedHeight;
		this.setData({ scrollHeight: Math.max(scrollHeight, 300) });

		await this.refresh();
	},
```

**Step 3:** Rewrite `onShow`. Replace the existing `onShow` (lines 140-158):

```javascript
	async onShow() {
		const dirty = pageMixin.onShowMixin(this, 0);
		if (dirty || this._allPositionsCache?.length > 0) {
			await this.refresh();
		}
	},
```

**Step 4:** Rewrite `onPullDownRefresh`. Replace the existing `onPullDownRefresh` (lines 167-174):

```javascript
	async onPullDownRefresh() {
		try {
			await this.refresh({ force: true });
		} finally {
			wx.stopPullDownRefresh();
		}
	},
```

**Step 5:** Rewrite `onQuickRecordSubmit`. Replace the existing `onQuickRecordSubmit` (lines 590-596):

```javascript
	async onQuickRecordSubmit() {
		this.setData({ showQuickRecord: false });
		await this.refresh();
	},
```

**Step 6:** Rewrite `updatePrice`. Replace the existing `updatePrice` (lines 513-523):

```javascript
	updatePrice(e) {
		const stockId = parseInt(e.currentTarget.dataset.stockId, 10);
		if (Number.isNaN(stockId)) return;
		const price = parseFloat(e.detail.value);
		if (!Number.isNaN(price) && price > 0) {
			PriceCache.set(stockId, price);
		}
		this.refresh({ fetchPrices: false });
	},
```

**Step 7:** Rewrite `onSwipeDelete` callback. In the existing `onSwipeDelete` method, replace the `setTimeout` callback body (lines 753-763). Change `this._loadData()` to `this.refresh()`:

```javascript
	onSwipeDelete(e) {
		const stockId = e.currentTarget.dataset.stockId;
		confirmDelete({
			content: "将删除该股票的所有交易记录和分红记录，是否确认？",
			onConfirm: () => {
				this.setData({ deletingId: stockId });
				setTimeout(() => {
					Stock.delete(stockId);
					Transaction.deleteByStockId(stockId);
					Dividend.deleteByStockId(stockId);
					success("删除成功");
					this.setData({ deletingId: null });
					this.refresh();
				}, 400);
			},
		});
	},
```

**Step 8:** Remove `_loading` guard from `_loadData`. In the `_loadData` method, remove these two lines:
- Line 178: `if (this._loading) return;`
- Line 179: `this._loading = true;`

Keep `this.setData({ loading: true })` (UI skeleton screen control) and `this._loading = false` at the end and in catch block.

**Step 9:** Change `_fetchPrices` internal fallback calls. In `_fetchPrices`, there are two places that call `this._loadData()` as fallback:
1. Around line 667: `this._loadData();` (when no valid results) — change to `this.refresh({ fetchPrices: false });`
2. Around line 681: `this._loadData();` (in catch block) — change to `this.refresh({ fetchPrices: false });`

**Step 10:** Remove dead code. Delete the `isTradingTime()` function (lines 43-54) — it's no longer used by any entry point.

**Step 11:** Run lint:

```bash
cd C:/Users/Administrator/Downloads/work/note-boook
npx biome check pages/index/index.js
```

Expected: No errors.

**Step 12:** Run tests:

```bash
npm test -- --testPathPattern="tests/"
```

Expected: All main tests pass.

---

### Task 2: Verify + Commit

**Step 1:** In WeChat DevTools, verify:
- Page loads normally, positions display
- Navigate to record page, add a transaction, return → data refreshes, prices update
- Quick-record: add transaction → data refreshes, prices update
- Pull-down refresh → force reload
- Delete stock via swipe → data refreshes
- Edit price inline → data refreshes without re-fetching prices

**Step 2:** Commit:

```bash
git add pages/index/index.js
git commit -m "refactor: unify index page refresh into single refresh() pipeline

Consolidate 6 scattered refresh entry points into refresh({force, fetchPrices}).
Serialize loadData → fetchPrices to eliminate race conditions.
Remove isTradingTime() checks and 30s throttle — PriceCache TTL handles throttling.
Remove _loading guard from _loadData, use _refreshing in refresh() instead."
```
