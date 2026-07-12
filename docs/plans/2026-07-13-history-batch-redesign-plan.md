# 流水页「全部 / 转入 / 转出 + 批量」UI 重做 — 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重做流水页顶部筛选区与底部批量栏，统一到毛玻璃 / XHS feed 设计语言，并修复「全选只覆盖可见项」「切换筛选清空选择」两个交互硬伤。

**Architecture:** 纯前端改动，仅动 `pages/history/*` 三个文件 + 新增一个可单测的纯函数 `utils/helpers/batchSelect.js`（抽取选中态重算逻辑，便于 TDD）。数据层（models/services）与 `recordView.js` 类型文案不动。当前仓库工作树已包含最新 v3 实现，直接在现有工作目录实现（不开 worktree，避免基于陈旧 HEAD）。

**Tech Stack:** 微信小程序原生（WXML/WXSS/JS，CommonJS）、Jest（Node 环境，mock wx）、biome lint。

**设计依据：** `docs/plans/2026-07-13-history-batch-redesign-design.md`

---

## Task 1：基线校验

**Files:**
- Run: `npm test`
- Run: `npx biome lint pages/ utils/ components/ packageDetail/ packageRecord/`

**Step 1：运行测试**
```
npm test
```
Expected: 全部用例通过（当前约 127 例，0 failure）。记录通过数作为基线。

**Step 2：运行 lint**
```
npx biome lint pages/ utils/ components/ packageDetail/ packageRecord/
```
Expected: 无 error（仅 CRLF 格式化差异属预存问题，可忽略）。

> 若基线测试有失败，先停下报告，不要继续。

---

## Task 2：抽取可单测的选中态纯函数（TDD）

**Files:**
- Create: `utils/helpers/batchSelect.js`
- Create: `tests/batchSelect.test.js`

**Step 1：写失败测试**

`tests/batchSelect.test.js`：
```js
const { collectFilterIds, isAllSelected } = require("../utils/helpers/batchSelect");

test("collectFilterIds 摊平分组记录", () => {
	const grouped = [{ items: [{ id: 1 }, { id: 2 }] }, { items: [{ id: 3 }] }];
	expect(collectFilterIds(grouped)).toEqual([1, 2, 3]);
});

test("isAllSelected: 筛选内全部选中 => true", () => {
	expect(isAllSelected([1, 2, 3], [1, 2, 3])).toBe(true);
});

test("isAllSelected: 仅选中子集 => false", () => {
	expect(isAllSelected([1], [1, 2, 3])).toBe(false);
});

test("isAllSelected: 筛选为空 => false", () => {
	expect(isAllSelected([], [])).toBe(false);
});
```

**Step 2：运行确认失败**
```
npx jest tests/batchSelect.test.js
```
Expected: FAIL（`Cannot find module '../utils/helpers/batchSelect'`）。

**Step 3：最小实现**

`utils/helpers/batchSelect.js`：
```js
// 纯函数：把 groupedHistory（[{date, items:[{id}]}]）摊平为 id 数组
function collectFilterIds(grouped) {
	const ids = [];
	(grouped || []).forEach((g) => {
		(g.items || []).forEach((it) => ids.push(it.id));
	});
	return ids;
}

// 纯函数：当前筛选内 id 是否全部被选中
function isAllSelected(selectedIds, filterIds) {
	if (!filterIds || filterIds.length === 0) return false;
	const set = new Set(selectedIds || []);
	return filterIds.every((id) => set.has(id));
}

module.exports = { collectFilterIds, isAllSelected };
```

**Step 4：运行确认通过**
```
npx jest tests/batchSelect.test.js
```
Expected: PASS（4/4）。

**Step 5：提交**
```bash
git add utils/helpers/batchSelect.js tests/batchSelect.test.js
git commit -m "test: 抽取批量选中态纯函数 batchSelect"
```

---

## Task 3：WXML 重排顶部筛选区 + 底部毛玻璃批量栏

**Files:**
- Modify: `pages/history/history.wxml`

**Step 1：替换筛选区（liquid-slider 外层改为 `filter-top-row` + 右上「选择」按钮；策略降为次级行）**

原 `history.wxml` 第 49–74 行（liquid-slider + filter-chips scroll-view）整体替换为：
```xml
  <!-- 筛选区：分段(全部/转入/转出) + 右上选择按钮 + 策略次级行 -->
  <view class="filter-bar">
    <view class="filter-top-row">
      <liquid-slider
        class="filter-slider"
        tabs="{{filterTabs}}"
        currentKey="{{currentFilter}}"
        bind:change="onFilterTabChange"
      />
      <view class="select-toggle {{selectMode ? 'select-toggle-active' : ''}}" bindtap="toggleSelectMode">
        <view class="batch-icon"></view>
        <text>{{selectMode ? '取消' : '选择'}}</text>
      </view>
    </view>
    <scroll-view wx:if="{{activeStrategies.length > 0}}" scroll-x class="strategy-chips" enhanced show-scrollbar="{{false}}">
      <view class="chip-row">
        <view wx:for="{{activeStrategies}}" wx:key="tag"
              class="chip chip-secondary {{currentStrategy === item.tag ? 'chip-active' : ''}}"
              bindtap="switchStrategy" data-strategy="{{item.tag}}">
          <text>{{item.tag}}</text>
        </view>
      </view>
    </scroll-view>
  </view>
```

**Step 2：替换底部批量栏为毛玻璃胶囊 + 「已选 N · 共 M」**

原 `history.wxml` 第 146–162 行（`.batch-bar` 整块）替换为：
```xml
    <!-- 毛玻璃胶囊批量栏 -->
    <view wx:if="{{selectMode}}" class="batch-bar glass-bar">
      <view class="batch-bar-inner">
        <view class="batch-left" bindtap="toggleSelectAll">
          <view class="xhs-checkbox {{selectAll ? 'xhs-checkbox-checked' : ''}}"></view>
          <text class="batch-label">全选</text>
        </view>
        <view class="batch-center">
          <text class="batch-count">已选 {{selectedIds.length}} · 共 {{totalInFilter}}</text>
        </view>
        <view class="batch-right">
          <view class="batch-btn-cancel" bindtap="toggleSelectMode">取消</view>
          <view class="batch-btn-delete {{selectedIds.length === 0 ? 'batch-btn-disabled' : ''}}" bindtap="batchDelete">
            删除
          </view>
        </view>
      </view>
    </view>
```

**Step 3：底部占位高度微调**

原 `history.wxml` 第 142 行：
```xml
<view style="height: {{selectMode ? '300rpx' : '160rpx'}};"></view>
```
改为：
```xml
<view style="height: {{selectMode ? '220rpx' : '160rpx'}};"></view>
```

**Step 4：提交**
```bash
git add pages/history/history.wxml
git commit -m "feat(history): 重排筛选区与毛玻璃批量栏结构"
```

---

## Task 4：WXSS 视觉（毛玻璃 / 选择按钮 / 次级 chip / 胶囊栏）

**Files:**
- Modify: `pages/history/history.wxss`

**Step 1：新增筛选区与选择按钮样式**（在 `.filter-chips` 原有规则附近增改）

把原 `.chip-batch` / `.chip-divider`（已不再使用）保留无害，新增：
```css
/* === 筛选区（毛玻璃一致性） === */
.filter-bar {
  padding: var(--xhs-space-xs) 0 var(--xhs-space-sm);
  margin-bottom: var(--xhs-space-xs);
}
.filter-top-row {
  display: flex;
  align-items: center;
  gap: var(--xhs-space-sm);
  padding: 0 var(--page-margin);
}
.filter-slider {
  flex: 1;
  min-width: 0;
}
.select-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: var(--xhs-space-xs) var(--xhs-space-md);
  background: var(--xhs-bg-secondary);
  border-radius: var(--xhs-radius-pill);
  font-size: var(--xhs-font-sm);
  color: var(--xhs-title);
  font-weight: var(--xhs-weight-medium);
  white-space: nowrap;
  transition: var(--xhs-transition);
  flex-shrink: 0;
}
.select-toggle:active { transform: scale(0.96); }
.select-toggle-active {
  background: var(--xhs-primary-bg);
  color: var(--xhs-primary);
}
.select-toggle-active .batch-icon { background: currentColor; }
.select-toggle-active .batch-icon::before { background: #fff; }

/* 策略次级 chip（更淡更小，与分段拉开层级） */
.strategy-chips {
  white-space: nowrap;
  padding: var(--xhs-space-xs) var(--page-margin) 0;
}
.chip-secondary {
  font-size: var(--xhs-font-xs);
  color: var(--xhs-caption);
  padding: 4rpx var(--xhs-space-md);
}
.chip-secondary.chip-active {
  color: var(--xhs-primary);
  background: var(--xhs-primary-bg);
  border-radius: var(--xhs-radius-pill);
}
.chip-secondary.chip-active text::after { display: none; }
```

**Step 2：毛玻璃胶囊批量栏（覆盖原 `.batch-bar` 通栏样式）**

在 `.batch-bar` 区块后追加：
```css
/* === 毛玻璃胶囊批量栏 === */
.batch-bar.glass-bar {
  left: var(--page-margin);
  right: var(--page-margin);
  bottom: calc(104rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border-top: none;
  border-radius: var(--xhs-radius-pill);
  box-shadow: var(--xhs-elevation-3);
  padding: var(--xhs-space-xs) var(--xhs-space-md);
  animation: slide-up-scale 250ms ease-out;
}
@keyframes slide-up-scale {
  from { transform: translateY(20rpx) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes slide-down-scale {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(20rpx) scale(0.96); opacity: 0; }
}
```

> 注：原 `.batch-bar` 的 `position:fixed; bottom; z-index:998` 等保留；`.glass-bar` 仅覆盖背景/边框/圆角/动画。若 `backdrop-filter` 在真机不支持，回退为 `rgba` 半透底，仍可用。

**Step 3：提交**
```bash
git add pages/history/history.wxss
git commit -m "style(history): 毛玻璃筛选区与胶囊批量栏"
```

---

## Task 5：JS 交互逻辑修复（核心）

**Files:**
- Modify: `pages/history/history.js`

**Step 1：顶部引入 batchSelect 助手**
在 `history.js` 顶部 require 区（如 `recordView` 之后）新增：
```js
const { collectFilterIds, isAllSelected } = require("../../utils/helpers/batchSelect");
```

**Step 2：data 增加 `totalInFilter`**
在 `data` 中（如 `selectedIds: []` 附近）增加：
```js
totalInFilter: 0,
```

**Step 3：`_applyFilters` 去掉清空选择、改为重算 `selectAll` + `totalInFilter`**
原 `_applyFilters`（约 113–162 行）整体替换为：
```js
_applyFilters() {
	// 注意：切换筛选不再清空已选，仅重算全选态
	let filtered = this._cachedAllRecords || [];
	if (this.data.currentFilter !== "ALL") {
		filtered = filtered.filter((r) => r.type === this.data.currentFilter);
	}
	if (this.data.currentMarket) {
		filtered = filtered.filter((r) => r.market === this.data.currentMarket);
	}
	if (this.data.currentStrategy) {
		filtered = filtered.filter(
			(r) => r.strategies && r.strategies.indexOf(this.data.currentStrategy) >= 0,
		);
	}
	const keyword = this._pendingKeyword || this.data.searchKeyword;
	if (keyword) {
		const kw = keyword.toLowerCase();
		filtered = filtered.filter(
			(r) => r.code.toLowerCase().includes(kw) || r.name.toLowerCase().includes(kw),
		);
	}
	const grouped = {};
	filtered.forEach((r) => {
		if (!grouped[r.date]) {
			grouped[r.date] = [];
		}
		grouped[r.date].push(r);
	});
	const groupedArray = Object.keys(grouped).map((date) => ({
		date,
		items: grouped[date],
	}));
	this._allGroupedHistory = groupedArray;
	const displayCount = this.data.displayCount;
	const displayData = groupedArray.slice(0, displayCount);
	const hasMore = groupedArray.length > displayCount;
	const filterIds = collectFilterIds(groupedArray);
	const selectAll = isAllSelected(this.data.selectedIds, filterIds);
	const selectedMap = {};
	this.data.selectedIds.forEach((sid) => {
		selectedMap[sid] = true;
	});
	this.setData({
		groupedHistory: displayData,
		recordCount: groupedArray.length,
		totalInFilter: filterIds.length,
		hasMore: hasMore,
		loadingMore: false,
		isFromCache: false,
		cacheTimestamp: Date.now(),
		selectAll,
		selectedMap,
	});
},
```

**Step 4：`toggleSelectAll` 改为遍历全量（跨页）**
原 `toggleSelectAll`（约 240–258 行）替换为：
```js
toggleSelectAll() {
	const selectAll = !this.data.selectAll;
	const selectedTypeMap = {};
	const selectedIds = [];
	if (selectAll) {
		// 当前筛选下全部记录（含未展开页），而非仅可见项
		(this._allGroupedHistory || []).forEach((group) => {
			group.items.forEach((item) => {
				selectedIds.push(item.id);
				selectedTypeMap[item.id] = item.type;
			});
		});
	}
	const selectedMap = {};
	selectedIds.forEach((sid) => {
		selectedMap[sid] = true;
	});
	this.setData({ selectAll, selectedIds, selectedMap, selectedTypeMap });
},
```

**Step 5：`batchDelete` 删除范围基于当前筛选全量集合**
原 `batchDelete` 中 `visibleIdSet` 改为基于 `this._allGroupedHistory`：
```js
batchDelete() {
	const count = this.data.selectedIds.length;
	if (count === 0) return;
	const { selectedIds, selectedTypeMap } = this.data;
	// 只删当前筛选范围内的 id（含未展开页），防误删其它筛选记录
	const filterIdSet = new Set(
		(this._allGroupedHistory || []).flatMap((g) => g.items.map((i) => i.id)),
	);
	const deletableIds = selectedIds.filter((id) => filterIdSet.has(id));
	if (deletableIds.length === 0) return;
	confirmDelete({
		content: `确定要删除选中的 ${deletableIds.length} 条记录吗？`,
		onConfirm: () => {
			loading("删除中...");
			deletableIds.forEach((id) => {
				const recordType = selectedTypeMap[id];
				if (recordType === "DIVIDEND") {
					Dividend.delete(id);
				} else {
					Transaction.delete(id);
				}
			});
			hideLoading();
			fbSuccess(`已删除 ${deletableIds.length} 条`);
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

> 说明：`toggleSelectMode` 仍负责进入/退出批量态（清空选择），保持不变。

**Step 6：提交**
```bash
git add pages/history/history.js
git commit -m "fix(history): 全选跨页 + 切筛选保留选择并重算全选态"
```

---

## Task 6：回归与验证

**Files:** 无新增，验证为主

**Step 1：lint**
```
npx biome lint pages/ utils/ components/ packageDetail/ packageRecord/
```
Expected: 无 error。

**Step 2：测试**
```
npm test
```
Expected: 全部通过，且新增 `batchSelect` 测试 4 例全绿。

**Step 3：手动验证清单（开发者工具真机/模拟器）**
1. 流水页：顶部 `全部/转入/转出` 分段 + 右上「选择」按钮显示正常；有策略时分段下方出现次级 chip 行。
2. 点「选择」→ 底部出现毛玻璃胶囊栏（半透 + 模糊 + 阴影），文案「已选 0 · 共 M」。
3. 点「全选」→ 数量 = 当前筛选**全量**（含未展开页，可先筛「转出」再全选核对数量）。
4. 「全部」下全选后切「转出」→ 转出项保持选中、已选 N 正确、`selectAll` 勾选态按转出重算（不全选则取消勾）。
5. 删除：仅删当前筛选范围内记录，确认弹窗数量正确。
6. 退出「选择」（取消按钮或右上「取消」）→ 栏收起、选择清空。

**Step 4：提交（若有微调）**
```bash
git add -p   # 仅添加本次相关改动
git commit -m "chore(history): 批量重做回归微调"
```
