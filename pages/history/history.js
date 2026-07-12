const { MARKETS, TIMING_CONFIG } = require("../../utils/constants/index");
const { Stock, Transaction, Dividend, Strategy } = require("../../utils/models/index");
const { buildStockMap } = require("../../utils/helpers/stockHelpers");
const { buildRecordView } = require("../../utils/helpers/recordView");
const { collectFilterIds, isAllSelected } = require("../../utils/helpers/batchSelect");
const {
	loadSearchHistory,
	saveSearchHistory,
	clearSearchHistory,
} = require("../../utils/helpers/searchHistory");
const pageMixin = require("../../utils/ui/pageMixin");
const { confirmDelete } = require("../../utils/ui/confirmDialog");
const { loading, hideLoading, success: fbSuccess } = require("../../utils/ui/feedback");
Page({
	data: {
		...pageMixin.initPageData(),
		entranceDone: false,
		loading: true,
		currentFilter: "ALL",
		currentMarket: null,
		currentStrategy: null,
		activeStrategies: [],
		filterTabs: [
			{ key: "ALL", label: "全部" },
		{ key: "BUY", label: "转入" },
		{ key: "SELL", label: "转出" },
		],
		marketTabs: [
			{ key: null, label: "全部" },
			{ key: MARKETS.A_SHARE, label: "境内" },
			{ key: MARKETS.HK_SHARE, label: "香港" },
			{ key: MARKETS.US_SHARE, label: "海外" },
		],
		groupedHistory: [],
		displayCount: TIMING_CONFIG.PAGE_LOAD_COUNT, // 初始显示天数
		loadingMore: false,
		hasMore: true,
		dissolvingId: null,
		searchKeyword: "",
		// 搜索历史（MRU 序）
		searchHistory: [],
		showSearchHistory: false,
		// 是否有记录存在（不受筛选影响）
		recordExists: false,
		// 缓存相关
		cacheTimestamp: 0,
		isFromCache: false,
		// 批量选择
		selectMode: false,
		selectedIds: [],
		totalInFilter: 0,
		selectedMap: {},
		selectedTypeMap: {},
		selectAll: false,
	},
	onLoad() {
		pageMixin.onLoadMixin(this);
		this.setData({ searchHistory: loadSearchHistory() });
		// 延迟到首帧渲染后构建数据，避免阻塞入场动画
		wx.nextTick(() => {
			this.loadHistory();
		});
	},
	onShow() {
		const wasDirty = pageMixin.onShowMixin(this, 1);
		this._dataDirty = wasDirty;
		if (wasDirty || !this._allGroupedHistory) {
			this.loadHistory();
		}
		if (!this.data.entranceDone) {
			this.setData({ entranceDone: true });
		}
		// 刷新历史（可能在其他页搜过）
		this.setData({ searchHistory: loadSearchHistory() });
	},
	// 构建全部记录并缓存，仅在数据变更时调用
	_buildAllRecords() {
		const transactions = Transaction.getAll();
		const dividends = Dividend.getAll();
		const stocks = Stock.getAll();
		const stockMap = buildStockMap(stocks);
		const allRecords = [];
		transactions.forEach((t) => {
			const stock = stockMap[t.stockId];
			if (stock) {
				allRecords.push(
					buildRecordView(t, stock, {
						amountClassPrefix: "detail-amount",
						amountClassForBuy: "loss",
						amountClassForSell: "profit",
						includeTypeBar: true,
						includeJournalFields: true,
						includeFeeFields: true,
					}),
				);
			}
		});
		dividends.forEach((d) => {
			const stock = stockMap[d.stockId];
			if (stock) {
				allRecords.push(
					buildRecordView(d, stock, {
						amountClassPrefix: "detail-amount",
						includeTypeBar: true,
						includeDividendFields: true,
					}),
				);
			}
		});
		// 使用预计算的数值排序，避免每次比较都创建 Date 对象
		allRecords.sort((a, b) => b._sortKey - a._sortKey);
		this._cachedAllRecords = allRecords;
	},
	// 从缓存数据中筛选、分组、显示
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
	loadHistory() {
		const dirty = this._dataDirty || !this._cachedAllRecords;
		if (dirty) {
			this._buildAllRecords();
			this._dataDirty = false;
		}
		this.setData({
			activeStrategies: Strategy.getUsedStrategies(),
			loading: false,
			recordExists: this._cachedAllRecords && this._cachedAllRecords.length > 0,
		});
		this._applyFilters();
	},
	// 筛选 tab 切换（由 liquid-slider 组件触发）
	onFilterTabChange(e) {
		const filter = e.detail.key;
		this.setData({ currentFilter: filter });
		this._applyFilters();
	},
	switchMarket(e) {
		const market = e.currentTarget.dataset.market;
		this.setData({ currentMarket: market === "null" ? null : market });
		this._applyFilters();
	},
	switchStrategy(e) {
		const strategy = e.currentTarget.dataset.strategy;
		this.setData({ currentStrategy: strategy || null });
		this._applyFilters();
	},
	clearSearch() {
		if (this._searchTimer) clearTimeout(this._searchTimer);
		this._pendingKeyword = "";
		this.setData({ searchKeyword: "", showSearchHistory: false });
		this._applyFilters();
	},
	loadMore() {
		if (this.data.loadingMore || !this.data.hasMore) return;
		const newCount = this.data.displayCount + TIMING_CONFIG.PAGE_LOAD_COUNT;
		const allData = this._allGroupedHistory || [];
		const displayData = allData.slice(0, newCount);
		const hasMore = allData.length > newCount;
		this.setData({
			displayCount: newCount,
			groupedHistory: displayData,
			hasMore: hasMore,
			loadingMore: false,
		});
	},
	// ========== 批量选择 ==========
	toggleSelectMode() {
		this.setData({
			selectMode: !this.data.selectMode,
			selectedIds: [],
			selectedMap: {},
			selectedTypeMap: {},
			selectAll: false,
		});
	},
	toggleSelectItem(e) {
		const id = Number(e.currentTarget.dataset.id);
		const type = e.currentTarget.dataset.type;
		const selectedIds = this.data.selectedIds.slice();
		const selectedTypeMap = { ...this.data.selectedTypeMap };
		const idx = selectedIds.indexOf(id);
		if (idx >= 0) {
			selectedIds.splice(idx, 1);
			delete selectedTypeMap[id];
		} else {
			selectedIds.push(id);
			selectedTypeMap[id] = type;
		}
		const selectedMap = {};
		selectedIds.forEach((sid) => {
			selectedMap[sid] = true;
		});
		this.setData({ selectedIds, selectedMap, selectedTypeMap });
	},
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
	onRecordTap(e) {
		if (!this.data.selectMode) return;
		this.toggleSelectItem(e);
	},
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
	onSearchInput(e) {
		if (this._searchTimer) clearTimeout(this._searchTimer);
		const keyword = e.detail.value.toLowerCase();
		// Store locally to avoid setData on every keystroke
		this._pendingKeyword = keyword;
		// 空输入时展示搜索历史
		if (!keyword) {
			this.setData({ showSearchHistory: true });
		}
		this._searchTimer = setTimeout(() => {
			this.setData({ searchKeyword: this._pendingKeyword });
			this._applyFilters();
		}, TIMING_CONFIG.SEARCH_DEBOUNCE_MS);
	},
	onSearchFocus() {
		// 聚焦且无关键词时展示历史
		if (!this._pendingKeyword && !this.data.searchKeyword) {
			this.setData({ showSearchHistory: true });
		}
	},
	onSearchBlur() {
		// 失焦后短暂延迟隐藏，避免点击历史项时 dropdown 先消失
		if (this._blurTimer) clearTimeout(this._blurTimer);
		this._blurTimer = setTimeout(() => {
			this._blurTimer = null;
			this.setData({ showSearchHistory: false });
		}, 150);
	},
	tapHistory(e) {
		const keyword = e.currentTarget.dataset.keyword;
		this._pendingKeyword = keyword;
		this.setData({
			searchKeyword: keyword,
			showSearchHistory: false,
		});
		saveSearchHistory(keyword);
		this.setData({ searchHistory: loadSearchHistory() });
		this._applyFilters();
	},
	clearHistory() {
		clearSearchHistory();
		this.setData({ searchHistory: [], showSearchHistory: false });
	},
	showActions(e) {
		const record = e.currentTarget.dataset.record;
		const actions = [{ text: "删除", value: "delete" }];
		if (record.type !== "DIVIDEND") {
			actions.unshift({ text: "编辑", value: "edit" });
		}
		wx.showActionSheet({
			itemList: actions.map((a) => a.text),
			success: (res) => {
				const action = actions[res.tapIndex];
				if (action.value === "edit") {
					wx.navigateTo({
						url: `/packageRecord/pages/record/record?id=${record.id}`,
					});
				} else if (action.value === "delete") {
					confirmDelete({
						content: `确定要删除这笔${record.typeText}记录吗？`,
						onConfirm: () => {
							this.setData({ dissolvingId: record.id });
							if (this._deleteTimer) clearTimeout(this._deleteTimer);
							this._deleteTimer = setTimeout(() => {
								this._deleteTimer = null;
								if (record.type === "DIVIDEND") {
									Dividend.delete(record.id);
								} else {
									Transaction.delete(record.id);
								}
								fbSuccess("删除成功");
								this.setData({ dissolvingId: null });
								this.loadHistory();
							}, 400);
						},
					});
				}
			},
		});
	},
	onUnload() {
		if (this._searchTimer) clearTimeout(this._searchTimer);
		if (this._deleteTimer) clearTimeout(this._deleteTimer);
		if (this._blurTimer) clearTimeout(this._blurTimer);
		this._cachedAllRecords = null;
		this._allGroupedHistory = null;
	},
	onPullDownRefresh() {
		try {
			this.loadHistory();
		} finally {
			wx.stopPullDownRefresh();
		}
	},
});
