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
const { shareAsset } = require("../../../utils/render/shareHelper");

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
		// 单资产分享
		generatingShare: false,
		// 删除资产 / 结清
		settled: false,
		// 备注·标签（持有本身）
		assetNote: "",
		assetTags: [],
		showMetaSheet: false,
		metaNoteInput: "",
		metaTagInput: "",
	},

	onLoad(options) {
		pageMixin.onLoadMixin(this);
		// 卸载守卫：防止 800ms 延迟 navigateBack 等 pending 定时器对已销毁子页帧二次操作
		this._unloaded = false;

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

	// ========== 单资产分享卡片 ==========
	onShareAsset() {
		if (!this.data.stock) {
			toast("暂无资产数据");
			return;
		}
		this.setData({ generatingShare: true });
		if (this._shareTimer) clearTimeout(this._shareTimer);
		this._shareTimer = setTimeout(() => {
			this._shareTimer = null;
			shareAsset(this);
		}, 50);
	},

	// ========== 更多操作：结清 / 删除 ==========
	onMoreActions() {
		if (!this.data.stock) return;
		wx.showActionSheet({
			itemList: ["结清处理", "删除资产"],
			success: (res) => {
				if (res.tapIndex === 0) this.onSettle();
				else if (res.tapIndex === 1) this.onDeleteAsset();
			},
		});
	},

	// 结清处理（两者皆可）：生成转出记录 或 仅标记已结清
	onSettle() {
		const stock = this.data.stock;
		const position = this.data.position;
		if (!stock) return;
		if (!position.quantity || position.quantity <= 0) {
			toast("当前无持仓，无需结清");
			return;
		}
		wx.showActionSheet({
			itemList: ["生成转出记录", "仅标记已结清"],
			success: (res) => {
				if (res.tapIndex === 0) {
					// 按当前价对剩余数量生成一笔「转出」，持仓归零
					const price = position.currentPrice && position.currentPrice > 0 ? position.currentPrice : null;
					const doSell = (sellPrice) => {
						const sell = Transaction.create(
							stock.id,
							"SELL",
							sellPrice,
							position.quantity,
							0,
							new Date().toISOString(),
							"结清",
							"资产结清转出",
							[],
						);
						Transaction.save(sell);
						fbSuccess("已生成结清转出");
						this.loadData();
					};
					if (price != null) {
						doSell(price);
					} else {
						wx.showModal({
							title: "结清价格",
							content: "未获取到当前价，请输入结清转出价格",
							editable: true,
							placeholderText: "0.00",
							success: (m) => {
								if (m.confirm) {
									const p = parseFloat(m.content);
									if (!Number.isNaN(p) && p > 0) doSell(p);
									else toast("请输入有效价格");
								}
							},
						});
					}
				} else if (res.tapIndex === 1) {
					// 软结清：置 settled 标记，保留全部记录、不产生新交易
					const s = Stock.getById(stock.id);
					if (s) {
						s.settled = true;
						Stock.save(s);
					}
					fbSuccess("已标记结清");
					this.loadData();
				}
			},
		});
	},

	// 删除资产（二次确认）：级联删除全部转入/转出与分红，不可恢复
	onDeleteAsset() {
		const stock = this.data.stock;
		if (!stock) return;
		confirmDelete({
			content: `删除「${stock.name}」将一并删除其全部转入/转出记录与分红，且不可恢复。`,
			onConfirm: () => {
				wx.showModal({
					title: "二次确认",
					content: "此操作不可恢复，确定彻底删除该资产？",
					confirmText: "彻底删除",
					success: (res) => {
						if (!res.confirm) return;
						loading("删除中...");
						Transaction.getByStockId(stock.id).forEach((t) => {
							Transaction.delete(t.id);
						});
						Dividend.getByStockId(stock.id).forEach((d) => {
							Dividend.delete(d.id);
						});
						Stock.delete(stock.id);
						hideLoading();
						fbSuccess("已删除");
						if (this._unloaded) return;
						setTimeout(() => {
							if (this._unloaded) return;
							try {
								wx.navigateBack();
							} catch (_e) {}
						}, 300);
					},
				});
			},
		});
	},

	// ========== 备注·标签（持有本身） ==========
	openMeta() {
		const stock = this.data.stock;
		if (!stock) return;
		this.setData({
			showMetaSheet: true,
			metaNoteInput: stock.note || "",
			metaTagInput: "",
			assetTags: stock.tags || [],
		});
	},

	closeMeta() {
		this.setData({ showMetaSheet: false });
	},

	onMetaNoteInput(e) {
		this.setData({ metaNoteInput: e.detail.value });
	},

	onMetaTagInput(e) {
		this.setData({ metaTagInput: e.detail.value });
	},

	onMetaAddTag() {
		const tag = (this.data.metaTagInput || "").trim();
		if (!tag) return;
		const tags = this.data.assetTags.slice();
		if (tags.indexOf(tag) >= 0) {
			this.setData({ metaTagInput: "" });
			return;
		}
		tags.push(tag);
		this.setData({ assetTags: tags, metaTagInput: "" });
	},

	onMetaRemoveTag(e) {
		const tag = e.currentTarget.dataset.tag;
		this.setData({ assetTags: this.data.assetTags.filter((t) => t !== tag) });
	},

	saveMeta() {
		const stock = Stock.getById(this.data.stockId || this._stockId);
		if (!stock) {
			this.setData({ showMetaSheet: false });
			return;
		}
		stock.note = this.data.metaNoteInput.trim();
		stock.tags = this.data.assetTags.slice();
		Stock.save(stock);
		fbSuccess("已保存");
		this.setData({ showMetaSheet: false });
		this.loadData();
	},

	onUnload() {
		// 先置位：任何后续 pending 的 setTimeout(navigateBack) 据此放弃对已销毁子页帧操作，
		// 避免触发框架内部 __subPageFrameEndTime__ 竞态（lib 3.16.1 已知销毁期 race）
		this._unloaded = true;
		if (this._shareTimer) clearTimeout(this._shareTimer);
		try {
			// C2 契约：per-id 删除定时器 Map，unload 时全部清理（bug #16）
			if (this._deleteTimers) {
				this._deleteTimers.forEach((timer) => {
					clearTimeout(timer);
				});
				this._deleteTimers.clear();
			}
		} catch (_e) {
			// 异常安全：teardown 抛错会打断框架自身的定时器清理，导致内部 setInterval 残留
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
					// 守卫：用户可能在 800ms 内已手动返回，onUnload 已置 _unloaded；
					// 此时再 navigateBack 会对已销毁子页帧操作，触发框架 __subPageFrameEndTime__ 竞态
					if (this._unloaded) return;
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
				settled: !!stock.settled,
				assetNote: stock.note || "",
				assetTags: stock.tags || [],
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
