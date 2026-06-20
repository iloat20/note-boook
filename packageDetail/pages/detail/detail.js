// pages/detail/detail.js
const { Stock, Transaction, Dividend, PriceCache } = require("../../../utils/models/index");
const { calculatePosition } = require("../../../utils/services/positionService");
const { getStrategyStats } = require("../../../utils/services/statsService");
const { fmt, fmtShortDate, fmtTime } = require("../../../utils/helpers/format");
const { calcFloatingPercent } = require("../../../utils/helpers/positionCalculator");
const {
	getMarketLabel,
	getMarketColor,
	getMarketCurrency,
} = require("../../../utils/constants/market");
const pageMixin = require("../../../utils/ui/pageMixin");
const { toast, success: fbSuccess } = require("../../../utils/ui/feedback");

Page({
	data: {
		statusBarHeight: 0,
		navBarHeight: 44,
		stock: null,
		stockId: null,
		stockName: "股票详情",
		marketLabel: "",
		marketColor: "#64748B",
		position: {
			quantity: 0,
			avgCost: 0,
			realizedPnL: 0,
			dividendIncome: 0,
			currentPrice: null,
			floatingPnL: 0,
			totalPnL: 0,
		},
		transactions: [],
		dividends: [],
		strategySummary: [],
		formatAvgCost: "0.00",
		formatMarketValue: "0.00",
		formatDividendIncome: "0.00",
		floatingPnLClass: "loss",
		floatingPnLText: "0.00",
		floatingPnLPercent: "0.00",
		realizedPnLClass: "loss",
		realizedPnLText: "0.00",
		totalPnLClass: "loss",
		totalPnLText: "0.00",
		disTransId: null,
		disDivId: null,
		editMode: false,
		editQuantity: "",
		editAvgCost: "",
		editCurrentPrice: "",
		heroPnLPercentText: "",
	},

	onLoad(options) {
		this.setData(getApp().getNavBarInfo());

		if (options?.stockId) {
			this._stockId = parseInt(options.stockId, 10);
			this.loadData();
		}
	},

	onShow() {
		if (pageMixin.consumeDirtyFlag() || !this._dataLoaded) {
			this.loadData();
		}
	},

	onUnload() {
		if (this._deleteTimer) clearTimeout(this._deleteTimer);
	},

	loadData() {
		let stockId = this._stockId;
		if (!stockId) {
			stockId = this.data.stockId;
		}
		const stock = Stock.getById(stockId);
		if (!stock) {
			this.setData({ stockId: stockId });
			return;
		}

		const position = calculatePosition(stock.id);
		const rawTransactions = Transaction.getByStockId(stock.id);
		const transactions = rawTransactions.map(this._formatTransaction.bind(this));
		const dividends = Dividend.getByStockId(stock.id).map(this._formatDividend.bind(this));
		const strategySummary = getStrategyStats(rawTransactions);

		// Cache for reuse
		this._rawTransactions = rawTransactions;
		this._currency = getMarketCurrency(stock.market);

		const marketValue =
			position.currentPrice && position.quantity > 0
				? position.currentPrice * position.quantity
				: 0;
		const totalPnL = position.realizedPnL + position.floatingPnL + position.dividendIncome;
		const currency = this._currency;

		const costBasis = position.avgCost * (position.quantity || 0);
		const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;

		wx.setNavigationBarTitle({ title: stock.name || "股票详情" });

		this._dataLoaded = true;
		this.setData({
			stock: stock,
			stockId: stock.id,
			stockName: stock.name || "股票详情",
			marketLabel: getMarketLabel(stock.market),
			marketColor: getMarketColor(stock.market),
			position: position,
			transactions: transactions,
			dividends: dividends,
			disTransId: null,
			disDivId: null,
			strategySummary: strategySummary,
			formatAvgCost: currency + fmt(position.avgCost),
			formatCurrentPrice: position.currentPrice ? currency + fmt(position.currentPrice) : "--",
			formatMarketValue: currency + fmt(marketValue),
			formatDividendIncome:
				(position.dividendIncome >= 0 ? "+" : "") + currency + fmt(position.dividendIncome),
			floatingPnLClass: position.floatingPnL >= 0 ? "profit" : "loss",
			floatingPnLText:
				(position.floatingPnL >= 0 ? "+" : "") + currency + fmt(Math.abs(position.floatingPnL)),
			floatingPnLPercent: calcFloatingPercent(position),
			realizedPnLClass: position.realizedPnL >= 0 ? "profit" : "loss",
			realizedPnLText:
				(position.realizedPnL >= 0 ? "+" : "") + currency + fmt(Math.abs(position.realizedPnL)),
			totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
			totalPnLText: (totalPnL >= 0 ? "+" : "") + currency + fmt(Math.abs(totalPnL)),
			heroPnLPercentText: `${(totalPnLPercent >= 0 ? "+" : "") + totalPnLPercent.toFixed(2)}%`,
		});
	},

	_formatTransaction(transaction) {
		const typeClass = transaction.type === "BUY" ? "buy" : "sell";
		const strategies = transaction.strategies || [];
		const reason = transaction.reason || "";
		return {
			id: transaction.id,
			stockId: transaction.stockId,
			type: transaction.type,
			typeClass: typeClass,
			typeText: transaction.type === "BUY" ? "买入" : "卖出",
			price: transaction.price,
			quantity: transaction.quantity,
			fee: transaction.fee,
			date: transaction.date,
			note: transaction.note,
			reason: reason,
			strategies: strategies,
			hasJournal: !!(reason || strategies.length),
			dateText: fmtShortDate(transaction.date),
			timeText: fmtTime(transaction.date),
			priceText: fmt(transaction.price),
			feeText: fmt(transaction.fee),
			amountText:
				(transaction.type === "BUY" ? "-" : "+") + fmt(transaction.price * transaction.quantity),
		};
	},

	_formatDividend(dividend) {
		return {
			id: dividend.id,
			stockId: dividend.stockId,
			perShareAmount: dividend.perShareAmount,
			quantity: dividend.quantity,
			totalAmount: dividend.totalAmount,
			date: dividend.date,
			note: dividend.note,
			dateText: fmtShortDate(dividend.date),
			perShareText: fmt(dividend.perShareAmount),
			totalText: fmt(dividend.totalAmount),
		};
	},

	updatePrice(e) {
		const price = parseFloat(e.detail.value);
		const stockId = this.data.stockId || this._stockId;
		if (!Number.isNaN(price) && price > 0) {
			PriceCache.set(stockId, price);
			// Incremental update: only recalculate price-dependent fields
			this._updatePriceFields(price);
		} else {
			this.loadData();
		}
	},

	_updatePriceFields(price) {
		const position = this.data.position;
		const quantity = position.quantity || 0;
		const avgCost = position.avgCost || 0;
		const currency = this._currency || getMarketCurrency(this.data.stock?.market);

		const marketValue = price * quantity;
		const floatingPnL = quantity > 0 ? (price - avgCost) * quantity : 0;
		const totalPnL = position.realizedPnL + floatingPnL + position.dividendIncome;
		const pnlPercent = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
		const costBasis = avgCost * quantity;
		const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;

		this.setData({
			"position.currentPrice": price,
			"position.floatingPnL": floatingPnL,
			formatCurrentPrice: currency + fmt(price),
			formatMarketValue: currency + fmt(marketValue),
			floatingPnLClass: floatingPnL >= 0 ? "profit" : "loss",
			floatingPnLText: (floatingPnL >= 0 ? "+" : "") + currency + fmt(Math.abs(floatingPnL)),
			floatingPnLPercent: parseFloat(pnlPercent.toFixed(2)),
			totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
			totalPnLText: (totalPnL >= 0 ? "+" : "") + currency + fmt(Math.abs(totalPnL)),
			heroPnLPercentText: `${(totalPnLPercent >= 0 ? "+" : "") + totalPnLPercent.toFixed(2)}%`,
		});
	},

	goBack() {
		wx.navigateBack();
	},

	goToRecord() {
		const stockId = this.data.stockId || this._stockId;
		wx.navigateTo({
			url: `/packageRecord/pages/record/record?stockId=${stockId}`,
		});
	},

	goToDividend() {
		const stockId = this.data.stockId || this._stockId;
		wx.navigateTo({
			url: `/packageDetail/pages/dividend/dividend?stockId=${stockId}`,
		});
	},

	showTransactionActions(e) {
		const id = e.currentTarget.dataset.id;

		wx.showActionSheet({
			itemList: ["编辑", "删除"],
			success: (res) => {
				if (res.tapIndex === 0) {
					wx.navigateTo({ url: `/packageRecord/pages/record/record?id=${id}` });
				} else if (res.tapIndex === 1) {
					wx.showModal({
						title: "确认删除",
						content: "确定要删除这笔交易记录吗？",
						success: (modalRes) => {
							if (modalRes.confirm) {
								this.setData({ disTransId: id });
								if (this._deleteTimer) clearTimeout(this._deleteTimer);
								this._deleteTimer = setTimeout(() => {
									Transaction.delete(id);
									this.loadData();
								}, 400);
							}
						},
					});
				}
			},
		});
	},

	showDividendActions(e) {
		const id = e.currentTarget.dataset.id;

		wx.showActionSheet({
			itemList: ["编辑", "删除"],
			success: (res) => {
				if (res.tapIndex === 0) {
					wx.navigateTo({
						url: `/packageDetail/pages/dividend/dividend?id=${id}`,
					});
				} else if (res.tapIndex === 1) {
					wx.showModal({
						title: "确认删除",
						content: "确定要删除这笔分红记录吗？",
						success: (modalRes) => {
							if (modalRes.confirm) {
								this.setData({ disDivId: id });
								if (this._deleteTimer) clearTimeout(this._deleteTimer);
								this._deleteTimer = setTimeout(() => {
									Dividend.delete(id);
									this.loadData();
								}, 400);
							}
						},
					});
				}
			},
		});
	},

	toggleEditMode() {
		if (this.data.editMode) {
			this.cancelEdit();
			return;
		}
		const position = this.data.position;
		this.setData({
			editMode: true,
			editQuantity: String(position.quantity),
			editAvgCost: String(position.avgCost),
			editCurrentPrice: position.currentPrice ? String(position.currentPrice) : "",
		});
	},

	onEditQuantityInput(e) {
		this.setData({ editQuantity: e.detail.value });
	},

	onEditAvgCostInput(e) {
		this.setData({ editAvgCost: e.detail.value });
	},

	onEditCurrentPriceInput(e) {
		this.setData({ editCurrentPrice: e.detail.value });
	},

	cancelEdit() {
		this.setData({ editMode: false });
	},

	savePosition() {
		const stockId = this.data.stockId || this._stockId;
		const quantity = parseInt(this.data.editQuantity, 10) || 0;
		const avgCost = parseFloat(this.data.editAvgCost) || 0;
		const currentPrice = parseFloat(this.data.editCurrentPrice) || 0;

		if (quantity <= 0) {
			toast("请输入有效持仓数量");
			return;
		}

		if (avgCost <= 0) {
			toast("请输入有效成本价");
			return;
		}

		const transactions = this._rawTransactions || Transaction.getByStockId(stockId);
		const dividends = Dividend.getByStockId(stockId);
		if (transactions.length === 0) {
			toast("暂无交易记录，无法调整持仓");
			return;
		}

		const totalCost = quantity * avgCost;
		let totalBuyQuantity = 0;
		let totalBuyAmount = 0;
		let totalSellQuantity = 0;
		let shareDividendQty = 0;

		transactions.forEach((t) => {
			if (t.type === "BUY") {
				totalBuyQuantity += t.quantity;
				totalBuyAmount += t.price * t.quantity + t.fee;
			} else {
				totalSellQuantity += t.quantity;
			}
		});

		dividends.forEach((d) => {
			if (d.type === "SHARE") shareDividendQty += d.shareQuantity || 0;
		});

		const totalShares = totalBuyQuantity + shareDividendQty;
		const avgBuyPrice = totalShares > 0 ? totalBuyAmount / totalShares : 0;
		const currentPosition = totalShares - totalSellQuantity;

		const diff = totalCost - currentPosition * avgBuyPrice;
		const feeRate = 0.0003;
		const syntheticFee = Math.abs(diff) * feeRate;

		if (Math.abs(diff) < avgBuyPrice * 0.5) {
			toast("持仓已是最新的");
			this.setData({ editMode: false });
			return;
		}

		if (diff > 0) {
			const buyQty = Math.max(Math.round(diff / avgBuyPrice), 1);
			const syntheticBuy = Transaction.create(
				stockId,
				"BUY",
				avgBuyPrice,
				buyQty,
				syntheticFee,
				new Date().toISOString(),
				"持仓调整",
				"手动调整持仓",
				[],
			);
			Transaction.save(syntheticBuy);
		} else if (diff < 0) {
			const sellQuantity = Math.min(Math.round(Math.abs(diff) / avgBuyPrice), currentPosition);
			if (sellQuantity > 0) {
				const syntheticSell = Transaction.create(
					stockId,
					"SELL",
					avgBuyPrice,
					sellQuantity,
					syntheticFee,
					new Date().toISOString(),
					"持仓调整",
					"手动调整持仓",
					[],
				);
				Transaction.save(syntheticSell);
			}
		}

		if (currentPrice > 0) {
			PriceCache.set(stockId, currentPrice);
		}

		fbSuccess("持仓已更新");
		this.setData({ editMode: false });
		this.loadData();
	},
});
