// pages/detail/detail.js
const { Stock, Transaction, Dividend, PriceCache } = require("../../../utils/models/index");
const { calculatePosition } = require("../../../utils/services/positionService");
const { getStrategyStats } = require("../../../utils/services/statsService");
const { fmt, fmtShortDate, fmtTime } = require("../../../utils/helpers/format");
const { calcFloatingPercent } = require("../../../utils/helpers/positionCalculator");
const { getMarketLabel, getMarketColor } = require("../../../utils/constants/market");
const pageMixin = require("../../../utils/ui/pageMixin");
const { toast, success: fbSuccess } = require("../../../utils/ui/feedback");
const { confirmDelete } = require("../../../utils/ui/confirmDialog");

Page({
	data: {
		...pageMixin.initPageData(),
		entranceDone: false,
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
		formatCurrentPrice: "--",
		formatMarketValue: "0.00",
		formatDividendIncome: "0.00",
		showEditSheet: false,
		floatingPnLClass: "loss",
		floatingPnLText: "0.00",
		floatingPnLPercent: "0.00",
		realizedPnLClass: "loss",
		realizedPnLText: "0.00",
		totalPnLClass: "loss",
		totalPnLText: "0.00",
		disTransId: null,
		disDivId: null,
		editQuantity: "",
		editAvgCost: "",
		editCurrentPrice: "",
		heroPnLPercentText: "",
		heroBgClass: "",
		transactionGroups: [],
	},

	onLoad(options) {
		pageMixin.onLoadMixin(this);
		console.log("[detail] onLoad options:", JSON.stringify(options));
		if (options?.stockId) {
			this._stockId = parseInt(options.stockId, 10);
			this.loadData();
		}
	},

	onShow() {
		const dirty = pageMixin.onShowSubPackage();
		console.log("[detail] onShow dirty:", dirty, "_dataLoaded:", this._dataLoaded);
		if (dirty || !this._dataLoaded) {
			this.loadData();
		}
		if (!this.data.entranceDone) {
			this.setData({ entranceDone: true });
		}
	},

	onUnload() {
		if (this._deleteTransTimer) clearTimeout(this._deleteTransTimer);
		if (this._deleteDivTimer) clearTimeout(this._deleteDivTimer);
	},

	loadData() {
		console.log(
			"[detail] loadData start, _stockId:",
			this._stockId,
			"data.stockId:",
			this.data.stockId,
		);
		let stockId = this._stockId;
		if (!stockId) {
			stockId = this.data.stockId;
		}
		console.log("[detail] resolved stockId:", stockId);
		const stock = Stock.getById(stockId);
		console.log("[detail] Stock.getById:", stock ? `found ${stock.name}` : "null");
		if (!stock) {
			this.setData({ stockId: stockId });
			this._dataLoaded = true;
			wx.showToast({ title: "股票不存在或已删除", icon: "none" });
			return;
		}
		this._dataLoaded = true;

		let position;
		try {
			position = calculatePosition(stock.id);
		} catch (err) {
			console.error("[detail] calculatePosition error:", err?.message);
			wx.showToast({ title: "持仓计算失败", icon: "none" });
			return;
		}
		const rawTransactions = Transaction.getByStockId(stock.id);
		const transactions = rawTransactions.map(this._formatTransaction.bind(this));
		const dividends = Dividend.getByStockId(stock.id).map(this._formatDividend.bind(this));
		const strategySummary = getStrategyStats(rawTransactions);
		strategySummary.forEach((item) => {
			item.netPnLFormatted = fmt(Math.abs(item.netPnL));
		});

		// Cache for reuse
		this._rawTransactions = rawTransactions;

		const marketValue =
			position.currentPrice && position.quantity > 0
				? position.currentPrice * position.quantity
				: 0;
		const totalPnL = position.realizedPnL + position.floatingPnL + position.dividendIncome;

		const costBasis = position.avgCost * (position.quantity || 0);
		const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;
		const transactionGroups = this._groupTransactionsByMonth(transactions);
		transactionGroups.forEach((g, idx) => {
			g.expanded = idx < 2;
		});

		try {
			wx.setNavigationBarTitle({ title: stock.name || "股票详情" });
		} catch (_e) {}

		try {
			this.setData({
				stock: stock,
				stockId: stock.id,
				stockName: stock.name || "股票详情",
				marketLabel: getMarketLabel(stock.market),
				marketColor: getMarketColor(stock.market),
				position: position,
				transactions: transactions,
				transactionGroups: transactionGroups,
				dividends: dividends,
				disTransId: null,
				disDivId: null,
				strategySummary: strategySummary,
				formatAvgCost: fmt(position.avgCost),
				formatCurrentPrice: position.currentPrice != null ? fmt(position.currentPrice) : "--",
				formatMarketValue: fmt(marketValue),
				formatDividendIncome:
					(position.dividendIncome >= 0 ? "+" : "") + fmt(position.dividendIncome),
				floatingPnLClass: position.floatingPnL >= 0 ? "profit" : "loss",
				floatingPnLText:
					(position.floatingPnL >= 0 ? "+" : "") + fmt(Math.abs(position.floatingPnL)),
				floatingPnLPercent: calcFloatingPercent(position),
				realizedPnLClass: position.realizedPnL >= 0 ? "profit" : "loss",
				realizedPnLText:
					(position.realizedPnL >= 0 ? "+" : "") + fmt(Math.abs(position.realizedPnL)),
				totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
				totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(Math.abs(totalPnL)),
				heroPnLPercentText: `${(totalPnLPercent >= 0 ? "+" : "") + totalPnLPercent.toFixed(2)}%`,
				heroBgClass: totalPnL > 0 ? "hero-profit" : totalPnL < 0 ? "hero-loss" : "hero-flat",
			});
		} catch (err) {
			console.error("[detail] setData error:", err?.message);
			wx.showToast({ title: "渲染失败", icon: "none" });
		}
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

	_groupTransactionsByMonth(transactions) {
		const groupMap = {};
		transactions.forEach((t) => {
			const d = new Date(t.date);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			if (!groupMap[key]) {
				groupMap[key] = [];
			}
			groupMap[key].push(t);
		});
		return Object.keys(groupMap)
			.sort((a, b) => (b > a ? 1 : -1))
			.map((key) => {
				const parts = key.split("-");
				return {
					key: key,
					label: `${parseInt(parts[0], 10)}年${parseInt(parts[1], 10)}月`,
					count: groupMap[key].length,
					items: groupMap[key],
					expanded: false,
				};
			});
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

		const marketValue = price * quantity;
		const floatingPnL = quantity > 0 ? (price - avgCost) * quantity : 0;
		const totalPnL = position.realizedPnL + floatingPnL + position.dividendIncome;
		const pnlPercent = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
		const costBasis = avgCost * quantity;
		const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;

		this.setData({
			"position.currentPrice": price,
			"position.floatingPnL": floatingPnL,
			formatMarketValue: fmt(marketValue),
			floatingPnLClass: floatingPnL >= 0 ? "profit" : "loss",
			floatingPnLText: (floatingPnL >= 0 ? "+" : "") + fmt(Math.abs(floatingPnL)),
			floatingPnLPercent: pnlPercent.toFixed(2),
			totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
			totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(Math.abs(totalPnL)),
			heroPnLPercentText: `${(totalPnLPercent >= 0 ? "+" : "") + totalPnLPercent.toFixed(2)}%`,
			heroBgClass: totalPnL > 0 ? "hero-profit" : totalPnL < 0 ? "hero-loss" : "hero-flat",
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

	toggleTransactionGroup(e) {
		const key = e.currentTarget.dataset.key;
		const groups = this.data.transactionGroups.map((g) => {
			if (g.key === key) {
				return { ...g, expanded: !g.expanded };
			}
			return g;
		});
		this.setData({ transactionGroups: groups });
	},

	showTransactionActions(e) {
		const id = Number(e.currentTarget.dataset.id);

		wx.showActionSheet({
			itemList: ["编辑", "删除"],
			success: (res) => {
				if (res.tapIndex === 0) {
					wx.navigateTo({ url: `/packageRecord/pages/record/record?id=${id}` });
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
			},
		});
	},

	showDividendActions(e) {
		const id = Number(e.currentTarget.dataset.id);

		wx.showActionSheet({
			itemList: ["编辑", "删除"],
			success: (res) => {
				if (res.tapIndex === 0) {
					wx.navigateTo({
						url: `/packageDetail/pages/dividend/dividend?id=${id}`,
					});
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
			},
		});
	},

	toggleEditMode() {
		if (this.data.showEditSheet) {
			this.cancelEdit();
			return;
		}
		const position = this.data.position;
		this.setData({
			showEditSheet: true,
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
		this.setData({ showEditSheet: false });
	},

	savePosition() {
		const stockId = this.data.stockId || this._stockId;

		const quantityStr = this.data.editQuantity.trim();
		if (!/^\d+$/.test(quantityStr) || parseInt(quantityStr, 10) <= 0) {
			toast("请输入有效持仓数量");
			return;
		}
		const quantity = parseInt(quantityStr, 10);
		const avgCost = parseFloat(this.data.editAvgCost) || 0;
		const currentPrice = parseFloat(this.data.editCurrentPrice) || 0;

		if (avgCost <= 0) {
			toast("请输入有效成本价");
			return;
		}

		const position = this.data.position;
		const oldQuantity = position.quantity || 0;
		const oldAvgCost = position.avgCost || 0;

		const quantityDiff = quantity - oldQuantity;
		const costDiff = Math.abs(avgCost - oldAvgCost);

		if (quantityDiff === 0 && costDiff < 0.01) {
			if (currentPrice > 0) {
				PriceCache.set(stockId, currentPrice);
			}
			toast("持仓已是最新的");
			this.setData({ showEditSheet: false });
			if (currentPrice > 0) {
				this.loadData();
			}
			return;
		}

		try {
			if (costDiff < 0.01) {
				if (quantityDiff > 0) {
					const syntheticBuy = Transaction.create(
						stockId,
						"BUY",
						oldAvgCost,
						quantityDiff,
						0,
						new Date().toISOString(),
						"持仓调整",
						"手动调整持仓",
						[],
					);
					Transaction.save(syntheticBuy);
				} else {
					const syntheticSell = Transaction.create(
						stockId,
						"SELL",
						oldAvgCost,
						Math.abs(quantityDiff),
						0,
						new Date().toISOString(),
						"持仓调整",
						"手动调整持仓",
						[],
					);
					Transaction.save(syntheticSell);
				}
			} else {
				if (oldQuantity > 0) {
					const sellAll = Transaction.create(
						stockId,
						"SELL",
						oldAvgCost,
						oldQuantity,
						0,
						new Date().toISOString(),
						"成本调整",
						"手动调整成本价",
						[],
					);
					Transaction.save(sellAll);
				}
				const buyAll = Transaction.create(
					stockId,
					"BUY",
					avgCost,
					quantity,
					0,
					new Date().toISOString(),
					"成本调整",
					"手动调整成本价",
					[],
				);
				Transaction.save(buyAll);
			}
		} catch (_e) {
			toast("保存失败");
			return;
		}

		if (currentPrice > 0) {
			PriceCache.set(stockId, currentPrice);
		}

		fbSuccess("持仓已更新");
		this.setData({ showEditSheet: false });
		this.loadData();
	},
});
