/**
 * 持仓页（重构版 - 使用新架构）
 * 使用 positionService + positionStore + pageMixin
 * 数据变更通过 appStore.dataDirty 驱动页面刷新
 */

const positionService = require("../../utils/services/positionService");
const positionStore = require("../../utils/state/positionStore");
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
			{ key: MARKETS.A_SHARE, label: "A股", count: 0 },
			{ key: MARKETS.HK_SHARE, label: "港股", count: 0 },
			{ key: MARKETS.US_SHARE, label: "美股", count: 0 },
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
		this.updateDate();

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
		} else if (this._allPositionsCache?.length > 0) {
			await this.refresh();
		}
	},

	onUnload() {
		// 清理定时器
		if (this._animTimer) clearTimeout(this._animTimer);
		if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
		if (this._tabTimer) clearTimeout(this._tabTimer);
		if (this._deleteTimer) clearTimeout(this._deleteTimer);
		if (this._shareTimer) clearTimeout(this._shareTimer);
	},

	// ========== 统一刷新管道 ==========
	async refresh({ force = false, fetchPrices = true } = {}) {
		if (this._refreshing) return;
		this._refreshing = true;
		try {
			await this._loadData(force);
			if (fetchPrices && this._positionsCache?.length > 0) {
				// 行情刷新最小间隔 30s
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
			// 使用 positionService 获取数据（已封装缓存逻辑）
			// 注意：getAllPositions 内部使用同步 storage 操作，无需 Promise
			const allPositions = positionService.getAllPositions(forceRefresh);

			// 获取汇率（港股/美股 → 人民币换算）
			_ensureNetworkModules();
			const rates = await _getRates();
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

			// 更新 Store（会触发订阅回调）
			positionStore.commit("SET_POSITIONS", positions);

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

				// Pre-compute card class
				let cardClass = "position-card";
				if (newIds.has(p.id)) cardClass += " position-card-entering";
				if (priceFlashClass) cardClass += ` ${priceFlashClass}`;

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
					cardClass: cardClass,
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

			// 清除 flash + entering 动画标记（延迟后合并到单次 setData）
			const hasFlash = formattedPositions.some((p) => p.priceFlashClass !== "");
			const hasEntering = newIds.size > 0;
			if (hasFlash || hasEntering) {
				const delay = Math.max(
					TIMING_CONFIG.PRICE_FLASH_CLEAR_DELAY,
					TIMING_CONFIG.ENTER_ANIM_DELAY,
				);
				this._cleanupTimer = setTimeout(() => {
					const dispLen = Math.min(displayCount, displaySlice.length);
					const cleanupUpdates = {};
					for (let i = 0; i < dispLen; i++) {
						if (hasFlash) {
							cleanupUpdates[`displayPositions[${i}].priceFlashClass`] = "";
							displaySlice[i].priceFlashClass = "";
						}
						if (hasEntering) {
							cleanupUpdates[`displayPositions[${i}].entering`] = false;
							displaySlice[i].entering = false;
						}
					}
					if (hasFlash) {
						for (let i = dispLen; i < filteredPositions.length; i++) {
							filteredPositions[i].priceFlashClass = "";
						}
					}
					if (hasEntering) {
						for (let i = dispLen; i < filteredPositions.length; i++) {
							filteredPositions[i].entering = false;
						}
					}
					if (Object.keys(cleanupUpdates).length > 0) this.setData(cleanupUpdates);
				}, delay);
			}

			this._loading = false;
			this.setData(setDataUpdates);
		} catch (err) {
			console.error("[Index] loadData error:", err);
			this._loading = false;
			this.setData({ loading: false });
			wx.showToast({ title: "数据加载失败", icon: "none" });
			catchError(err, "加载失败");
		}
	},

	// Incremental summary update: only recompute contribution from stocks whose price changed
	_updateSummaryIncremental(priceResults) {
		const rates = this.data._rates || { usdToCny: 1, hkdToCny: 1 };
		let addedMarketValue = 0,
			addedPnL = 0;

		priceResults.forEach((r) => {
			const idx = this._allIndexById ? this._allIndexById.get(r.stockId) : undefined;
			const pos = idx != null && this._allPositionsCache ? this._allPositionsCache[idx] : null;
			if (!pos || pos.quantity <= 0) return;
			const rate = _getRate(pos.market, rates);
			const oldPrice = pos.currentPrice || 0;
			addedMarketValue += (r.price - oldPrice) * pos.quantity * rate;
			addedPnL += (r.price - oldPrice) * pos.quantity * rate;
		});

		if (addedMarketValue === 0 && addedPnL === 0) return;

		const totalMarketValue = parseFloat((this.data.totalMarketValue + addedMarketValue).toFixed(2));
		const totalPnL = parseFloat((this.data.totalPnL + addedPnL).toFixed(2));
		const totalInvestment = this._cachedTotalInvestment || 1;

		this.setData({
			totalMarketValue,
			totalMarketValueText: fmt(totalMarketValue),
			totalPnL,
			totalPnLText: fmt(totalPnL),
			totalPnLPercent:
				totalInvestment > 0 ? parseFloat(((totalPnL / totalInvestment) * 100).toFixed(2)) : 0,
			"displayValues.totalMarketValue": fmt(totalMarketValue),
			"displayValues.totalPnL": fmt(totalPnL),
			"displayValues.totalPnLPercent": fmt(
				totalInvestment > 0 ? parseFloat(((totalPnL / totalInvestment) * 100).toFixed(2)) : 0,
			),
		});
	},

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
		const stockId = e.currentTarget.dataset.stockId;
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

	// 长按持仓卡片 — 快捷操作菜单
	onPositionLongPress(e) {
		const stockId = parseInt(e.currentTarget.dataset.stockId, 10);
		if (Number.isNaN(stockId)) return;
		const stock = (this._allPositionsCache || []).find((p) => p.id === stockId);
		if (!stock) return;
		wx.showActionSheet({
			itemList: ["查看详情", "快速卖出", "添加交易"],
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

	// 跳转到添加交易
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

	// ========== 获取行情 ==========
	async _fetchPrices(opts) {
		const silent = opts?.silent;
		const force = opts?.force;
		// [优化] 行情源用 _allPositionsCache（全市场全量，含已清仓），确保跨 tab 都能抓行情
		const positions = this._allPositionsCache || [];
		if (!positions || positions.length === 0) return;

		// 非强制时跳过 TTL 未过期的股票
		const needFetch = force ? positions : positions.filter((p) => !PriceCache.has(p.id));

		if (needFetch.length === 0) {
			if (!silent) wx.showToast({ title: "行情已是最新", icon: "none" });
			return;
		}

		if (!silent) wx.showLoading({ title: "获取行情中..." });

		try {
			_ensureNetworkModules();
			const results = await _fetchAllPrices(needFetch);
			const validResults = results.filter((r) => r.price !== null);

			if (validResults.length > 0) {
				// 批量写入缓存
				PriceCache.setBatch(validResults);
				// [优化] positions / _allPositions 已移出 data：
				//   - 全量缓存 + 当前 tab 缓存直接内存赋值（不进 setData）
				//   - 仅 displayPositions（渲染层）用 data path 精确更新
				const allCache = this._allPositionsCache || [];
				const allIndexById = this._allIndexById;
				const tabCache = this._positionsCache || [];
				const tabIndexById = this._indexById;
				const displayCnt = this.data.displayCount;
				const updates = {};

				validResults.forEach((r) => {
					if (r.price == null) return;
					const priceText = fmt(r.price);

					// 1) 全量缓存：直接内存赋值（_updateSummary 会读到最新值）
					const allIdx = allIndexById ? allIndexById.get(r.stockId) : undefined;
					if (allIdx != null && allCache[allIdx]) {
						allCache[allIdx].currentPrice = r.price;
						allCache[allIdx].currentPriceText = priceText;
						allCache[allIdx].displayPriceText = priceText;
					}

					// 2) 当前 tab 缓存：直接内存赋值
					const idx = tabIndexById ? tabIndexById.get(r.stockId) : undefined;
					if (idx != null && tabCache[idx]) {
						tabCache[idx].currentPrice = r.price;
						tabCache[idx].currentPriceText = priceText;
						tabCache[idx].displayPriceText = priceText;
						// 3) 渲染层：仅当前 tab 前 displayCount 条做 data path 更新
						if (idx < displayCnt) {
							updates[`displayPositions[${idx}].currentPrice`] = r.price;
							updates[`displayPositions[${idx}].currentPriceText`] = priceText;
							updates[`displayPositions[${idx}].displayPriceText`] = priceText;
						}
					}
				});

				if (Object.keys(updates).length > 0) {
					this.setData(updates);
					// cache 有变化且渲染层已更新，增量重算汇总
					this._updateSummaryIncremental(validResults);
				}
			} else {
				// 无有效结果时仍刷新持仓（可能清理过期缓存等）
				this.refresh({ fetchPrices: false });
			}

			if (!silent) wx.hideLoading();

			if (!silent) {
				if (validResults.length > 0) {
					wx.showToast({ title: "行情已更新", icon: "success" });
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
			toast("未找到该股票");
			return;
		}

		console.log("[onRefreshPrice] 开始获取", position.market, position.code, position.name);
		loading("获取行情中...");

		try {
			_ensureNetworkModules();
			const priceData = await _fetchStockPrice(position.market, position.code);

			if (priceData && priceData.currentPrice > 0) {
				PriceCache.set(stockId, priceData.currentPrice);
				this._loadData();
				hideLoading();
				success("行情已更新");
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
			wx.showToast({ title: "未找到持仓", icon: "none" });
			return;
		}
		wx.navigateTo({
			url: `/packageRecord/pages/record/record?stockId=${stockId}&type=SELL`,
		});
	},

	onSwipeDelete(e) {
		const rawId = e.currentTarget.dataset.stockId;
		const stockId = parseInt(rawId, 10);
		if (Number.isNaN(stockId)) return;
		confirmDelete({
			content: "将删除该股票的所有交易记录和分红记录，是否确认？",
			onConfirm: () => {
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
			title: "茄子笔记本 - 我的股票持仓",
			path: "/pages/index/index",
		};
	},
});
