const {
	getTotalStats,
} = require("../../utils/services/statsService");
const { getAllPositions } = require("../../utils/services/positionService");
const { Stock, Transaction, Dividend } = require("../../utils/models/index");
const { fmt } = require("../../utils/helpers/format");
const { computeAssetHoldingPortrait, computeAllTimeAssetFlow, assembleAnnualReport } = require("../../utils/helpers/annualReport");
const { buildStockMap } = require("../../utils/helpers/stockHelpers");
const { buildRecordView } = require("../../utils/helpers/recordView");
const { exportMD } = require("../../utils/exporters/markdown");
const { getRates, getRate, getCachedRate } = require("../../utils/services/exchangeRate");
const { wipeAll } = require("../../utils/services/dataService");
const pageMixin = require("../../utils/ui/pageMixin");

Page({
	data: {
		...pageMixin.initPageData(),
		entranceDone: false,
		loading: true,
		stats: null,
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

			// 期末资产（全历史资产持有口径，复用 computeAllTimeAssetFlow）
			const stockMap = buildStockMap(Stock.getAll());
			const rateOf = (id) => {
				const m = stockMap[id]?.market;
				return getCachedRate(m) || 1;
			};
			const { endingAsset } = computeAllTimeAssetFlow(
				Transaction.getAll(), Dividend.getAll(), rateOf,
			);

		const MS_PER_DAY = 86400000;
		const allDates = [
			...Transaction.getAll().map((t) => t.date),
			...Dividend.getAll().map((d) => d.date),
		].filter(Boolean);

		let recordDays = 0;
		if (allDates.length > 0) {
			// date 可能是 "YYYY-MM-DD" 或 ISO datetime（表单传 Date 时），直接解析最稳
			const earliest = allDates.reduce((min, d) => (d < min ? d : min), allDates[0]);
			const startMs = new Date(earliest).getTime();
			const todayUtc = new Date(new Date().toISOString().slice(0, 10)).getTime();
			if (Number.isFinite(startMs)) {
				recordDays = Math.ceil((todayUtc - startMs) / MS_PER_DAY) + 1;
			}
		}

		const stats = {
			totalPnL: totalStats.totalPnL,
			totalPnLText: (totalStats.totalPnL >= 0 ? "+" : "") + fmt(totalStats.totalPnL),
			recordCount: completeTrades.length,
			endingAssetText: fmt(endingAsset),
			recordDays,
		};

		this.setData({
			stats,
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

		const yearStart = new Date(year, 0, 1);
		const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
		const yearTx = Transaction.getByDateRange(yearStart, yearEnd);
		let rates = {};
		try {
			rates = await getRates();
		} catch (e) {
			console.error("[stats] getRates 失败", e);
			wx.showToast({ title: "数据加载失败", icon: "none" });
			return;
		}
		const stockMap = buildStockMap(Stock.getAll()); // {stockId:{name,market}}
		const rateOf = (id) => {
			const m = stockMap[id]?.market;
			return getRate(m, rates) || getCachedRate(m) || 1;
		};

		// 本年流水（资产持有口径）
		let yearInflow = 0, yearOutflow = 0;
		yearTx.forEach((t) => {
			const r = rateOf(t.stockId);
			const amt = t.price * t.quantity * r;
			if (t.type === "BUY") yearInflow += amt + t.fee * r;
			else yearOutflow += amt - t.fee * r;
		});
		Dividend.getAll().forEach((d) => {
			const dd = new Date(d.date);
			if (dd >= yearStart && dd <= yearEnd) {
				const r = rateOf(d.stockId);
				yearInflow += d.totalAmount * r;
			}
		});

		// 全历史期末资产
		const { endingAsset } = computeAllTimeAssetFlow(
			Transaction.getAll(), Dividend.getAll(), rateOf,
		);

		// 资产持有画像（全历史）
		const holdingPortrait = computeAssetHoldingPortrait(
			Transaction.getAll(), stockMap, Date.now(),
		);

		const annualReportData = assembleAnnualReport({
			year, yearInflow, yearOutflow, endingAsset, holdingPortrait, fmt,
		});
		this.setData({ showAnnualReport: true, annualReportData });
	},

	onCloseAnnualReport() {
		this.setData({ showAnnualReport: false, annualReportData: null });
	},

	onShareAppMessage() {
		const d = this.data.annualReportData;
		return {
			title: d ? `我的 ${d.year} 年度资产复盘` : "我的年度资产复盘",
			path: "/pages/stats/stats",
		};
	},

	onClearAllData() {
		wx.showModal({
			title: "⚠️ 确认清除",
			content: "将永久删除所有资产记录，此操作不可恢复！",
			confirmText: "确认清除",
			confirmColor: "#FF4D4F",
			cancelText: "取消",
			success: (res) => {
				if (res.confirm) {
					wipeAll();
				this.setData({
					stats: null,
					completeTrades: [],
					clearedPositions: [],
					loading: false,
				});
					wx.showToast({ title: "已清除所有数据", icon: "success" });
				}
			},
		});
	},

});
