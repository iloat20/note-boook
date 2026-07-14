// pages/detail/detail.js
const { Stock, Transaction, PriceCache } = require("../../../utils/models/index");
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
		stockName: "资产详情",
		emptyTitle: "加载中...",
		marketLabel: "",
		marketColor: "#64748B",
		position: {
			quantity: 0,
			avgCost: 0,
			realizedPnL: 0,
			currentPrice: null,
			floatingPnL: 0,
			totalPnL: 0,
		},
		transactions: [],
		strategySummary: [],
		formatAvgCost: "0.00",
		formatCurrentPrice: "--",
		formatMarketValue: "0.00",
		showEditSheet: false,
		floatingPnLClass: "loss",
		floatingPnLText: "0.00",
		floatingPnLPercent: "0.00",
		realizedPnLClass: "loss",
		realizedPnLText: "0.00",
		totalPnLClass: "loss",
		totalPnLText: "0.00",
		disTransId: null,
		editQuantity: "",
		editAvgCost: "",
		editCurrentPrice: "",
		heroPnLPercentText: "",
		heroBgClass: "",
		transactionGroups: [],
	},

	onLoad(options) {
		pageMixin.onLoadMixin(this);

		const raw = options?.stockId;
		if (raw !== undefined && raw !== null && raw !== "") {
			// 保留原始值（字符串或数字均可），getById 已做类型宽容匹配；
			// 仅在 parseInt 得到 NaN 时才回退到原始字符串，避免数字 id 被转成 NaN 后查不到
			const parsed = parseInt(raw, 10);
			this._stockId = Number.isNaN(parsed) ? raw : parsed;
			this.loadData();
		}
	},

	onShow() {
		const dirty = pageMixin.onShowSubPackage();

		if (dirty || !this._dataLoaded) {
			this.loadData();
		}
		if (!this.data.entranceDone) {
			this.setData({ entranceDone: true });
		}
	},

	onUnload() {
		// C2 契约：per-id 删除定时器 Map，unload 时全部清理（bug #16）
		if (this._deleteTimers) {
			this._deleteTimers.forEach((timer) => {
				clearTimeout(timer);
			});
			this._deleteTimers.clear();
		}
	},

	loadData() {

		let stockId = this._stockId;
		if (!stockId) {
			stockId = this.data.stockId;
		}

		const stock = Stock.getById(stockId);

		if (!stock) {
			// 区分「入口未带 stockId」与「资产确实被删除/不存在」，避免误导
			const missingParam = stockId === undefined || stockId === null || stockId === "";
			this.setData({
				stockId: stockId || null,
				emptyTitle: missingParam ? "缺少资产参数" : "资产不存在或已删除",
			});
			this._dataLoaded = true;
			const allIds = Stock.getAll().map((s) => ({ id: s.id, t: typeof s.id, name: s.name }));
			console.warn(
				"[detail] 未找到资产 | 收到的 stockId =",
				stockId,
				"类型:",
				typeof stockId,
				"| 存储中现有 stocks:",
				allIds,
			);
			if (missingParam) {
				// 入口异常（如未带参数的深链/扫码），自动返回，避免卡在空屏
				wx.showToast({ title: "缺少资产参数", icon: "none" });
				setTimeout(() => {
					try {
						wx.navigateBack();
					} catch (_e) {}
				}, 800);
			} else {
				wx.showToast({ title: "资产不存在或已删除", icon: "none" });
			}
			return;
		}
		this._dataLoaded = true;

		try {
			const position = calculatePosition(stock.id);
			const rawTransactions = Transaction.getByStockId(stock.id);
			const transactions = rawTransactions.map(this._formatTransaction.bind(this));
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
			const totalPnL = position.realizedPnL + position.floatingPnL;

			const costBasis = position.avgCost * (position.quantity || 0);
			const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;
			const transactionGroups = this._groupTransactionsByMonth(transactions);
			transactionGroups.forEach((g, idx) => {
				g.expanded = idx < 2;
			});

			try {
				wx.setNavigationBarTitle({ title: stock.name || "资产详情" });
			} catch (_e) {}

			this.setData({
				stock: stock,
				stockId: stock.id,
				stockName: stock.name || "资产详情",
				emptyTitle: "资产不存在",
				marketLabel: getMarketLabel(stock.market),
				marketColor: getMarketColor(stock.market),
				position: position,
				transactions: transactions,
				transactionGroups: transactionGroups,
				disTransId: null,
				strategySummary: strategySummary,
				formatAvgCost: fmt(position.avgCost),
				formatCurrentPrice: position.currentPrice != null ? fmt(position.currentPrice) : "--",
				formatMarketValue: fmt(marketValue),
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
			// 资产存在但数据处理/渲染失败：给出准确提示，而非误导性的「资产不存在」
			console.error("[detail] loadData 处理失败:", err?.message, err?.stack);
			this.setData({ emptyTitle: "加载失败，请重试" });
			wx.showToast({ title: "加载失败，请重试", icon: "none" });
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
			typeText: transaction.type === "BUY" ? "转入" : "转出",
			price: transaction.price,
			quantity: transaction.quantity,
			date: transaction.date,
			note: transaction.note,
			reason: reason,
			strategies: strategies,
			hasJournal: !!(reason || strategies.length),
			dateText: fmtShortDate(transaction.date),
			timeText: fmtTime(transaction.date),
			priceText: fmt(transaction.price),
			amountText:
				(transaction.type === "BUY" ? "-" : "+") + fmt(transaction.price * transaction.quantity),
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
			// Persist price — PriceCache.set marks the position cache dirty,
			// so loadData() will recalculate from a fresh (non-frozen) state.
			// Never mutate this.data.position directly — it is the LRU-cached
			// frozen position object and will throw under the C1 freeze contract.
			PriceCache.set(stockId, price);
			this.loadData();
		} else {
			this.loadData();
		}
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
						content: "确定要删除这笔资产记录吗？",
						onConfirm: () => {
							this.setData({ disTransId: Number(id) });
							if (!this._deleteTimers) this._deleteTimers = new Map();
							const key = `t:${id}`;
							if (this._deleteTimers.has(key)) clearTimeout(this._deleteTimers.get(key));
							this._deleteTimers.set(
								key,
								setTimeout(() => {
									this._deleteTimers.delete(key);
									Transaction.delete(id);
									this.loadData();
								}, 400),
							);
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
			toast("请输入有效持有数量");
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
			toast("持有已是最新的");
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
						"持有调整",
						"手动调整持有",
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
						"持有调整",
						"手动调整持有",
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

		fbSuccess("持有已更新");
		this.setData({ showEditSheet: false });
		this.loadData();
	},
});
