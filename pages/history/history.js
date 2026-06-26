const { MARKETS, TIMING_CONFIG } = require("../../utils/constants/index");
const { Stock, Transaction, Dividend, Strategy } = require("../../utils/models/index");
const { fmt, fmtDate, fmtTime } = require("../../utils/helpers/format");
const { buildStockMap } = require("../../utils/helpers/stockHelpers");
const { getMarketLabel, getMarketColor } = require("../../utils/constants/market");
const pageMixin = require("../../utils/ui/pageMixin");
const { confirmDelete } = require("../../utils/ui/confirmDialog");
const { loading, hideLoading, success: fbSuccess } = require("../../utils/ui/feedback");

Page({
	data: {
		...pageMixin.initPageData(),
		loading: true,
		currentFilter: "ALL",
		currentMarket: null,
		currentStrategy: null,
		activeStrategies: [],
		filterTabs: [
			{ key: "ALL", label: "全部" },
			{ key: "BUY", label: "买入" },
			{ key: "SELL", label: "卖出" },
			{ key: "DIVIDEND", label: "分红" },
		],
		marketTabs: [
			{ key: null, label: "全部" },
			{ key: MARKETS.A_SHARE, label: "A股" },
			{ key: MARKETS.HK_SHARE, label: "港股" },
			{ key: MARKETS.US_SHARE, label: "美股" },
		],
		groupedHistory: [],
		displayCount: TIMING_CONFIG.PAGE_LOAD_COUNT, // 初始显示天数
		loadingMore: false,
		hasMore: true,
		dissolvingId: null,
		searchKeyword: "",
		// 是否有记录存在（不受筛选影响）
		recordExists: false,
		// 缓存相关
		cacheTimestamp: 0,
		isFromCache: false,
		// 批量选择
		selectMode: false,
		selectedIds: [],
		selectedMap: {},
		selectedTypeMap: {},
		selectAll: false,
	},

	onLoad() {
		pageMixin.onLoadMixin(this);
		this.loadHistory();
	},

	onShow() {
		if (pageMixin.onShowMixin(this, 1) || !this._allGroupedHistory) {
			this.loadHistory();
		}
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
				const date = new Date(t.date);
				const amount =
					t.type === "BUY" ? -(t.price * t.quantity + t.fee) : t.price * t.quantity - t.fee;
				const isBuy = t.type === "BUY";
				allRecords.push({
					id: t.id,
					type: t.type,
					typeText: isBuy ? "买入" : "卖出",
					typeTagClass: `tag type-tag ${isBuy ? "tag-buy" : "tag-sell"}`,
					typeBarClass: `record-type-bar ${isBuy ? "bar-buy" : "bar-sell"}`,
					amountClass: `detail-amount mono-num ${isBuy ? "loss" : "profit"}`,
					stockId: t.stockId,
					market: stock.market,
					marketLabel: getMarketLabel(stock.market),
					marketColor: getMarketColor(stock.market),
					code: stock.code,
					name: stock.name,
					price: t.price,
					priceText: fmt(t.price),
					quantity: parseFloat(t.quantity) || 0,
					fee: t.fee,
					feeText: fmt(t.fee),
					amount: amount,
					amountText: fmt(Math.abs(amount)),
					date: fmtDate(date),
					time: fmtTime(date),
					_sortKey: date.getTime(),
					strategies: t.strategies || [],
					reason: t.reason || "",
					hasJournal: !!(t.reason || t.strategies?.length),
				});
			}
		});

		dividends.forEach((d) => {
			const stock = stockMap[d.stockId];
			if (stock) {
				const date = new Date(d.date);
				allRecords.push({
					id: d.id,
					type: "DIVIDEND",
					typeText: "分红",
					typeTagClass: "tag type-tag tag-dividend",
					typeBarClass: "record-type-bar bar-dividend",
					amountClass: "detail-amount mono-num dividend",
					stockId: d.stockId,
					market: stock.market,
					marketLabel: getMarketLabel(stock.market),
					marketColor: getMarketColor(stock.market),
					code: stock.code,
					name: stock.name,
					perShareAmount: d.perShareAmount,
					perShareAmountText: fmt(d.perShareAmount),
					quantity: parseFloat(d.quantity) || 0,
					amount: d.totalAmount,
					amountText: fmt(d.totalAmount),
					date: fmtDate(date),
					time: fmtTime(date),
					_sortKey: date.getTime(),
				});
			}
		});

		// 使用预计算的数值排序，避免每次比较都创建 Date 对象
		allRecords.sort((a, b) => b._sortKey - a._sortKey);

		this._cachedAllRecords = allRecords;
	},

	// 从缓存数据中筛选、分组、显示
	_applyFilters() {
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

		// Use pending keyword if available (debounced input not yet flushed)
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

		// Store as instance variable to avoid sending through setData
		this._allGroupedHistory = groupedArray;

		const displayCount = this.data.displayCount;
		const displayData = groupedArray.slice(0, displayCount);
		const hasMore = groupedArray.length > displayCount;

		this.setData({
			groupedHistory: displayData,
			recordCount: groupedArray.length,
			hasMore: hasMore,
			loadingMore: false,
			isFromCache: false,
			cacheTimestamp: Date.now(),
		});
	},

	loadHistory() {
		this._buildAllRecords();
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
		this.setData({ searchKeyword: "" });
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
			this._allGroupedHistory.forEach((group) => {
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
		confirmDelete({
			content: `确定要删除选中的 ${count} 条记录吗？`,
			onConfirm: () => {
				loading("删除中...");
				selectedIds.forEach((id) => {
					const recordType = selectedTypeMap[id];
					if (recordType === "DIVIDEND") {
						Dividend.delete(id);
					} else {
						Transaction.delete(id);
					}
				});
				hideLoading();
				fbSuccess(`已删除 ${count} 条`);
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
		this._searchTimer = setTimeout(() => {
			this.setData({ searchKeyword: this._pendingKeyword });
			this._applyFilters();
		}, TIMING_CONFIG.SEARCH_DEBOUNCE_MS);
	},

	showActions(e) {
		const record = e.currentTarget.dataset.record;
		const actions = [
			{ text: "编辑", value: "edit" },
			{ text: "删除", value: "delete" },
		];

		wx.showActionSheet({
			itemList: actions.map((a) => a.text),
			success: (res) => {
				const action = actions[res.tapIndex];
				if (action.value === "edit") {
					if (record.type === "DIVIDEND") {
						wx.navigateTo({
							url: `/packageDetail/pages/dividend/dividend?id=${record.id}`,
						});
					} else {
						wx.navigateTo({
							url: `/packageRecord/pages/record/record?id=${record.id}`,
						});
					}
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

	goToRecord() {
		wx.navigateTo({ url: "/packageRecord/pages/record/record" });
	},

	goToDividend() {
		wx.navigateTo({ url: "/packageDetail/pages/dividend/dividend" });
	},

	onUnload() {
		if (this._searchTimer) clearTimeout(this._searchTimer);
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
