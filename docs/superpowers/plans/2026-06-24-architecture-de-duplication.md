# 架构去重第一阶段 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除项目中四类架构裂缝（删除确认重复、子包页面 pageMixin 缺失、表单逻辑双份、文档脱节），让架构更优雅，不改变任何功能行为。

**Architecture:** 纯重构，四个独立模块按 ①confirmDelete → ②pageMixin → ③tradeForm → ④文档 顺序实施。每模块可独立提交、独立验证。遵循「只消除重复、不改变行为、不碰 WXML」原则。

**Tech Stack:** 微信小程序（CommonJS `require/module.exports`），Jest 测试，Biome lint。

## Global Constraints

- **模块系统**：CommonJS `require()` / `module.exports`，禁止 ES modules。
- **代码风格**：JS 用 Tab 缩进、双引号、100 字符行宽（Biome 强制）。
- **不碰 WXML/WXSS**：本次只改 `.js` 文件，不动模板和样式。
- **不改变行为**：所有删除流程、表单提交、页面刷新行为必须与现状完全一致。
- **验证命令**：Lint `npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`；测试 `npm test`。
- **测试 mock**：Jest 全局 mock 了 `wx` API（`wx.getStorageSync`/`wx.setStorageSync` 等）。
- **提交规范**：`refactor:` 前缀用于纯重构，`docs:` 用于文档，`feat:` 用于新增 helper。

**Spec 参考**：`docs/superpowers/specs/2026-06-24-architecture-de-duplication-design.md`

---

## Task 1: 创建 `confirmDelete` helper

**Files:**
- Create: `utils/ui/confirmDialog.js`

**Interfaces:**
- Produces: `confirmDelete({ title?, content, onConfirm })` — 统一删除确认弹窗。`title` 默认 `"确认删除"`，`confirmColor` 固定 `#FF3B30`，`confirmText` 固定 `"删除"`。用户确认后同步调用 `onConfirm()`。

- [ ] **Step 1: 创建 helper 文件**

创建 `utils/ui/confirmDialog.js`：

```javascript
/**
 * confirmDialog.js — 统一确认删除弹窗
 *
 * 封装 wx.showModal 的删除确认模式（标题/确认色/确认判定）。
 * 动画字段名和删除后回调由调用方处理，本 helper 只消灭 showModal 样板。
 */

/**
 * 确认删除弹窗。统一 history/detail/index 的删除确认入口。
 *
 * @param {Object} options
 * @param {string} [options.title="确认删除"] - 弹窗标题
 * @param {string} options.content - 弹窗正文
 * @param {Function} options.onConfirm - 用户确认后执行（删除 + 回调）
 * @returns {void}
 */
function confirmDelete(options) {
	const { title = "确认删除", content, onConfirm } = options;
	wx.showModal({
		title: title,
		content: content,
		confirmText: "删除",
		confirmColor: "#FF3B30",
		success: (res) => {
			if (res.confirm && typeof onConfirm === "function") {
				onConfirm();
			}
		},
	});
}

module.exports = { confirmDelete };
```

- [ ] **Step 2: Lint 检查**

Run: `npx biome check utils/ui/confirmDialog.js`
Expected: 无错误（文件符合 Tab 缩进、双引号规范）。

- [ ] **Step 3: Commit**

```bash
git add utils/ui/confirmDialog.js
git commit -m "feat: 新增 confirmDelete helper 统一删除确认弹窗"
```

---

## Task 2: history.js 接入 `confirmDelete`

**Files:**
- Modify: `pages/history/history.js` — `batchDelete` 函数（约 304-336 行）、`showActions` 函数（约 370-389 行）

**Interfaces:**
- Consumes: `confirmDelete` from Task 1。

- [ ] **Step 1: 添加 import**

在 `pages/history/history.js` 顶部 import 区（第 6 行 `const pageMixin = ...` 之后）添加：

```javascript
const { confirmDelete } = require("../../utils/ui/confirmDialog");
```

- [ ] **Step 2: 改造 `batchDelete` 函数**

找到 `batchDelete` 函数（约 304 行），将 `wx.showModal({...})` 块替换为 `confirmDelete`。

改造前（保留作为参照，不要写进文件）：
```javascript
batchDelete() {
  const count = this.data.selectedIds.length;
  if (count === 0) return;
  wx.showModal({
    title: "确认删除",
    content: `确定要删除选中的 ${count} 条记录吗？`,
    success: (res) => {
      if (res.confirm) {
        wx.showLoading({ title: "删除中..." });
        // ...删除逻辑...
      }
    },
  });
}
```

改造后（写入文件）：
```javascript
	batchDelete() {
		const count = this.data.selectedIds.length;
		if (count === 0) return;

		confirmDelete({
			content: `确定要删除选中的 ${count} 条记录吗？`,
			onConfirm: () => {
				wx.showLoading({ title: "删除中..." });
				const ids = this.data.selectedIds;
				const typeMap = this.data.selectedTypeMap;
				ids.forEach((id) => {
					const recordType = typeMap[id];
					if (recordType === "DIVIDEND") {
						Dividend.delete(id);
					} else {
						Transaction.delete(id);
					}
				});
				wx.hideLoading();
				wx.showToast({ title: `已删除 ${count} 条`, icon: "success" });
				this.setData({
					selectMode: false,
					selectedIds: [],
					selectedMap: {},
					selectedTypeMap: {},
				});
				this.loadHistory();
			},
		});
	},
```

- [ ] **Step 3: 改造 `showActions` 函数中的删除分支**

找到 `showActions` 函数（约 349 行）里 `else if (action.value === "delete")` 分支内的 `wx.showModal({...})` 块。

改造后（写入文件，注意 `showActions` 外层是 `wx.showActionSheet`，只替换内层 `showModal`）：
```javascript
				} else if (action.value === "delete") {
					confirmDelete({
						content: `确定要删除这笔${record.typeText}记录吗？`,
						onConfirm: () => {
							this.setData({ dissolvingId: record.id });
							setTimeout(() => {
								if (record.type === "DIVIDEND") {
									Dividend.delete(record.id);
								} else {
									Transaction.delete(record.id);
								}
								wx.showToast({ title: "删除成功", icon: "success" });
								this.setData({ dissolvingId: null });
								this.loadHistory();
							}, 400);
						},
					});
				}
```

- [ ] **Step 4: Lint 检查**

Run: `npx biome check pages/history/history.js`
Expected: 无错误。

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 全部通过（现有 4 个测试不回归）。

- [ ] **Step 6: Commit**

```bash
git add pages/history/history.js
git commit -m "refactor: history.js 删除确认接入 confirmDelete helper"
```

---

## Task 3: detail.js 接入 `confirmDelete`

**Files:**
- Modify: `packageDetail/pages/detail/detail.js` — `showTransactionActions`（约 238-264 行）、`showDividendActions`（约 266-294 行）

**Interfaces:**
- Consumes: `confirmDelete` from Task 1。

- [ ] **Step 1: 添加 import**

在 `packageDetail/pages/detail/detail.js` 顶部 import 区（第 13 行 `const { toast, success: fbSuccess } = ...` 之后）添加：

```javascript
const { confirmDelete } = require("../../../utils/ui/confirmDialog");
```

- [ ] **Step 2: 改造 `showTransactionActions` 函数**

找到 `showTransactionActions`（约 238 行）里 `else if (res.tapIndex === 1)` 分支内的 `wx.showModal({...})` 块。

改造后（写入文件，外层 `wx.showActionSheet` 不变，只替换内层 `showModal`）：
```javascript
				} else if (res.tapIndex === 1) {
					confirmDelete({
						content: "确定要删除这笔交易记录吗？",
						onConfirm: () => {
							this.setData({ disTransId: Number(id) });
							if (this._deleteTransTimer) clearTimeout(this._deleteTransTimer);
							this._deleteTransTimer = setTimeout(() => {
								Transaction.delete(id);
								this.loadData();
							}, 400);
						},
					});
				}
```

- [ ] **Step 3: 改造 `showDividendActions` 函数**

找到 `showDividendActions`（约 266 行）里 `else if (res.tapIndex === 1)` 分支内的 `wx.showModal({...})` 块。

改造后（写入文件）：
```javascript
				} else if (res.tapIndex === 1) {
					confirmDelete({
						content: "确定要删除这笔分红记录吗？",
						onConfirm: () => {
							this.setData({ disDivId: Number(id) });
							if (this._deleteDivTimer) clearTimeout(this._deleteDivTimer);
							this._deleteDivTimer = setTimeout(() => {
								Dividend.delete(id);
								this.loadData();
							}, 400);
						},
					});
				}
```

- [ ] **Step 4: Lint 检查**

Run: `npx biome check packageDetail/pages/detail/detail.js`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add packageDetail/pages/detail/detail.js
git commit -m "refactor: detail.js 删除确认接入 confirmDelete helper"
```

---

## Task 4: index.js 接入 `confirmDelete`

**Files:**
- Modify: `pages/index/index.js` — `onSwipeDelete`（约 731-755 行）

**Interfaces:**
- Consumes: `confirmDelete` from Task 1。

- [ ] **Step 1: 添加 import**

在 `pages/index/index.js` 顶部 import 区（第 16 行 `const { toast, success, loading, hideLoading, catchError } = ...` 之后）添加：

```javascript
const { confirmDelete } = require("../../utils/ui/confirmDialog");
```

- [ ] **Step 2: 改造 `onSwipeDelete` 函数**

找到 `onSwipeDelete`（约 731 行）里的 `wx.showModal({...})` 块。

改造后（写入文件）：
```javascript
	onSwipeDelete(e) {
		const stockId = e.currentTarget.dataset.stockId;

		confirmDelete({
			content: "将删除该股票的所有交易记录和分红记录，是否确认？",
			onConfirm: () => {
				// 先触发删除动画
				this.setData({ deletingId: stockId });

				// 等待动画完成后执行删除
				setTimeout(() => {
					Stock.delete(stockId);
					Transaction.deleteByStockId(stockId);
					Dividend.deleteByStockId(stockId);

					wx.showToast({ title: "删除成功", icon: "success" });
					this.setData({ deletingId: null });
					this._loadData();
				}, 400);
			},
		});
	},
```

- [ ] **Step 3: Lint 检查**

Run: `npx biome check pages/index/index.js`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add pages/index/index.js
git commit -m "refactor: index.js 删除确认接入 confirmDelete helper"
```

---

## Task 5: pageMixin 新增 `onShowSubPackage`

**Files:**
- Modify: `utils/ui/pageMixin.js` — 新增 `onShowSubPackage` 函数并导出

**Interfaces:**
- Produces: `onShowSubPackage(page)` — 子包页面 onShow 公共逻辑，消费 dirty 标记（不设 TabBar），返回 boolean 表示是否需刷新。

- [ ] **Step 1: 新增 `onShowSubPackage` 函数**

在 `utils/ui/pageMixin.js` 的 `consumeDirtyFlag` 函数（约 53-60 行）之后，添加新函数：

```javascript
/**
 * 子包页面 onShow 公共逻辑：消费 dirty 标记（不设 TabBar）。
 * 供 detail/record/dividend 等非 tab 页面使用。
 * @param {Object} page - 页面实例（this）
 * @returns {boolean} 数据是否需要刷新
 */
function onShowSubPackage(page) {
	return consumeDirtyFlag();
}
```

- [ ] **Step 2: 更新 module.exports**

在 `module.exports` 中添加 `onShowSubPackage`：

```javascript
module.exports = {
	initPageData,
	onLoadMixin,
	onShowMixin,
	onShowSubPackage,
	setTabSelected,
	consumeDirtyFlag,
};
```

- [ ] **Step 3: Lint 检查**

Run: `npx biome check utils/ui/pageMixin.js`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add utils/ui/pageMixin.js
git commit -m "feat: pageMixin 新增 onShowSubPackage 供子包页面使用"
```

---

## Task 6: detail.js 接入 pageMixin

**Files:**
- Modify: `packageDetail/pages/detail/detail.js` — data 初始化（约 16-53 行）、`onLoad`（约 55-62 行）、`onShow`（约 64-68 行）

**Interfaces:**
- Consumes: `pageMixin.initPageData`、`pageMixin.onLoadMixin`、`pageMixin.onShowSubPackage` from Task 5。

- [ ] **Step 1: 改造 data 初始化**

将 data 顶部的手写 navBar 字段（约 17-18 行）：
```javascript
		statusBarHeight: 0,
		navBarHeight: 44,
```
替换为用 `initPageData` 展开。改造后 `data` 开头为：
```javascript
	data: {
		...pageMixin.initPageData(),
		stock: null,
```
（删除原来的 `statusBarHeight: 0,` 和 `navBarHeight: 44,` 两行，改用 `...pageMixin.initPageData(),`）

- [ ] **Step 2: 改造 `onLoad`**

将 `onLoad` 中手写 navBar 设置（约 56 行）：
```javascript
		this.setData(getApp().getNavBarInfo());
```
替换为：
```javascript
		pageMixin.onLoadMixin(this);
```

改造后 `onLoad` 完整为：
```javascript
	onLoad(options) {
		pageMixin.onLoadMixin(this);

		if (options?.stockId) {
			this._stockId = parseInt(options.stockId, 10);
			this.loadData();
		}
	},
```

- [ ] **Step 3: 改造 `onShow`**

将 `onShow`（约 64-68 行）：
```javascript
	onShow() {
		if (pageMixin.consumeDirtyFlag() || !this._dataLoaded) {
			this.loadData();
		}
	},
```
替换为用 `onShowSubPackage`：
```javascript
	onShow() {
		if (pageMixin.onShowSubPackage(this) || !this._dataLoaded) {
			this.loadData();
		}
	},
```

- [ ] **Step 4: Lint 检查**

Run: `npx biome check packageDetail/pages/detail/detail.js`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add packageDetail/pages/detail/detail.js
git commit -m "refactor: detail.js 接入 pageMixin 统一生命周期"
```

---

## Task 7: record.js 接入 pageMixin（含 dirty 消费）

**Files:**
- Modify: `packageRecord/pages/record/record.js` — data 初始化（约 20-53 行）、`onLoad`（约 55-95 行）、新增 `onShow` 和 `_refreshAuxData`

**Interfaces:**
- Consumes: `pageMixin.initPageData`、`pageMixin.onLoadMixin`、`pageMixin.onShowSubPackage` from Task 5。

- [ ] **Step 1: 添加 pageMixin import**

在 `packageRecord/pages/record/record.js` 顶部 import 区（第 17 行 `const { toast, success } = ...` 之后）添加：

```javascript
const pageMixin = require("../../../utils/ui/pageMixin");
```

- [ ] **Step 2: 改造 data 初始化**

将 data 顶部的手写 navBar 字段（约 21-22 行）：
```javascript
		statusBarHeight: 0,
		navBarHeight: 44,
```
替换为用 `initPageData` 展开。改造后 `data` 开头为：
```javascript
	data: {
		...pageMixin.initPageData(),
		market: MARKETS.A_SHARE,
```

- [ ] **Step 3: 改造 `onLoad`**

将 `onLoad` 中手写 navBar 设置（约 56 行）：
```javascript
		this.setData(getApp().getNavBarInfo());
```
替换为：
```javascript
		pageMixin.onLoadMixin(this);
```

- [ ] **Step 4: 新增 `onShow` 和 `_refreshAuxData`**

在 `onLoad` 函数之后（`_loadEdit` 函数之前）新增两个函数：
```javascript
	onShow() {
		if (pageMixin.onShowSubPackage(this)) {
			this._refreshAuxData();
		}
	},

	// dirty 刷新辅助数据：只更新策略标签列表，绝不触碰用户输入字段
	_refreshAuxData() {
		this.setData({ allStrategies: Strategy.getAll() });
	},
```

> 注意：`_refreshAuxData` 只刷 `allStrategies`（其他页面可能新增自定义策略）。不触碰 code/name/price/quantity 等输入字段，也不重新触发 SELL 默认数量填充（避免覆盖用户已改的 quantity）。

- [ ] **Step 5: Lint 检查**

Run: `npx biome check packageRecord/pages/record/record.js`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add packageRecord/pages/record/record.js
git commit -m "refactor: record.js 接入 pageMixin 并新增 dirty 辅助数据刷新"
```

---

## Task 8: dividend.js 接入 pageMixin（含 dirty 消费）

**Files:**
- Modify: `packageDetail/pages/dividend/dividend.js` — data 初始化（约 6-22 行）、`onLoad`（约 24-47 行）、新增 `onShow`

**Interfaces:**
- Consumes: `pageMixin.initPageData`、`pageMixin.onLoadMixin`、`pageMixin.onShowSubPackage` from Task 5。

- [ ] **Step 1: 添加 pageMixin import**

在 `packageDetail/pages/dividend/dividend.js` 顶部 import 区（第 3 行 `const { toast, success } = ...` 之后）添加：

```javascript
const pageMixin = require("../../../utils/ui/pageMixin");
```

- [ ] **Step 2: 改造 data 初始化**

将 data 顶部的手写 navBar 字段（约 7-8 行）：
```javascript
		statusBarHeight: 0,
		navBarHeight: 44,
```
替换为用 `initPageData` 展开。改造后 `data` 开头为：
```javascript
	data: {
		...pageMixin.initPageData(),
		stockOptions: [],
```

- [ ] **Step 3: 改造 `onLoad`**

将 `onLoad` 中手写 navBar 设置（约 25 行）：
```javascript
		this.setData(getApp().getNavBarInfo());
```
替换为：
```javascript
		pageMixin.onLoadMixin(this);
```

- [ ] **Step 4: 新增 `onShow`**

在 `onLoad` 函数之后（`_loadStocks` 函数之前）新增：
```javascript
	onShow() {
		if (pageMixin.onShowSubPackage(this)) {
			this._refreshAuxData();
		}
	},

	// dirty 刷新辅助数据：只更新股票下拉列表，绝不触碰用户输入字段
	_refreshAuxData() {
		this._loadStocks();
	},
```

> 注意：`_refreshAuxData` 只重新加载 `stockOptions`（其他页面可能新增了股票）。不触碰 perShare/qty/shareQty/date/note 等输入字段。

- [ ] **Step 5: Lint 检查**

Run: `npx biome check packageDetail/pages/dividend/dividend.js`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add packageDetail/pages/dividend/dividend.js
git commit -m "refactor: dividend.js 接入 pageMixin 并新增 dirty 辅助数据刷新"
```

---

## Task 9: 创建 `tradeForm` helper

**Files:**
- Create: `utils/helpers/tradeForm.js`

**Interfaces:**
- Produces:
  - `calcTradeAmount(price, qty): number` — 计算成交额
  - `calcActualAmount(type, tradeAmount, fee): number` — 计算实际金额
  - `checkSellable(stock, qty, opts?): { ok, error? }` — 卖出校验
  - `createAutoFetcher(config): { scheduleFetch, doFetch, clear }` — 自动拉价工厂，config 含 `{ isValid, fetchPrice, apply, onDone? }`
- Consumes: `getSellableQuantity` from `utils/services/positionService`

- [ ] **Step 1: 创建 helper 文件**

创建 `utils/helpers/tradeForm.js`：

```javascript
/**
 * tradeForm.js — 交易表单共享逻辑（纯函数 + 工厂）
 *
 * record.js (Page) 与 quick-record.js (Component) 的公共逻辑。
 * 通过纯函数共享费用/校验计算，通过 createAutoFetcher 工厂
 * 封装自动拉价的防抖+去重状态机，字段差异由各调用方的 apply 回调处理。
 */

const { getSellableQuantity } = require("../services/positionService");

/**
 * 计算成交额 = 价格 × 数量
 * @param {string|number} price
 * @param {string|number} qty
 * @returns {number}
 */
function calcTradeAmount(price, qty) {
	return (parseFloat(price) || 0) * (parseInt(qty, 10) || 0);
}

/**
 * 计算实际金额（买入加手续费，卖出减手续费）
 * @param {"BUY"|"SELL"} type
 * @param {number} tradeAmount - 成交额
 * @param {number} fee - 手续费
 * @returns {number}
 */
function calcActualAmount(type, tradeAmount, fee) {
	return type === "BUY" ? tradeAmount + fee : tradeAmount - fee;
}

/**
 * 卖出校验
 * @param {Object|null} stock - 已存在的股票（Stock.getByCode 结果）
 * @param {string|number} qty - 卖出数量
 * @param {Object} [opts]
 * @param {number} [opts.ignoreTransactionId] - 编辑时忽略某交易
 * @returns {{ ok: boolean, error?: string }}
 */
function checkSellable(stock, qty, opts = {}) {
	if (!stock) return { ok: false, error: "暂无可卖持仓" };
	const sellable = getSellableQuantity(stock.id, opts.ignoreTransactionId);
	if (parseInt(qty, 10) > sellable) {
		return { ok: false, error: "卖出数量超过持仓" };
	}
	return { ok: true };
}

/**
 * 自动拉价工厂。封装防抖 + 去重 + 请求 + 清锁的状态机。
 * 通过 config.apply 让调用方绑定自己的字段名。
 *
 * @param {Object} config
 * @param {Function} config.isValid    - (code) => boolean，代码是否有效
 * @param {Function} config.fetchPrice - (code) => Promise<{name, currentPrice}>
 * @param {Function} config.apply      - (result, code) => void，应用结果（各自 setData）
 * @param {Function} [config.onDone]   - () => void，请求结束回调（清除 loading 态等）
 * @returns {{ scheduleFetch: Function, doFetch: Function, clear: Function }}
 */
function createAutoFetcher(config) {
	let timer = null;
	let fetchingCode = null;

	function doFetch(code) {
		if (!code || !config.isValid(code)) return;
		if (fetchingCode === code) return;
		fetchingCode = code;

		config
			.fetchPrice(code)
			.then((data) => {
				if (data) config.apply(data, code);
			})
			.catch(() => {})
			.then(() => {
				fetchingCode = null;
				if (config.onDone) config.onDone();
			});
	}

	function scheduleFetch(code, delay) {
		clear();
		if (!code || !config.isValid(code)) return;
		timer = setTimeout(() => doFetch(code), delay);
	}

	function clear() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	return { scheduleFetch, doFetch, clear };
}

module.exports = {
	calcTradeAmount,
	calcActualAmount,
	checkSellable,
	createAutoFetcher,
};
```

- [ ] **Step 2: Lint 检查**

Run: `npx biome check utils/helpers/tradeForm.js`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add utils/helpers/tradeForm.js
git commit -m "feat: 新增 tradeForm helper（交易表单共享逻辑）"
```

---

## Task 10: record.js 接入 `tradeForm`

**Files:**
- Modify: `packageRecord/pages/record/record.js` — import 区、`onLoad`、`_scheduleAutoFetch`/`_clearAutoFetch`/`_tryAutoFetch`、`_calcFee`、`submit`

**Interfaces:**
- Consumes: `calcTradeAmount`、`calcActualAmount`、`checkSellable`、`createAutoFetcher` from Task 9。

- [ ] **Step 1: 添加 tradeForm import 并替换部分 service import**

在 `packageRecord/pages/record/record.js` 顶部 import 区，第 6-7 行 `const { getSellableQuantity, calculatePosition } = require(...positionService)` 改为只导入 `calculatePosition`（`getSellableQuantity` 将由 `checkSellable` 内部使用）：

```javascript
const { calculatePosition } = require("../../../utils/services/positionService");
```

然后在 import 区（`fetchStockPrice` import 之后）添加：
```javascript
const {
	calcTradeAmount,
	calcActualAmount,
	checkSellable,
	createAutoFetcher,
} = require("../../../utils/helpers/tradeForm");
```

- [ ] **Step 2: 在 `onLoad` 中初始化 autoFetcher**

在 `onLoad` 函数开头（`pageMixin.onLoadMixin(this);` 之后，`this._feeManuallySet = false;` 之前）初始化 autoFetcher：
```javascript
		this._autoFetcher = createAutoFetcher({
			isValid: (code) => validateStockCode(code, this.data.market),
			fetchPrice: (code) => fetchStockPrice(this.data.market, code),
			apply: (data, code) => {
				if (data?.name && this.data.code === code) {
					const updates = { name: data.name };
					if (!this.data.price || parseFloat(this.data.price) === 0) {
						updates.price = String(data.currentPrice);
					}
					this.setData(updates);
					this._calcFee();
					if (data.currentPrice > 0) {
						const stock = Stock.getByCode(code, this.data.market);
						if (stock) PriceCache.set(stock.id, data.currentPrice);
					}
				}
			},
		});
```

- [ ] **Step 3: 替换 `_scheduleAutoFetch`/`_clearAutoFetch`/`_tryAutoFetch`**

删除原来的 `_scheduleAutoFetch`、`_clearAutoFetch`、`_tryAutoFetch` 三个函数（约 262-309 行），替换为薄包装：
```javascript
	// 延迟自动获取（输入时防抖）
	_scheduleAutoFetch(code) {
		this._autoFetcher.scheduleFetch(code, TIMING_CONFIG.AUTO_FETCH_DELAY_MS);
	},

	_clearAutoFetch() {
		this._autoFetcher.clear();
	},

	// 调用腾讯财经 API 获取名称和现价（失焦时立即触发）
	_tryAutoFetch(code) {
		this._autoFetcher.doFetch(code);
	},
```

- [ ] **Step 4: 改造 `_calcFee` 使用纯函数**

找到 `_calcFee`（约 311 行），将内联的成交额/实际金额计算替换为 `calcTradeAmount`/`calcActualAmount`。

改造后：
```javascript
	_calcFee() {
		if (this._feeManuallySet) return;
		const data = this.data;
		const fee = calculateFee(data.market, data.type, data.price, data.quantity);
		const breakdown = getFeeBreakdown(data.market, data.type, data.price, data.quantity);
		const tradeAmount = calcTradeAmount(data.price, data.quantity);
		const actualAmount = calcActualAmount(data.type, tradeAmount, fee);
		this.setData({
			fee: String(fee),
			feePreview: breakdown.items.map((item) => ({
				name: item.name,
				value: item.value,
				vt: fmt(item.value),
				rate: item.rate,
				min: item.min,
				note: item.note,
			})),
			amountText: fmt(tradeAmount),
			actualText: fmt(actualAmount),
		});
	},
```

- [ ] **Step 5: 改造 `submit` 中的卖出校验**

找到 `submit` 函数（约 392 行）中的卖出校验块（约 433-444 行）：
```javascript
		if (type === "SELL") {
			if (!stock) {
				toast("暂无可卖持仓");
				return;
			}
			const ignoredTransactionId = this._isEdit ? this._editId : null;
			const sellableQuantity = getSellableQuantity(stock.id, ignoredTransactionId);
			if (parseInt(quantity, 10) > sellableQuantity) {
				toast("卖出数量超过持仓");
				return;
			}
		}
```
替换为用 `checkSellable`：
```javascript
		if (type === "SELL") {
			const ignoredTransactionId = this._isEdit ? this._editId : null;
			const result = checkSellable(stock, quantity, { ignoreTransactionId: ignoredTransactionId });
			if (!result.ok) {
				toast(result.error);
				return;
			}
		}
```

- [ ] **Step 6: 改造 `onFeeInput` 中的金额计算**

找到 `onFeeInput`（约 206 行），将内联计算替换为纯函数。改造后：
```javascript
	onFeeInput(e) {
		this._feeManuallySet = true;
		this.setData({ fee: e.detail.value });
		const data = this.data;
		const tradeAmount = calcTradeAmount(data.price, data.quantity);
		const fee = parseFloat(e.detail.value) || 0;
		const actualAmount = calcActualAmount(data.type, tradeAmount, fee);
		this.setData({
			amountText: fmt(tradeAmount),
			actualText: fmt(actualAmount),
		});
	},
```

- [ ] **Step 7: Lint 检查**

Run: `npx biome check packageRecord/pages/record/record.js`
Expected: 无错误。

- [ ] **Step 8: 运行测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 9: Commit**

```bash
git add packageRecord/pages/record/record.js
git commit -m "refactor: record.js 接入 tradeForm 共享逻辑"
```

---

## Task 11: quick-record.js 接入 `tradeForm`

**Files:**
- Modify: `components/quick-record/quick-record.js` — import 区、`_onVisibleChange`/新增初始化、`_scheduleAutoFetch`/`_tryAutoFetch`、`_calcQrFee`、`submitQuickRecord`

**Interfaces:**
- Consumes: `calcTradeAmount`、`calcActualAmount`、`checkSellable`、`createAutoFetcher` from Task 9。

- [ ] **Step 1: 添加 tradeForm import 并替换部分 service import**

在 `components/quick-record/quick-record.js` 顶部 import 区，第 23 行 `const { getSellableQuantity } = require(...positionService)` 删除（`getSellableQuantity` 将由 `checkSellable` 内部使用）。

然后在 import 区添加：
```javascript
const {
	calcTradeAmount,
	calcActualAmount,
	checkSellable,
	createAutoFetcher,
} = require("../../utils/helpers/tradeForm");
```

- [ ] **Step 2: 初始化 autoFetcher**

在 `methods` 内的 `_onVisibleChange` 函数之前（`methods: {` 之后）添加一个 `_initAutoFetcher` 方法，并在 `_onVisibleChange` 的 `visible` 分支调用它。

先添加方法（在 `// ──── 生命周期 ────` 注释的 `_onVisibleChange` 之前）：
```javascript
		_initAutoFetcher: function () {
			this._autoFetcher = createAutoFetcher({
				isValid: (code) => validateStockCode(code, this.data.qrMarket),
				fetchPrice: (code) => fetchStockPrice(this.data.qrMarket, code),
				apply: (data, code) => {
					if (data?.name && this.data.qrCode === code) {
						const localResults = searchStocks(code, this.data.qrMarket, 1);
						const localName = localResults.length > 0 ? localResults[0].name : null;
						const finalName = localName || data.name;
						const updates = { qrName: finalName, qrFetching: false };
						if (!this.data.qrPrice || parseFloat(this.data.qrPrice) === 0) {
							updates.qrPrice = String(data.currentPrice);
						}
						this.setData(updates);
						this._scheduleCalcFee();
					} else {
						this.setData({ qrFetching: false });
					}
				},
				onDone: () => {
					this.setData({ qrFetching: false });
				},
			});
		},
```

然后在 `_onVisibleChange` 的 `if (visible)` 分支开头（`const now = new Date();` 之前）添加初始化调用：
```javascript
			if (visible) {
				if (!this._autoFetcher) this._initAutoFetcher();
				const now = new Date();
```

- [ ] **Step 3: 替换 `_scheduleAutoFetch`/`_tryAutoFetch`**

删除原来的 `_scheduleAutoFetch`、`_tryAutoFetch` 两个函数（约 151-189 行），替换为薄包装：
```javascript
		// ──── 自动获取（防抖）──
		_scheduleAutoFetch: function (code) {
			this._autoFetcher.scheduleFetch(code, 500);
		},

		_tryAutoFetch: function (code) {
			this.setData({ qrFetching: true });
			this._autoFetcher.doFetch(code);
		},
```

> 注意：原 `_tryAutoFetch` 在调用前会 `setData({ qrFetching: true })`，这里保留该行为（工厂的 `onDone` 负责清除）。若 `doFetch` 因无效代码/重复请求提前返回，`onDone` 仍会被 Promise 链触发清除 loading——但提前 return 时不会发请求，需保证 `qrFetching` 被清除。由于工厂 `doFetch` 在 `!isValid` 或重复时会直接 return 不触发 onDone，这里在 `_tryAutoFetch` 入口先判断：若无效代码则立即清除 loading。

修正版（处理无效代码提前清除 loading）：
```javascript
		// ──── 自动获取（防抖）──
		_scheduleAutoFetch: function (code) {
			this._autoFetcher.scheduleFetch(code, 500);
		},

		_tryAutoFetch: function (code) {
			if (!code || !validateStockCode(code, this.data.qrMarket)) {
				return;
			}
			if (this._autoFetcher.isFetching(code)) {
				return;
			}
			this.setData({ qrFetching: true });
			this._autoFetcher.doFetch(code);
		},
```

> 工厂的 `isFetching(code)` 读取闭包内的 `fetchingCode` 去重状态（Task 9.5 提供）。这样无效代码或重复请求时提前 return，不设 `qrFetching: true`，避免 loading 卡死。

- [ ] **Step 4: 改造 `_calcQrFee` 使用纯函数**

找到 `_calcQrFee`（约 252 行），替换为：
```javascript
		_calcQrFee: function () {
			const d = this.data;
			const fee = calculateFee(d.qrMarket, d.qrType, d.qrPrice, d.qrQuantity);
			const tradeAmount = calcTradeAmount(d.qrPrice, d.qrQuantity);
			const actualAmount = calcActualAmount(d.qrType, tradeAmount, fee);

			this.setData({
				qrFee: fee,
				qrFeeText: fmt(fee),
				qrAmountText: fmt(tradeAmount),
				qrActualText: fmt(actualAmount),
			});
		},
```

- [ ] **Step 5: 改造 `submitQuickRecord` 中的卖出校验**

找到 `submitQuickRecord`（约 275 行）中的卖出校验块（约 300-310 行）：
```javascript
			if (d.qrType === "SELL") {
				if (!stock) {
					wx.showToast({ title: "暂无可卖持仓", icon: "none" });
					return;
				}
				const sellableQuantity = getSellableQuantity(stock.id);
				if (parseInt(d.qrQuantity, 10) > sellableQuantity) {
					wx.showToast({ title: "卖出数量超过持仓", icon: "none" });
					return;
				}
			}
```
替换为用 `checkSellable`：
```javascript
			if (d.qrType === "SELL") {
				const result = checkSellable(stock, d.qrQuantity);
				if (!result.ok) {
					wx.showToast({ title: result.error, icon: "none" });
					return;
				}
			}
```

- [ ] **Step 6: Lint 检查**

Run: `npx biome check components/quick-record/quick-record.js`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add components/quick-record/quick-record.js
git commit -m "refactor: quick-record.js 接入 tradeForm 共享逻辑"
```

---

## Task 9.5: `createAutoFetcher` 补充 `isFetching` 导出

> Task 11 Step 3 需要：当 quick-record 的 `_tryAutoFetch` 因无效代码或重复请求提前返回时，能读取工厂去重状态以正确管理 `qrFetching` loading 态。工厂闭包内的 `fetchingCode` 是私有的，需补充 `isFetching` 导出。本任务在 Task 11 之前实施。

**Files:**
- Modify: `utils/helpers/tradeForm.js` — `createAutoFetcher` 内部及返回值

- [ ] **Step 1: 在 `createAutoFetcher` 内添加 `isFetching` 函数并导出**

找到 `createAutoFetcher` 函数。在 `doFetch` 函数定义之后、`scheduleFetch` 之前添加：
```javascript
	function isFetching(code) {
		return fetchingCode === code;
	}
```

并将 return 语句改为：
```javascript
	return { scheduleFetch, doFetch, clear, isFetching };
```

- [ ] **Step 2: Lint 检查**

Run: `npx biome check utils/helpers/tradeForm.js`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add utils/helpers/tradeForm.js
git commit -m "feat: createAutoFetcher 补充 isFetching 导出"
```

---

## Task 12: 修正 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md` — Constants 段落（约 101-107 行）、Important Caveats（约 211 行）

- [ ] **Step 1: 修正 Constants 段落**

找到 `CLAUDE.md` 的 `#### Constants (utils/constants/)` 段落（约 101 行）。将：
```markdown
#### Constants (`utils/constants/`)

- `index.js` — `MARKETS`, `TRANSACTION_TYPE`, `FEE_CONFIG`, `DEFAULT_STRATEGIES`, `TIMING_CONFIG`
- `config.js` — centralized config (API URLs, timeouts, rate defaults, XIRR params, validation limits, cache TTLs, storage keys)
- `errorCodes.js` — HTTP and business error code constants
- `market.js` — `getMarketLabel()`, `getMarketColor()`, `validateStockCode()`, `formatStockCode()`
```
替换为：
```markdown
#### Constants (`utils/constants/`)

- `index.js` — `MARKETS`, `TRANSACTION_TYPE`, `FEE_CONFIG`, `DEFAULT_STRATEGIES`, `TIMING_CONFIG`（集中配置入口，API URL/超时/缓存 TTL 等也在此或具体 service 内）
- `market.js` — `getMarketLabel()`, `getMarketColor()`, `validateStockCode()`, `formatStockCode()`

> **注意**：`utils/constants/config.js` 和 `errorCodes.js` **不存在**。所有常量用 `utils/constants/index.js`；错误类型用 `utils/errors.js`。
```

- [ ] **Step 2: 修正 Important Caveats 段落**

找到 `CLAUDE.md` 的 `## Important Caveats` 段落（约 206 行）。

将：
```markdown
- Import config from `utils/constants/config.js` — never use `process.env` directly
```
替换为：
```markdown
- Import constants from `utils/constants/index.js` — never use `process.env` directly. `utils/constants/config.js` does **not** exist.
```

将：
```markdown
- Import error types from `utils/errors.js` for semantic error handling
```
保留不变（这条已正确）。

- [ ] **Step 3: 修正 Services 段落中可能的 config 引用**

在 `CLAUDE.md` 全文搜索 `config.js`，确认无其他遗漏引用。若 `#### Services` 段落或其他位置提到 `config.js`，统一改为 `index.js`。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 修正 CLAUDE.md 错误引用 config.js/errorCodes.js（不存在）"
```

---

## Task 13: 修正 CODE_REVIEW_REPORT.md 文档

**Files:**
- Modify: `CODE_REVIEW_REPORT.md` — 问题 #8 的修复示例（约 393-414 行）

- [ ] **Step 1: 修正魔法数字修复示例中的 config.js 引用**

找到 `CODE_REVIEW_REPORT.md` 问题 #8 的「修复建议」代码块（约 393 行），其中引用了 `utils/constants/config.js`。

将示例代码块中的：
```javascript
// utils/constants/config.js
module.exports = {
  stockPrice: { ... },
  ...
}

// 使用时
const config = require('../constants/config')
```
替换为说明性注释（因为该报告是历史审查记录，不改其结论，只修正会误导的示例引用）：
```markdown
**修复建议**:（注：实际配置入口是 `utils/constants/index.js`，`config.js` 不存在）

```javascript
// utils/constants/index.js（已存在的集中配置入口）
const TIMING_CONFIG = {
  priceTtlMs: 30 * 60 * 1000,
  rateCacheTtlMs: 4 * 60 * 60 * 1000,
  // stockPrice 的并发/批量参数可补充至此
};

// 使用时
const { TIMING_CONFIG } = require('../constants/index')
```
```

- [ ] **Step 2: Commit**

```bash
git add CODE_REVIEW_REPORT.md
git commit -m "docs: 修正 CODE_REVIEW_REPORT.md 中不存在的 config.js 引用"
```

---

## Task 14: 全量验证与收尾

**Files:**
- 无新增/修改，仅验证。

- [ ] **Step 1: 全量 Lint**

Run: `npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`
Expected: 无错误。

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 3: 行为回归核对清单**

人工核对（在微信开发者工具中）以下流程行为不变：
- [ ] history：单条记录删除（确认弹窗 → 动画 → 删除 → 刷新）
- [ ] history：批量删除（确认弹窗 → loading → 删除 → toast）
- [ ] detail：删除交易记录（确认弹窗 → 动画 → 删除 → loadData）
- [ ] detail：删除分红记录（确认弹窗 → 动画 → 删除 → loadData）
- [ ] index：删除股票（确认弹窗 → 动画 → 删除 → loadData）
- [ ] detail：从 record 返回后自动刷新（dirty 消费）
- [ ] record：从其他页返回后策略列表更新（dirty 辅助刷新，输入字段不丢）
- [ ] record：新增交易（费用计算、卖出校验、自动拉价正常）
- [ ] record：编辑交易（卖出校验忽略当前交易 ID）
- [ ] quick-record：快速添加（费用计算、卖出校验、自动拉价正常）
- [ ] dividend：从其他页返回后股票下拉更新（dirty 辅助刷新）

- [ ] **Step 4: 最终提交（如有遗漏修正）**

若回归发现任何行为偏差，修复后提交。否则无需额外提交。

---

## Self-Review 记录

**Spec coverage 核对**：
- ✅ 模块一 confirmDelete：Task 1-4
- ✅ 模块二 pageMixin 统一：Task 5-8（含 record/dividend dirty 消费）
- ✅ 模块三 tradeForm 抽取：Task 9、9.5、10、11
- ✅ 模块四文档修正：Task 12-13
- ✅ 验证策略：Task 14

**类型一致性**：`createAutoFetcher` 在 Task 9 定义，Task 9.5 补充 `isFetching`，Task 10/11 使用——签名匹配（`scheduleFetch(code, delay)`/`doFetch(code)`/`clear()`/`isFetching(code)`）。`checkSellable` 在 Task 9 定义 `{ok, error?}`，Task 10/11 使用一致。

**依赖顺序**：Task 9.5（isFetching 导出）必须在 Task 11（quick-record 接入）之前实施，已调整顺序。其余任务严格按编号执行即可。
