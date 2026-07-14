/**
 * 持仓页（重构版 - 使用新架构）
 * 使用 positionService + pageMixin + touchGestureMixin
 * 数据变更通过 appStore.dataDirty 驱动页面刷新
 */

const positionService = require("../../utils/services/positionService");
const pageMixin = require("../../utils/ui/pageMixin");
const touchGestureMixin = require("../../utils/ui/touchGestureMixin");
const { fmt, fmtDate } = require("../../utils/helpers/format");
const { calcFloatingPercent } = require("../../utils/helpers/positionCalculator");
const { getMarketLabel, getMarketColor } = require("../../utils/constants/market");
const { MARKETS, TIMING_CONFIG } = require("../../utils/constants/index");
const { Stock, Transaction, Dividend, PriceCache } = require("../../utils/models/index");
const { toast, success, loading, hideLoading, catchError } = require("../../utils/ui/feedback");
const { confirmDelete } = require("../../utils/ui/confirmDialog");

// 延迟加载：首屏不需要的重模块
let _sharePortfolio = null;
let _fetchStockPrice = null;
let _fetchAllPrices = null;
let _getRates = null;
let _getRate = null;

function _ensureNetworkModules() {
	if (!_fetchStockPrice) {
		({
			fetchStockPrice: _fetchStockPrice,
			fetchAllPrices: _fetchAllPrices,
		} = require("../../utils/services/stockPrice"));
		({ getRates: _getRates, getRate: _getRate } = require("../../utils/services/exchangeRate"));
	}
}

function _ensureShareModule() {
	if (!_sharePortfolio) {
		({ sharePortfolio: _sharePortfolio } = require("../../utils/render/shareHelper"));
	}
}

Page({
	...touchGestureMixin,
	// ========== 页面数据 ==========
	data: {
		...pageMixin.initPageData(),

		// 日期
		currentDate: "",

		// 市场切换
		currentMarket: null,
		summaryCurrency: "¥",
		sliderLeft: 0,
		sliderWidth: 0,
		marketTabs: [
			{ key: null, label: "全部", count: 0 },
			{ key: MARKETS.A_SHARE, label: "境内", count: 0 },
			{ key: MARKETS.HK_SHARE, label: "香港", count: 0 },
			{ key: MARKETS.US_SHARE, label: "海外", count: 0 },
		],

		// 分享截图生成状态
		generatingShare: false,

		// 持仓数据
		// [优化] positions / _allPositions 移出 data（挂 this._positionsCache / this._allPositionsCache）
		// 只有 displayPositions 进渲染层；positionCount 给 WXML 计数用
		positionCount: 0,
		displayPositions: [],
		_rates: null,
		totalMarketValue: 0,
		totalMarketValueText: "0.00",
		totalPnL: 0,
		totalPnLText: "0.00",
		totalPnLPercent: 0,

		// 显示值（用于动画）
		displayValues: {
			totalMarketValue: "0.00",
			totalPnL: "0.00",
			totalPnLPercent: "0.00",
		},

		// 虚拟列表高度
		scrollHeight: 400,
		displayCount: 20,

		// 加载状态（初始 false，_loadData 开始时会设为 true）
		loading: false,
		animating: false,
		entranceDone: false,

		showQuickRecord: false,
		deletingId: null,
		tabAnimating: false,
	},

	// ========== 生命周期 ==========
	async onLoad() {
		pageMixin.onLoadMixin(this);
		// C2 契约（bug #10/#15）：标记未分离 + 价格请求版本计数器
		this._detached = false;
		this._priceReqId = 0;
		// bug #15：stockId-keyed 动画清理 timers（替换闭包捕获数组索引）
		this._flashTimers = new Map();
		this.updateDate();
		this._dataLoaded = false;

		const systemInfo = getApp().globalData.systemInfo || wx.getWindowInfo() || {};
		const windowHeight = systemInfo.windowHeight || 667;
		const statusBarHeight = this.data.statusBarHeight || systemInfo.statusBarHeight || 44;
		const fixedHeight = statusBarHeight + 180;
		const scrollHeight = windowHeight - fixedHeight;
		this.setData({ scrollHeight: Math.max(scrollHeight, 300) });

		await this.refresh();
	},

	async onShow() {
		const dirty = pageMixin.onShowMixin(this, 0);
		if (dirty) {
			await this.refresh();
			this._scheduleSwipeMeasure?.();
			return;
		}
		// 首次冷启动：onLoad 里的 await refresh() 尚未完成，
		// 或上一轮 refresh 已成功但缓存为空(=无持仓)，此时需主动触发一次。
		if (!this._dataLoaded) {
			await this.refresh({ fetchPrices: false });
			this._scheduleSwipeMeasure?.();
		}
	},

	onUnload() {
		// C2 契约（bug #10）：标记分离 + 递增价格请求版本，使 in-flight 回调 bail out
		this._detached = true;
		this._priceReqId++;
		// 清理滑动手势挂起的异步任务（raf 节流 tick / 延迟测量计时器），
		// 避免页面销毁后回调对死亡实例 setData 触发框架崩溃。
		if (this._swipeDestroy) this._swipeDestroy();
		// 清理定时器
		if (this._animTimer) clearTimeout(this._animTimer);
		if (this._tabTimer) clearTimeout(this._tabTimer);
		if (this._deleteTimer) clearTimeout(this._deleteTimer);
		if (this._shareTimer) clearTimeout(this._shareTimer);
		// bug #15：清理所有 stockId-keyed 动画 timers
		if (this._flashTimers) {
			this._flashTimers.forEach((t) => {
				clearTimeout(t);
			});
			this._flashTimers.clear();
		}
	},

	// ========== 统一刷新管道 ==========
	async refresh({ force = false, fetchPrices = true } = {}) {
		if (this._refreshing) return;
		this._refreshing = true;
		try {
			await this._loadData(force);
			if (fetchPrices && this._positionsCache?.length > 0) {
				// 价格刷新最小间隔 30s
				const now = Date.now();
				const canFetch = force || !this._lastFetchAt || now - this._lastFetchAt > 30000;
				if (canFetch) {
					await this._fetchPrices({ silent: true, force });
					this._lastFetchAt = Date.now();
				}
			}
		} finally {
			this._refreshing = false;
		}
	},

	async onPullDownRefresh() {
		try {
			await this.refresh({ force: true });
		} finally {
			wx.stopPullDownRefresh();
		}
	},

	// ========== 数据加载 ==========
	async _loadData(forceRefresh = false) {
		this.setData({ loading: true });

		try {
			_ensureNetworkModules();

			// [优化] 汇率请求提前发起，与持仓计算并行（网络 I/O 与 CPU 计算重叠）
			const ratesPromise = _getRates();

			// 使用 positionService 获取数据（已封装缓存逻辑）
			// 注意：getAllPositions 内部使用同步 storage 操作，无需 Promise
			const allPositions = positionService.getAllPositions(forceRefresh);

			// 等待汇率请求完成（通常此时已 ready）
			const rates = await ratesPromise;
			this._rates = rates;

			// [优化] 单次遍历 allPositions：同时完成指标聚合 + marketAgg 构建 + positionMap
			let totalMarketValue = 0;
			let totalCost = 0;
			let totalRealizedPnL = 0;
			let totalFloatingPnL = 0;
			let totalDividendIncome = 0;
			let totalBuyFee = 0;
			const positionMap = new Map();
			const positions = []; // 仅当前持仓（quantity > 0）

			// [优化] 单次遍历 allPositions：同时完成指标聚合 + marketAgg 构建 + positionMap
			const marketAgg = {};
			let aggTotalMV = 0,
				aggTotalPnL = 0;
			allPositions.forEach((p) => {
				const rate = _getRate(p.market, rates);

				// 所有持仓（含已清仓）：已实现盈亏 + 分红
				totalRealizedPnL += (p.realizedPnL || 0) * rate;
				totalDividendIncome += (p.dividendIncome || 0) * rate;

				// 构建 O(1) 查询映射
				positionMap.set(p.id, p);

				// 仅当前持仓：浮动盈亏 + 市值 + 成本 + per-market 聚合
				if (p.quantity > 0) {
					positions.push(p);
					totalFloatingPnL += (p.floatingPnL || 0) * rate;
					if (p.currentPrice) {
						totalMarketValue += p.currentPrice * p.quantity * rate;
					}
					totalCost += p.avgCost * p.quantity * rate;
					totalBuyFee += (p.totalBuyFee || 0) * rate;

					// per-market 聚合（原 formattedPositions.forEach 第二遍）
					if (!marketAgg[p.market]) marketAgg[p.market] = { marketValue: 0, pnl: 0 };
					if (p.currentPrice) {
						marketAgg[p.market].marketValue += p.currentPrice * p.quantity * rate;
						aggTotalMV += p.currentPrice * p.quantity * rate;
					}
					const pnl =
						((p.floatingPnL || 0) + (p.realizedPnL || 0) + (p.dividendIncome || 0)) * rate;
					marketAgg[p.market].pnl += pnl;
					aggTotalPnL += pnl;
				}
			});
			marketAgg[null] = {
				marketValue: parseFloat(aggTotalMV.toFixed(2)),
				pnl: parseFloat(aggTotalPnL.toFixed(2)),
			};
			this._marketAggCache = marketAgg;
			this._positionMap = positionMap;

			// [优化] 单次遍历 Transaction：同时完成 totalInvestment + marketInvestment（复用 positionMap）
			const allTransactions = Transaction.getAll();
			let totalInvestment = 0;
			const marketInvestment = {};

			allTransactions.forEach((t) => {
				if (t.type !== "BUY") return;
				if (t.stockId == null || !positionMap.has(t.stockId)) return;
				const pos = positionMap.get(t.stockId);
				if (!pos) return;
				const tRate = _getRate(pos.market, rates);
				const invest = t.price * t.quantity * tRate;
				totalInvestment += invest;
				marketInvestment[pos.market] = (marketInvestment[pos.market] || 0) + invest;
			});
			marketInvestment[null] = totalInvestment;
			this._cachedTotalInvestment = totalInvestment;
			this._cachedMarketInvestment = marketInvestment;

			if (totalInvestment <= 0) totalInvestment = totalCost + totalBuyFee;

			const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome;

			// 格式化持仓数据 + 计算市场 tab 计数（合并处理）
			const oldPositions = this._allPositionsCache || [];
			const oldPriceMap = {};
			for (let i = 0; i < oldPositions.length; i++) {
				oldPriceMap[oldPositions[i].id] = oldPositions[i].currentPrice;
			}

			const isFirstLoad = oldPositions.length === 0;
			const oldIdSet = !isFirstLoad ? new Set(oldPositions.map((op) => op.id)) : null;
			const newIds = isFirstLoad
				? new Set()
				: new Set(positions.map((p) => p.id).filter((id) => !oldIdSet.has(id)));

			const marketCounts = { null: 0 };
			const formattedPositions = positions.map((p) => {
				const pnlPercent = calcFloatingPercent(p);
				const oldPrice = oldPriceMap[p.id];
				const priceFlashClass =
					oldPrice && p.currentPrice && oldPrice !== p.currentPrice
						? p.currentPrice > oldPrice
							? "price-flash-profit"
							: "price-flash-loss"
						: "";

				// 卡片基础类固定为 position-card；entering / priceFlashClass / swiping / deleting
				// 等状态类改为在 WXML 中按数据字段动态拼接（修复 card-enter 动画 forwards 锁死
				// inline translateX 导致卡片无法滑动的问题）。

				// 预计算 market tag 类名，避免 WXML 中写三元表达式
				const marketClass = `tag market-${p.market === "A_SHARE" ? "a" : p.market === "HK_SHARE" ? "hk" : "us"}`;

				// 预计算价格显示文本，消除 WXML 中的 wx:if/wx:else
				const displayPriceText = p.currentPrice ? fmt(p.currentPrice) : "--";

				// 市场计数（与格式化合并）
				marketCounts.null++;
				marketCounts[p.market] = (marketCounts[p.market] || 0) + 1;

				return {
					...p,
					quantityText: String(Math.round(p.quantity)),
					avgCostText: fmt(p.avgCost),
					currentPriceText: p.currentPrice ? fmt(p.currentPrice) : "--",
					floatingPnLText: fmt(p.floatingPnL),
					pnlPercentText: pnlPercent,
					marketLabel: getMarketLabel(p.market),
					marketColor: getMarketColor(p.market),
					priceFlashClass: priceFlashClass,
					entering: newIds.has(p.id),
					marketClass: marketClass,
					displayPriceText: displayPriceText,
				};
			});

			// Precompute per-market aggregates for fast tab switching

			const updatedTabs = this.data.marketTabs.map((tab) =>
				Object.assign({}, tab, { count: marketCounts[tab.key] || 0 }),
			);

			// 根据当前市场筛选
			const filteredPositions = this.data.currentMarket
				? formattedPositions.filter((p) => p.market === this.data.currentMarket)
				: formattedPositions;

			// [优化] positions / _allPositions 移出 data，挂实例字段（不进渲染层 diff）
			// 全量缓存（含已清仓，跨 tab）+ id→index Map（O(1) 查找）
			this._allPositionsCache = formattedPositions;
			this._allIndexById = new Map(formattedPositions.map((p, i) => [p.id, i]));
			// 当前 tab 全量 + id→index Map
			this._positionsCache = filteredPositions;
			this._indexById = new Map(filteredPositions.map((p, i) => [p.id, i]));

			const displayCount = this.data.displayCount;
			const displaySlice = filteredPositions.slice(0, displayCount);

			// 防止 NaN 导致 toFixed 报错
			const safeTotalMarketValue = Number.isNaN(totalMarketValue) ? 0 : totalMarketValue;
			const safeTotalPnL = Number.isNaN(totalPnL) ? 0 : totalPnL;
			const safeTotalInvestment =
				Number.isNaN(totalInvestment) || totalInvestment <= 0 ? 0 : totalInvestment;

			// 合并所有更新到单次 setData（减少渲染层 diff 次数）
			const setDataUpdates = {
				_rates: rates,
				positionCount: filteredPositions.length,
				displayPositions: displaySlice,
				totalMarketValue: parseFloat(safeTotalMarketValue.toFixed(2)),
				totalMarketValueText: fmt(safeTotalMarketValue),
				totalPnL: parseFloat(safeTotalPnL.toFixed(2)),
				totalPnLText: fmt(safeTotalPnL),
				totalPnLPercent:
					safeTotalInvestment > 0
						? parseFloat(((safeTotalPnL / safeTotalInvestment) * 100).toFixed(2))
						: 0,
				loading: false,
				entranceDone: true,
				marketTabs: updatedTabs,
				// 直接设置终态值（animateAllValues 不再逐帧 setData）
				"displayValues.totalMarketValue": fmt(safeTotalMarketValue),
				"displayValues.totalPnL": fmt(safeTotalPnL),
				"displayValues.totalPnLPercent": fmt(
					safeTotalInvestment > 0
						? parseFloat(((safeTotalPnL / safeTotalInvestment) * 100).toFixed(2))
						: 0,
				),
			};

			// 清除 flash + entering 动画标记（bug #15：per-stockId timers，不再捕获数组索引）
			const hasFlash = formattedPositions.some((p) => p.priceFlashClass !== "");
			const hasEntering = newIds.size > 0;
			if (hasFlash || hasEntering) {
				const flashDelay = TIMING_CONFIG.PRICE_FLASH_CLEAR_DELAY;
				const enterDelay = TIMING_CONFIG.ENTER_ANIM_DELAY;
				formattedPositions.forEach((fp) => {
					const stockId = fp.id;
					const needsFlash = hasFlash && fp.priceFlashClass !== "";
					const needsEnter = hasEntering && fp.entering;
					if (!needsFlash && !needsEnter) return;
					const delay = Math.max(
						needsFlash ? flashDelay : 0,
						needsEnter ? enterDelay : 0,
					);
					if (this._flashTimers.has(stockId)) clearTimeout(this._flashTimers.get(stockId));
					const timer = setTimeout(() => {
						this._flashTimers.delete(stockId);
						if (this._detached || !this.data) return;
						const idx = this.data.displayPositions.findIndex((p) => p.id === stockId);
						if (idx === -1) return;
						const upd = {};
						if (needsFlash) upd[`displayPositions[${idx}].priceFlashClass`] = "";
						if (needsEnter) upd[`displayPositions[${idx}].entering`] = false;
						if (Object.keys(upd).length > 0) this.setData(upd);
					}, delay);
					this._flashTimers.set(stockId, timer);
				});
			}

			this._loading = false;
			this._dataLoaded = true;
			this.setData(setDataUpdates);
		} catch (err) {
			console.error("[Index] loadData error:", err);
			this._loading = false;
			this.setData({ loading: false });
			wx.showToast({ title: "数据加载失败", icon: "none" });
			catchError(err, "加载失败");
		}
	},

	// _updateSummaryIncremental 已内联到 _fetchPrices 中（含 per-position PnL 重算 + marketAgg 重建）

	// 更新市场 tab 计数（已内联到 _loadData）
	// _updateMarketTabs removed - counts computed in _loadData main setData

	// 更新日期
	updateDate() {
		const now = new Date();
		const date = fmtDate(now);
		this.setData({ currentDate: date });
	},

	// ========== 用户交互 ==========
	// 切换市场（由 liquid-slider 组件触发）- 只切换显示，不刷新页面
	onMarketTabChange(e) {
		const key = e.detail.key;

		// 先触发退场动画
		this.setData({ tabAnimating: true });

		if (this._tabTimer) clearTimeout(this._tabTimer);
		this._tabTimer = setTimeout(() => {
			const allPositions = this._allPositionsCache || [];
			const filteredPositions = key ? allPositions.filter((p) => p.market === key) : allPositions;

			this._positionsCache = filteredPositions;
			this._indexById = new Map(filteredPositions.map((p, i) => [p.id, i]));
			const displaySlice = filteredPositions.slice(0, 20);

			// Read market aggregate from cache (key null = "全部")
			const agg = this._marketAggCache[key] || this._marketAggCache[null];
			const marketInvestment = key
				? this._cachedMarketInvestment?.[key] || 0
				: this._cachedTotalInvestment || 0;
			const marketPnLPercent = marketInvestment > 0 ? (agg.pnl / marketInvestment) * 100 : 0;

			this.setData({
				currentMarket: key,
				positionCount: filteredPositions.length,
				displayPositions: displaySlice,
				tabAnimating: false,
				displayCount: 20,
				totalMarketValue: parseFloat(agg.marketValue.toFixed(2)),
				totalPnL: parseFloat(agg.pnl.toFixed(2)),
				totalPnLPercent: parseFloat(marketPnLPercent.toFixed(2)),
				"displayValues.totalMarketValue": fmt(agg.marketValue),
				"displayValues.totalPnL": fmt(agg.pnl),
				"displayValues.totalPnLPercent": fmt(marketPnLPercent),
			});
		}, TIMING_CONFIG.TAB_SWITCH_ANIM_DELAY);
	},

	updatePrice(e) {
		const stockId = parseInt(e.currentTarget.dataset.stockId, 10);
		if (Number.isNaN(stockId)) return;
		const price = parseFloat(e.detail.value);
		if (!Number.isNaN(price) && price > 0) {
			PriceCache.set(stockId, price);
		}
		this.refresh({ fetchPrices: false });
	},

	// 跳转到详情
	goToDetail(e) {
		// 水平滑动结束后的尾随 tap 不触发跳转（由 mixin 在滑动时置位）
		if (this._swipeInterceptTap) {
			this._swipeInterceptTap = false;
			return;
		}
		const index = e.currentTarget.dataset.index;
		const stockId = e.currentTarget.dataset.stockId;
		// 菜单已展开时，点击卡片主体先收起菜单，不进入详情
		const pos = this._positionsCache?.[index];
		if (pos?.swipeOpen) {
			this.setData({
				[`displayPositions[${index}].swipeOpen`]: false,
				[`displayPositions[${index}].swipeOffset`]: 0,
				[`displayPositions[${index}].swiping`]: false,
			});
			return;
		}
		if (stockId === undefined || stockId === null || stockId === "" || Number.isNaN(stockId)) {
			return;
		}
		wx.navigateTo({
			url: `/packageDetail/pages/detail/detail?stockId=${stockId}`,
		});
	},

	// 持仓列表加载更多
	loadMorePositions() {
		const current = this.data.displayCount;
		const total = (this._positionsCache || []).length;
		if (current < total) {
			const newCount = Math.min(current + 20, total);
			this.setData({
				displayCount: newCount,
				displayPositions: this._positionsCache.slice(0, newCount),
			});
		}
	},

	// 长按资产卡片 — 快捷操作菜单
	onPositionLongPress(e) {
		const stockId = parseInt(e.currentTarget.dataset.stockId, 10);
		if (Number.isNaN(stockId)) return;
		const stock = (this._allPositionsCache || []).find((p) => p.id === stockId);
		if (!stock) return;
		wx.showActionSheet({
			itemList: ["查看详情", "快速转出", "添加资产"],
			success: (res) => {
				if (res.tapIndex === 0) {
					wx.navigateTo({
						url: `/packageDetail/pages/detail/detail?stockId=${stockId}`,
					});
				} else if (res.tapIndex === 1) {
					wx.navigateTo({
						url: `/packageRecord/pages/record/record?stockId=${stockId}&type=SELL`,
					});
				} else if (res.tapIndex === 2) {
					wx.navigateTo({
						url: `/packageRecord/pages/record/record?stockId=${stockId}`,
					});
				}
			},
		});
	},

	// 跳转到添加资产
	goToAddTransaction() {
		wx.navigateTo({
			url: "/packageRecord/pages/record/record",
		});
	},

	// ========== 快捷记录 ==========
	onQuickRecord() {
		try {
			wx.vibrateShort({ type: "medium" });
		} catch (_e) {}
		this.setData({ showQuickRecord: true });
	},

	onQuickRecordClose() {
		this.setData({ showQuickRecord: false });
	},

	async onQuickRecordSubmit() {
		this.setData({ showQuickRecord: false });
		await this.refresh();
	},

	// ========== 获取价格 ==========
	async _fetchPrices(opts) {
		const silent = opts?.silent;
		const force = opts?.force;
		// [优化] 价格源用 _allPositionsCache（全市场全量，含已清仓），确保跨 tab 都能抓价格
		const positions = this._allPositionsCache || [];
		if (!positions || positions.length === 0) return;

		// 非强制时跳过 TTL 未过期的股票
		const needFetch = force ? positions : positions.filter((p) => !PriceCache.has(p.id));

		if (needFetch.length === 0) {
			if (!silent) wx.showToast({ title: "价格已是最新", icon: "none" });
			return;
		}

		if (!silent) wx.showLoading({ title: "获取价格中..." });

		try {
			_ensureNetworkModules();
			// C2 契约（bug #10）：捕获请求版本，await 后校验
			const reqId = this._priceReqId;
			const results = await _fetchAllPrices(needFetch);
			if (this._detached || reqId !== this._priceReqId) return;
			const validResults = results.filter((r) => r.price !== null);

			if (validResults.length > 0) {
				// 批量写入缓存
				PriceCache.setBatch(validResults);
				// 更新全量缓存 + 当前 tab 缓存 + 渲染层
				// 同时重算浮动盈亏（首次加载时 PriceCache 为空，floatingPnL 初始为 0）
				const rates = this.data._rates || { usdToCny: 1, hkdToCny: 1 };
				const allCache = this._allPositionsCache || [];
				const allIndexById = this._allIndexById;
				const tabCache = this._positionsCache || [];
				const tabIndexById = this._indexById;
				const displayCnt = this.data.displayCount;
				const updates = {};

				validResults.forEach((r) => {
					if (r.price == null) return;
					const priceText = fmt(r.price);

					// 1) 全量缓存：更新价格 + 重算浮动盈亏
					const allIdx = allIndexById ? allIndexById.get(r.stockId) : undefined;
					if (allIdx != null && allCache[allIdx]) {
						const pos = allCache[allIdx];
						pos.currentPrice = r.price;
						pos.currentPriceText = priceText;
						pos.displayPriceText = priceText;
						if (pos.quantity > 0) {
							pos.floatingPnL = parseFloat(((r.price - pos.avgCost) * pos.quantity).toFixed(2));
							pos.floatingPnLText = fmt(pos.floatingPnL);
							pos.pnlPercentText = calcFloatingPercent(pos);
						}
					}

					// 2) 当前 tab 缓存：更新价格 + 重算浮动盈亏
					const idx = tabIndexById ? tabIndexById.get(r.stockId) : undefined;
					if (idx != null && tabCache[idx]) {
						const tpos = tabCache[idx];
						tpos.currentPrice = r.price;
						tpos.currentPriceText = priceText;
						tpos.displayPriceText = priceText;
						if (tpos.quantity > 0) {
							tpos.floatingPnL = parseFloat(((r.price - tpos.avgCost) * tpos.quantity).toFixed(2));
							tpos.floatingPnLText = fmt(tpos.floatingPnL);
							tpos.pnlPercentText = calcFloatingPercent(tpos);
						}
						// 3) 渲染层：仅当前 tab 前 displayCount 条做 data path 更新
						if (idx < displayCnt) {
							updates[`displayPositions[${idx}].currentPrice`] = r.price;
							updates[`displayPositions[${idx}].currentPriceText`] = priceText;
							updates[`displayPositions[${idx}].displayPriceText`] = priceText;
							if (tpos.quantity > 0) {
								updates[`displayPositions[${idx}].floatingPnL`] = tpos.floatingPnL;
								updates[`displayPositions[${idx}].floatingPnLText`] = tpos.floatingPnLText;
								updates[`displayPositions[${idx}].pnlPercentText`] = tpos.pnlPercentText;
							}
						}
					}
				});

				// 从更新后的全量缓存重建市场聚合（_marketAggCache 在首次加载时基于空价格计算，需要刷新）
				const newMarketAgg = {};
				let totalMV = 0,
					totalFL = 0;
				allCache.forEach((p) => {
					if (p.quantity <= 0) return;
					const rate = _getRate(p.market, rates);
					if (!newMarketAgg[p.market]) newMarketAgg[p.market] = { marketValue: 0, pnl: 0 };
					if (p.currentPrice) {
						const mv = p.currentPrice * p.quantity * rate;
						newMarketAgg[p.market].marketValue += mv;
						totalMV += mv;
					}
					const fl = (p.floatingPnL || 0) * rate;
					newMarketAgg[p.market].pnl += fl;
					totalFL += fl;
				});
				// 补上已实现盈亏 + 分红（不受价格变动影响，含已清仓股票）
				allCache.forEach((p) => {
					const rate = _getRate(p.market, rates);
					const realized = ((p.realizedPnL || 0) + (p.dividendIncome || 0)) * rate;
					if (realized !== 0) {
						if (p.quantity > 0 && newMarketAgg[p.market]) {
							newMarketAgg[p.market].pnl += realized;
						} else if (p.quantity <= 0) {
							if (!newMarketAgg[p.market]) newMarketAgg[p.market] = { marketValue: 0, pnl: 0 };
							newMarketAgg[p.market].pnl += realized;
						}
					}
				});
				let aggTotalPnL = 0;
				for (const mkt in newMarketAgg) {
					newMarketAgg[mkt].marketValue = parseFloat(newMarketAgg[mkt].marketValue.toFixed(2));
					newMarketAgg[mkt].pnl = parseFloat(newMarketAgg[mkt].pnl.toFixed(2));
					aggTotalPnL += newMarketAgg[mkt].pnl;
				}
				newMarketAgg[null] = {
					marketValue: parseFloat(totalMV.toFixed(2)),
					pnl: parseFloat(aggTotalPnL.toFixed(2)),
				};
				this._marketAggCache = newMarketAgg;

				// 更新汇总（全量重算，避免增量方案在 cache mutate 后读到新价格导致 delta 错误）
				const newTotalMarketValue = parseFloat(totalMV.toFixed(2));
				const totalRealized = allCache.reduce(
					(s, p) =>
						s + ((p.realizedPnL || 0) + (p.dividendIncome || 0)) * _getRate(p.market, rates),
					0,
				);
				const newTotalPnL = parseFloat((totalFL + totalRealized).toFixed(2));
				const totalInvestment = this._cachedTotalInvestment || 0;

				updates._rates = rates;
				updates.totalMarketValue = newTotalMarketValue;
				updates.totalMarketValueText = fmt(newTotalMarketValue);
				updates.totalPnL = newTotalPnL;
				updates.totalPnLText = fmt(newTotalPnL);
				updates.totalPnLPercent =
					totalInvestment > 0 ? parseFloat(((newTotalPnL / totalInvestment) * 100).toFixed(2)) : 0;
				updates["displayValues.totalMarketValue"] = fmt(newTotalMarketValue);
				updates["displayValues.totalPnL"] = fmt(newTotalPnL);
				updates["displayValues.totalPnLPercent"] = fmt(
					totalInvestment > 0 ? parseFloat(((newTotalPnL / totalInvestment) * 100).toFixed(2)) : 0,
				);

				this.setData(updates);
			} else {
				// 无有效结果时仍刷新持仓（可能清理过期缓存等）
				this.refresh({ fetchPrices: false });
			}

			if (!silent) wx.hideLoading();

			if (!silent) {
				if (validResults.length > 0) {
					wx.showToast({ title: "价格已更新", icon: "success" });
				} else {
					wx.showToast({ title: "获取失败", icon: "none" });
				}
			}
		} catch (_err) {
			if (!silent) wx.hideLoading();
			this.refresh({ fetchPrices: false });
			if (!silent) wx.showToast({ title: "获取失败", icon: "none" });
		}
	},

	async onRefreshPrice(e) {
		const stockId = parseInt(e.currentTarget.dataset.stockId, 10);
		// [优化] 用 id→index Map O(1) 查找，替代数组 find
		const idx = this._indexById ? this._indexById.get(stockId) : undefined;
		const position = idx != null && this._positionsCache ? this._positionsCache[idx] : null;
		if (!position) {
			console.error("[onRefreshPrice] 未找到持仓", stockId, this._positionsCache);
			toast("未找到该资产");
			return;
		}

		console.log("[onRefreshPrice] 开始获取", position.market, position.code, position.name);
		loading("获取价格中...");

		try {
			_ensureNetworkModules();
			const priceData = await _fetchStockPrice(position.market, position.code);

			if (priceData && priceData.currentPrice > 0) {
				PriceCache.set(stockId, priceData.currentPrice);
				this._loadData();
				hideLoading();
				success("价格已更新");
			} else {
				hideLoading();
				toast("获取失败：价格无效");
				console.error("[onRefreshPrice] 价格无效", priceData);
			}
		} catch (err) {
			hideLoading();
			catchError(err, "获取失败");
			console.error("[onRefreshPrice] 异常", err);
		}
	},

	onSwipeEdit(e) {
		const stockId = e.currentTarget.dataset.stockId;
		this._closeAllSwipes?.();
		wx.navigateTo({
			url: `/packageDetail/pages/detail/detail?stockId=${stockId}`,
		});
	},

	onSwipeSell(e) {
		const stockId = e.currentTarget.dataset.stockId;
		// [优化] 用 id→index Map O(1) 查找，替代数组 find（与 onRefreshPrice 对齐）
		const stockIdNum = parseInt(stockId, 10);
		const idx = this._indexById ? this._indexById.get(stockIdNum) : undefined;
		const position = idx != null && this._positionsCache ? this._positionsCache[idx] : null;
		if (!position) {
			wx.showToast({ title: "未找到持有", icon: "none" });
			return;
		}
		this._closeAllSwipes?.();
		wx.navigateTo({
			url: `/packageRecord/pages/record/record?stockId=${stockId}&type=SELL`,
		});
	},

	onSwipeDelete(e) {
		const rawId = e.currentTarget.dataset.stockId;
		const stockId = parseInt(rawId, 10);
		if (Number.isNaN(stockId)) return;
		confirmDelete({
			content: "将删除该资产的所有资产记录，是否确认？",
			onConfirm: () => {
				this._closeAllSwipes?.();
				this.setData({ deletingId: rawId });
				if (this._deleteTimer) clearTimeout(this._deleteTimer);
				this._deleteTimer = setTimeout(() => {
					this._deleteTimer = null;
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

	// ========== 持仓截图分享 ==========
	onSharePortfolio() {
		this.setData({ generatingShare: true });
		_ensureShareModule();
		// 等待 canvas 挂载
		if (this._shareTimer) clearTimeout(this._shareTimer);
		this._shareTimer = setTimeout(() => {
			this._shareTimer = null;
			_sharePortfolio(this);
		}, 50);
	},

	// ========== 分享 ==========
	onShareAppMessage() {
		return {
			title: "茄子笔记本 - 我的资产",
			path: "/pages/index/index",
		};
	},
});
