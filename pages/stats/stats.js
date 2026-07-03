const {
	getPeriodStatsList,
	getStrategyStats,
	getTotalXIRR,
	getTotalStats,
} = require("../../utils/services/statsService");
const { getAllPositions } = require("../../utils/services/positionService");
const { Stock, Transaction, Dividend } = require("../../utils/models/index");
const { fmt } = require("../../utils/helpers/format");
const { buildStockMap } = require("../../utils/helpers/stockHelpers");
const { buildRecordView } = require("../../utils/helpers/recordView");
const { exportMD } = require("../../utils/exporters/markdown");
const { getRates, getRate } = require("../../utils/services/exchangeRate");
const pageMixin = require("../../utils/ui/pageMixin");
const {
	saveData,
	STOCK_KEY,
	TRANSACTION_KEY,
	DIVIDEND_KEY,
	PRICE_KEY,
	STRATEGY_KEY,
	clearMemCache,
} = require("../../utils/storageCore/core");
const { markDataDirty } = require("../../utils/cache/cacheManager");

Page({
	data: {
		...pageMixin.initPageData(),
		entranceDone: false,
		loading: true,
		stats: null,
		detailItems: [],
		heatmapData: [],
		heatmapYear: new Date().getFullYear(),
		heatmapMonth: new Date().getMonth() + 1,
		heatmapLabel: "",
		completeTrades: [],
		clearedPositions: [],
		showAnnualReport: false,
		annualReportData: null,
	},

	onLoad() {
		pageMixin.onLoadMixin(this);
	},

	async onShow() {
		const wasDirty = pageMixin.onShowMixin(this, 2);
		if (wasDirty || !this.data.stats) {
			await this.loadStats();
		}
		if (!this.data.entranceDone) {
			this.setData({ entranceDone: true });
		}
	},

	_computeAllPositions() {
		const positions = getAllPositions(true);
		this._positionsCache = positions;
		return positions;
	},

	_buildTradeListAndCleared() {
		const positions = this._computeAllPositions();
		const stocks = Stock.getAll();
		const stockMap = buildStockMap(stocks);
		const rawTx = Transaction.getAll();
		const allDivs = Dividend.getAll();

		const txList = rawTx.map((t) => {
			const stock = stockMap[t.stockId];
			return buildRecordView(t, stock, {
				amountClassPrefix: "detail-d-amount",
				amountClassForBuy: "xhs-loss",
				amountClassForSell: "xhs-profit",
				includeStatsFields: true,
				grossAmount: true,
			});
		});

		const divList = allDivs.map((d) => {
			const stock = stockMap[d.stockId];
			return buildRecordView(d, stock, {
				amountClassPrefix: "detail-d-amount",
				amountClassForDividend: "xhs-profit",
				includeStatsFields: true,
			});
		});

		const completeTrades = txList.concat(divList).sort((a, b) => b._sortKey - a._sortKey);

		const clearedPositions = Object.values(positions)
			.filter(
				(p) =>
					p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01),
			)
			.map((p) => {
				const totalPnL = p.realizedPnL + p.dividendIncome;
				return Object.assign({}, p, {
					totalPnL,
					totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(totalPnL),
					realizedPnLText: fmt(p.realizedPnL),
					dividendIncomeText: fmt(p.dividendIncome),
					pnlClass: totalPnL >= 0 ? "profit" : "loss",
				});
			});

		return { completeTrades, clearedPositions };
	},

	async loadStats() {
		try {
			const { completeTrades, clearedPositions } = this._buildTradeListAndCleared();
			const totalStats = getTotalStats();

			const allTx = Transaction.getAll();
			const allDiv = Dividend.getAll();
			let totalBuyFee = 0,
				totalSellFee = 0;
			allTx.forEach((t) => {
				if (t.type === "BUY") totalBuyFee += t.fee;
				else totalSellFee += t.fee;
			});
			const cnyDividendIncome = allDiv.reduce((s, d) => s + d.totalAmount, 0);

			const stats = {
				totalPnL: totalStats.totalPnL,
				totalPnLText: (totalStats.totalPnL >= 0 ? "+" : "") + fmt(totalStats.totalPnL),
				returnValue: totalStats.totalPnLPercent,
				returnText:
					(totalStats.totalPnLPercent >= 0 ? "+" : "") +
					totalStats.totalPnLPercent.toFixed(2) +
					"%",
				winRate:
					clearedPositions.length > 0
						? Math.round(
								(clearedPositions.filter((p) => p.totalPnL > 0).length / clearedPositions.length) *
									100,
							)
						: null,
				winRateText:
					clearedPositions.length > 0
						? `${Math.round((clearedPositions.filter((p) => p.totalPnL > 0).length / clearedPositions.length) * 100)}%`
						: "--",
			};

			const detailItems = [
				{
					label: "已实现盈亏",
					value: fmt(totalStats.realizedPnL),
					prefix: "",
					colorClass: totalStats.realizedPnL >= 0 ? "profit" : "loss",
				},
				{
					label: "收益率",
					value:
						(totalStats.totalPnLPercent >= 0 ? "+" : "") + totalStats.totalPnLPercent.toFixed(2),
					prefix: "",
					colorClass: totalStats.totalPnLPercent >= 0 ? "profit" : "loss",
				},
				{
					label: "分红收益",
					value: fmt(cnyDividendIncome),
					prefix: "",
					colorClass: "profit",
				},
				{ label: "买入手续费", value: fmt(totalBuyFee), prefix: "", colorClass: "" },
				{ label: "卖出手续费", value: fmt(totalSellFee), prefix: "", colorClass: "" },
			];

			this.setData({
				stats,
				detailItems,
				completeTrades,
				clearedPositions,
				loading: false,
			});
		} catch (err) {
			console.error("[stats] loadStats error:", err);
			this.setData({ loading: false });
			wx.showToast({ title: "数据加载失败", icon: "none" });
		}
	},

	onExportMD() {
		exportMD();
	},

	async onOpenAnnualReport() {
		const year = new Date().getFullYear();
		const yearPrefix = `${year}-`;

		const yearStart = new Date(year, 0, 1);
		const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
		const yearTx = Transaction.getByDateRange(yearStart, yearEnd);
		let buyCount = 0,
			sellCount = 0;
		yearTx.forEach((t) => {
			if (t.type === "BUY") buyCount++;
			else sellCount++;
		});

		const rates = await getRates();

		const stocks = Stock.getAll();
		const stockMarket = {};
		stocks.forEach((s) => {
			stockMarket[s.id] = s.market;
		});

		let yearBuyAmount = 0,
			yearSellAmount = 0,
			yearBuyFee = 0,
			yearSellFee = 0;
		yearTx.forEach((t) => {
			const r = getRate(stockMarket[t.stockId], rates);
			const amt = t.price * t.quantity;
			if (t.type === "BUY") {
				yearBuyAmount += amt * r;
				yearBuyFee += t.fee * r;
			} else {
				yearSellAmount += amt * r;
				yearSellFee += t.fee * r;
			}
		});

		let yearDivTotal = 0;
		Dividend.getAll().forEach((d) => {
			const dd = new Date(d.date);
			if (dd >= yearStart && dd <= yearEnd) {
				const r = getRate(stockMarket[d.stockId], rates);
				yearDivTotal += d.totalAmount * r;
			}
		});

		const yearInvestment = yearBuyAmount + yearBuyFee;
		const yearRecovery = yearSellAmount - yearSellFee + yearDivTotal;
		const yearPnL = yearRecovery - yearInvestment; // 净现金流（非会计盈亏）

		yearInvestment > 0 ? parseFloat(((yearPnL / yearInvestment) * 100).toFixed(2)) : 0;

		const periodList = getPeriodStatsList("MONTH", 12);
		const monthlyPnL = [];
		for (let m = 1; m <= 12; m++) {
			const label = yearPrefix + String(m).padStart(2, "0");
			const found = periodList.find((item) => item.label === label);
			monthlyPnL.push({ month: m, pnL: found ? found.pnL : 0 });
		}

		const positions = this._computeAllPositions();
		const cleared = Object.values(positions).filter(
			(p) =>
				p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01),
		);
		const winCount = cleared.filter((p) => p.realizedPnL + p.dividendIncome > 0).length;
		const winRate = cleared.length > 0 ? Math.round((winCount / cleared.length) * 100) : 0;

		const allPositions = Object.values(positions)
			.filter((p) => p.quantity > 0)
			.concat(cleared.map((p) => Object.assign({}, p, { floatingPnL: 0 })));
		const stockPnL = {};
		allPositions.forEach((p) => {
			const key = p.code;
			const r = getRate(p.market, rates);
			if (!stockPnL[key]) {
				stockPnL[key] = {
					code: p.code,
					name: p.name,
					market: p.market,
					totalPnL: 0,
				};
			}
			stockPnL[key].totalPnL +=
				((p.realizedPnL || 0) + (p.floatingPnL || 0) + (p.dividendIncome || 0)) * r;
		});
		const stockList = Object.values(stockPnL)
			.map((s) => {
				s.totalPnL = parseFloat(s.totalPnL.toFixed(2));
				s.totalPnLText = fmt(Math.abs(s.totalPnL));
				return s;
			})
			.sort((a, b) => b.totalPnL - a.totalPnL);
		const topStocks = stockList.slice(0, 5);
		const bottomStocks = stockList
			.filter((s) => s.totalPnL < 0)
			.reverse()
			.slice(0, 5)
			.map((s) => {
				s.totalPnLText = fmt(Math.abs(s.totalPnL));
				return s;
			});

		let strategyStats = getStrategyStats();
		const maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1;
		strategyStats = strategyStats.slice(0, 8).map((s) => {
			s.percent = Math.round((s.count / maxStrategyCount) * 100);
			return s;
		});

		let yearXIRR = null;
		let totalXIRR = null;
		try {
			const { calcXIRRForRange } = require("../../utils/services/xirrService");
			const xirrResults = await Promise.all([
				calcXIRRForRange(yearStart, yearEnd).catch(() => null),
				getTotalXIRR().catch(() => null),
			]);
			yearXIRR = xirrResults[0];
			totalXIRR = xirrResults[1];
		} catch (e) {
			console.error("XIRR 计算失败:", e);
		}

		this.setData({
			showAnnualReport: true,
			annualReportData: {
				year: year,
				tradeCount: yearTx.length,
				buyCount: buyCount,
				sellCount: sellCount,
				winRate: winRate,
				yearXIRR: yearXIRR,
				yearXIRRText: yearXIRR !== null ? `${yearXIRR.toFixed(2)}%` : "--",
				totalXIRR: totalXIRR,
				totalXIRRText: totalXIRR !== null ? `${totalXIRR.toFixed(2)}%` : "--",
				totalPnL: parseFloat(yearPnL.toFixed(2)),
				totalPnLText: fmt(Math.abs(yearPnL)),
				totalPnLPercent: yearXIRR !== null ? parseFloat(yearXIRR.toFixed(2)) : 0,

				totalInvestmentText: fmt(yearInvestment),
				totalRecoveryText: fmt(yearRecovery),
				dividendIncomeText: fmt(yearDivTotal),
				monthlyPnL: monthlyPnL,
				topStocks: topStocks,
				bottomStocks: bottomStocks,
				strategyStats: strategyStats,
			},
		});
	},

	onCloseAnnualReport() {
		this.setData({ showAnnualReport: false, annualReportData: null });
	},

	onClearAllData() {
		wx.showModal({
			title: "⚠️ 确认清除",
			content: "将永久删除所有股票、交易、分红记录，此操作不可恢复！",
			confirmText: "确认清除",
			confirmColor: "#FF4D4F",
			cancelText: "取消",
			success: (res) => {
				if (res.confirm) {
					saveData(STOCK_KEY, []);
					saveData(TRANSACTION_KEY, []);
					saveData(DIVIDEND_KEY, []);
					saveData(PRICE_KEY, {});
					saveData(STRATEGY_KEY, []);
					clearMemCache();
					markDataDirty("all");
					this.setData({
						stats: null,
						detailItems: [],
						completeTrades: [],
						clearedPositions: [],
						loading: false,
					});
					wx.showToast({ title: "已清除所有数据", icon: "success" });
				}
			},
		});
	},

	onUnload() {
		this._annualReportData = null;
	},
});
