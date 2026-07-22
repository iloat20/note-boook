const { MARKETS, TIMING_CONFIG } = require("../../utils/constants/index");
const { Stock, Transaction, Dividend, Strategy } = require("../../utils/models/index");
const { buildStockMap } = require("../../utils/helpers/stockHelpers");
const { buildRecordView } = require("../../utils/helpers/recordView");
const { fmt } = require("../../utils/helpers/format");
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
		// 撤销删除（误删恢复）
		showUndo: false,
		undoItems: [],
		undoText: "",
		// 关联交易合并展示（一笔转入拆多笔）
		mergeRelated: false,
		// 合并卡片展开态（mergeKey -> bool）
		mergedExpanded: {},
	},
	onLoad(options) {
		pageMixin.onLoadMixin(this);
		this.setData({ searchHistory: loadSearchHistory() });
		// 支持从首页「在记录中搜索」带关键词进入（中性资产搜索，不触发类目）
		if (options?.keyword) {
			const kw = String(options.keyword);
			this._pendingKeyword = kw.toLowerCase();
			this.setData({ searchKeyword: kw, showSearchHistory: false });
		}
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
		// 基线数据变更，作废结构筛选缓存
		this._structFilterSig = null;
		this._structFilteredCache = null;
	},
	// 结构性筛选（类型/市场/策略）结果缓存。
	// 搜索输入只改关键词、不改结构筛选，此时复用缓存，避免每次按键都重跑三次 filter。
	_getStructurallyFiltered() {
		const { currentFilter, currentMarket, currentStrategy } = this.data;
		const sig = `${currentFilter}|${currentMarket || ""}|${currentStrategy || ""}`;
		if (this._structFilterSig === sig && this._structFilteredCache) {
			return this._structFilteredCache;
		}
		let filtered = this._cachedAllRecords || [];
		if (currentFilter !== "ALL") {
			filtered = filtered.filter((r) => r.type === currentFilter);
		}
		if (currentMarket) {
			filtered = filtered.filter((r) => r.market === currentMarket);
		}
		if (currentStrategy) {
			filtered = filtered.filter(
				(r) => r.strategies && r.strategies.indexOf(currentStrategy) >= 0,
			);
		}
		this._structFilterSig = sig;
		this._structFilteredCache = filtered;
		return filtered;
	},
	// 从缓存数据中筛选、分组、显示
	_applyFilters() {
		// 注意：切换筛选不再清空已选，仅重算全选态
		let filtered = this._getStructurallyFiltered();
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
		let displayData = groupedArray.slice(0, displayCount);
		if (this.data.mergeRelated) displayData = this._mergeGroups(displayData);
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
		let displayData = allData.slice(0, newCount);
		if (this.data.mergeRelated) {
			displayData = this._mergeGroups(displayData);
		}
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
				const raws = deletableIds
					.map((id) => {
						const t = selectedTypeMap[id];
						return t === "DIVIDEND" ? Dividend.getById(id) : Transaction.getById(id);
					})
					.filter((x) => x);
				deletableIds.forEach((id) => {
					const recordType = selectedTypeMap[id];
					if (recordType === "DIVIDEND") {
						Dividend.delete(id);
					} else {
						Transaction.delete(id);
					}
				});
				hideLoading();
				this.setData({
					selectMode: false,
					selectedIds: [],
					selectedMap: {},
					selectedTypeMap: {},
				});
				this.loadHistory();
				this._showUndo(raws);
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
							const raw =
								record.type === "DIVIDEND"
									? Dividend.getById(record.id)
									: Transaction.getById(record.id);
							this.setData({ dissolvingId: record.id });
							if (this._deleteTimer) clearTimeout(this._deleteTimer);
							this._deleteTimer = setTimeout(() => {
								this._deleteTimer = null;
								if (record.type === "DIVIDEND") {
									Dividend.delete(record.id);
								} else {
									Transaction.delete(record.id);
								}
								this.setData({ dissolvingId: null });
								this.loadHistory();
								this._showUndo(raw ? [raw] : []);
							}, 400);
						},
					});
				}
			},
		});
	},
	// ========== 撤销删除（误删恢复） ==========
	_showUndo(items) {
		if (!items || items.length === 0) return;
		if (this._undoTimer) clearTimeout(this._undoTimer);
		const undoItems = items.map((it) => ({ ...it }));
		this.setData({
			showUndo: true,
			undoItems,
			undoText: `已删除 ${undoItems.length} 笔记录`,
		});
		// 6 秒后自动隐藏（恢复窗口期）
		this._undoTimer = setTimeout(() => {
			this._undoTimer = null;
			this.setData({ showUndo: false, undoItems: [] });
		}, 6000);
	},
	onUndo() {
		if (!this.data.showUndo) return;
		const items = this.data.undoItems || [];
		if (this._undoTimer) {
			clearTimeout(this._undoTimer);
			this._undoTimer = null;
		}
		if (items.length === 0) {
			this.setData({ showUndo: false });
			return;
		}
		loading("恢复中...");
		items.forEach((it) => {
			if (it.type === "DIVIDEND") {
				Dividend.save(it);
			} else {
				Transaction.save(it);
			}
		});
		hideLoading();
		fbSuccess("已恢复");
		this.setData({ showUndo: false, undoItems: [] });
		this.loadHistory();
	},
	// ========== 关联交易合并展示 ==========
	onToggleMerge() {
		const mergeRelated = !this.data.mergeRelated;
		this.setData({ mergeRelated, mergedExpanded: {} });
		this._applyFilters();
	},
	onToggleMergeExpand(e) {
		const key = e.currentTarget.dataset.key;
		const map = { ...this.data.mergedExpanded };
		map[key] = !map[key];
		this.setData({ mergedExpanded: map });
	},
	// 把同一天、同一资产、同类型的多笔记录折叠成一张卡片
	_mergeGroups(groups) {
		return groups.map((group) => {
			const buckets = {};
			group.items.forEach((rec) => {
				const key = `${rec.stockId}|${rec.type}`;
				if (!buckets[key]) {
					buckets[key] = {
						...rec,
						merged: true,
						mergeKey: `${group.date}|${key}`,
						subRecords: [],
						mergeCount: 0,
						mergeTotalAmount: 0,
						mergeTotalQuantity: 0,
					};
				}
				const bucket = buckets[key];
				bucket.subRecords.push(rec);
				bucket.mergeCount += 1;
				bucket.mergeTotalAmount += Number(rec.amount) || 0;
				bucket.mergeTotalQuantity += Number(rec.quantity) || 0;
			});
			const mergedItems = [];
			Object.keys(buckets).forEach((key) => {
				const bucket = buckets[key];
				if (bucket.mergeCount <= 1) {
					// 仅一笔则保持原样，不折叠
					const {
						merged,
						mergeKey,
						subRecords,
						mergeCount,
						mergeTotalAmount,
						mergeTotalQuantity,
						...rest
					} = bucket;
					mergedItems.push(rest);
				} else {
					bucket.mergeTotalAmountText = fmt(bucket.mergeTotalAmount);
					bucket.mergeTotalQuantityText = fmt(bucket.mergeTotalQuantity);
					mergedItems.push(bucket);
				}
			});
			return { ...group, items: mergedItems };
		});
	},
	onUnload() {
		if (this._searchTimer) clearTimeout(this._searchTimer);
		if (this._deleteTimer) clearTimeout(this._deleteTimer);
		if (this._blurTimer) clearTimeout(this._blurTimer);
		this._cachedAllRecords = null;
		this._allGroupedHistory = null;
		this._structFilteredCache = null;
	},
	onPullDownRefresh() {
		try {
			this.loadHistory();
		} finally {
			wx.stopPullDownRefresh();
		}
	},
});
