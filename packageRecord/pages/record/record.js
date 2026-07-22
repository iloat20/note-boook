// pages/record/record.js
const { MARKETS, TIMING_CONFIG } = require("../../../utils/constants/index");
const { Stock, Transaction, Strategy, PriceCache } = require("../../../utils/models/index");
const {
	calculatePosition,
} = require("../../../utils/services/positionService");
const { fetchStockPrice } = require("../../../utils/services/stockPrice");
const { persistTransaction } = require("../../../utils/services/transactionService");
const { fmt, fmtDate } = require("../../../utils/helpers/format");
const { loadSearchHistory, saveSearchHistory } = require("../../../utils/helpers/searchHistory");
const { getPref, updatePrefs } = require("../../../utils/storageCore/prefs");
const {
	getMarketLabel,
	validateStockCode,
	formatStockCode,
	inferMarket,
} = require("../../../utils/constants/market");
const { searchStocks } = require("../../../utils/data/stockDatabase");
const { toast, success } = require("../../../utils/ui/feedback");
const pageMixin = require("../../../utils/ui/pageMixin");

Page({
	data: {
		...pageMixin.initPageData(),
		market: MARKETS.A_SHARE,
		code: "",
		name: "",
		type: "BUY",
		price: "",
		quantity: "",
		date: "",
		time: "",
		note: "",
		codeError: "",
		amountText: "0.00",
		actualText: "0.00",
		isEdit: false,
		marketLabel: "境内",
		markets: [
			{ key: MARKETS.A_SHARE, label: "境内" },
			{ key: MARKETS.HK_SHARE, label: "香港" },
			{ key: MARKETS.US_SHARE, label: "海外" },
		],
		showSuggestions: false,
		suggestions: [],
		highlightIndex: -1,
		// 最近使用资产（快捷选择）
		recentStocks: [],
		// 股票搜索历史（空输入时展示）
		stockSearchHistory: [],
		keyword: "",
		showSearchHistory: false,
		showJournal: false,
		reason: "",
		strategies: [],
		allStrategies: [],
		showStrategyPicker: false,
		customStrategyInput: "",
		feeExpanded: false,
	},

	onLoad(options) {
		pageMixin.onLoadMixin(this);
		this._feeManuallySet = false;
		this._stockValidCache = {}; // 代码有效性缓存 { "A_SHARE_600519": true }
		this.setData({ stockSearchHistory: loadSearchHistory() });

		const now = new Date();
		this.setData({
			date: fmtDate(now),
			time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
			allStrategies: Strategy.getAll(),
		});
		if (options?.id) {
			this._isEdit = true;
			this._editId = parseInt(options.id, 10);
			this._loadEdit(this._editId);
		} else {
			// 新增：默认带入最近一次使用的标签（默认标签记忆）
			this.setData({ strategies: getPref("lastStrategies", []) });
			if (options?.type) {
				this.setData({ type: options.type });
			}
			// 处理从持仓页跳转的新增资产
			if (options?.stockId) {
				const stock = Stock.getById(parseInt(options.stockId, 10));
				if (stock) {
					this.setData({
						market: stock.market,
						code: stock.code,
						name: stock.name,
						marketLabel: getMarketLabel(stock.market),
					});
					// 卖出资产自动填入现价和持仓数量
					if (this.data.type === "SELL") {
						this._fillSellDefaults(stock.id, stock.market, stock.code);
					}
				}
			}
		}
		// 载入最近使用资产（快捷选择）
		this._loadRecentStocks();
	},

	_loadEdit(id) {
		const transactions = Transaction.getAll();
		const transaction = transactions.find((t) => t.id === id);
		if (!transaction) {
			toast("资产记录不存在");
			wx.navigateBack();
			return;
		}
		const stock = Stock.getById(transaction.stockId);
		if (!stock) {
			toast("资产记录不存在");
			wx.navigateBack();
			return;
		}
		const date = new Date(transaction.date);
		const hasJournal = !!(transaction.reason || transaction.strategies?.length);
		this.setData({
			isEdit: true,
			market: stock.market,
			code: stock.code,
			name: stock.name,
			type: transaction.type,
			price: String(transaction.price),
			quantity: String(transaction.quantity),
			date: fmtDate(date),
			time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
			note: transaction.note || "",
			reason: transaction.reason || "",
			strategies: transaction.strategies || [],
			showJournal: hasJournal,
			marketLabel: getMarketLabel(stock.market),
		});
		this._calcFee();
	},

	_fillSellDefaults(stockId, market, code) {
		// 获取持仓数量
		const position = calculatePosition(stockId);
		if (position && position.quantity > 0) {
			this.setData({ quantity: String(position.quantity) });
		}
		// 获取现价
		fetchStockPrice(market, code)
			.then(
				function (data) {
					if (data && data.currentPrice > 0) {
						this.setData({ price: String(data.currentPrice) });
						PriceCache.set(stockId, data.currentPrice);
						this._calcFee();
					}
				}.bind(this),
			)
			.catch(() => {});
	},

	selectMarket(e) {
		const market = e.currentTarget.dataset.market;
		this._clearAutoFetch();
		this.setData({
			market: market,
			code: "",
			name: "",
			codeError: "",
			marketLabel: getMarketLabel(market),
		});
		this._calcFee();
		// 切换市场后清空校验缓存（同一代码在不同市场有效性不同）
		this._stockValidCache = {};
		if (this.data.code) {
			const formatted = formatStockCode(this.data.code, market);
			this._probeStockValidity(market, formatted);
		}
	},

	selectType(e) {
		const type = e.currentTarget.dataset.type;
		this.setData({ type: type, reason: "", strategies: [] });
		this._calcFee();
	},

	onCodeInput(e) {
		const value = (e.detail.value || "").trim();
		this.setData({ code: value, codeError: "", name: "", keyword: value });
		const detected = inferMarket(value);
		if (detected && detected !== this.data.market) {
			this.setData({ market: detected, marketLabel: getMarketLabel(detected) });
		}
		this._checkCode();
		// 触发联想搜索（本地数据库）
		if (value.length >= 1) {
			const results = searchStocks(value, this.data.market, TIMING_CONFIG.SEARCH_SUGGESTIONS_MAX);
			this.setData({
				suggestions: results,
				showSuggestions: results.length > 0,
				showSearchHistory: false,
				highlightIndex: -1,
			});
			// 异步探测代码有效性（缓存结果，submit 时同步读）
			const formatted = formatStockCode(value, this.data.market);
			this._probeStockValidity(this.data.market, formatted);
		} else {
			// 空输入时展示搜索历史
			this.setData({
				suggestions: [],
				showSuggestions: false,
				showSearchHistory: this.data.stockSearchHistory.length > 0,
			});
		}
		// 自动获取：有效代码时延迟拉取名称和现价
		this._scheduleAutoFetch(value);
	},
	onNameInput(e) {
		this.setData({ name: e.detail.value });
	},
	onPriceInput(e) {
		this.setData({ price: e.detail.value });
		this._calcFee();
	},
	onQuantityInput(e) {
		const raw = e.detail.value;
		const sanitized = typeof raw === "string" ? raw.replace(/[^0-9]/g, "") : raw;
		if (sanitized !== raw) this.setData({ quantity: sanitized });
		else this.setData({ quantity: raw });
		this._calcFee();
	},
	onDateChange(e) {
		this.setData({ date: e.detail.value });
	},
	onTimeChange(e) {
		this.setData({ time: e.detail.value });
	},
	onNoteInput(e) {
		this.setData({ note: e.detail.value });
	},

	// 一键「刚才」：日期 + 时间设为当前时刻
	onJustNow() {
		const now = new Date();
		this.setData({
			date: fmtDate(now),
			time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
		});
	},

	// 最近使用资产：从交易记录反推，按最近交易时间取前 6 个去重资产
	_loadRecentStocks() {
		const txs = Transaction.getAll();
		const latestByStock = {};
		for (const t of txs) {
			const prev = latestByStock[t.stockId];
			if (!prev || new Date(t.date) > new Date(prev.date)) {
				latestByStock[t.stockId] = { stockId: t.stockId, date: t.date };
			}
		}
		const recents = Object.keys(latestByStock)
			.map((id) => latestByStock[id])
			.sort((a, b) => new Date(b.date) - new Date(a.date))
			.slice(0, 6)
			.map((r) => {
				const stock = Stock.getById(r.stockId);
				if (!stock) return null;
				return { market: stock.market, code: stock.code, name: stock.name };
			})
			.filter(Boolean);
		this.setData({ recentStocks: recents });
	},

	// 点选最近使用资产，快速回填市场/代码/名称并拉取行情
	onPickRecent(e) {
		const item = e.currentTarget.dataset.item;
		if (!item) return;
		this.setData({
			market: item.market,
			code: item.code,
			name: item.name,
			codeError: "",
			marketLabel: getMarketLabel(item.market),
			showSuggestions: false,
			showSearchHistory: false,
		});
		this._clearAutoFetch();
		this._stockValidCache = {};
		this._checkCode();
		this._scheduleAutoFetch(item.code);
	},

	onSelectSuggestion(e) {
		const item = e.currentTarget.dataset.item;
		this.setData({
			code: item.code,
			name: item.name,
			suggestions: [],
			showSuggestions: false,
			showSearchHistory: false,
			codeError: "",
		});
		saveSearchHistory(item.code);
		this.setData({ stockSearchHistory: loadSearchHistory() });
		this._calcFee();
		// 选中后自动拉取现价
		this._tryAutoFetch(item.code);
	},

	tapStockHistory(e) {
		const keyword = e.currentTarget.dataset.keyword;
		// 历史关键词可能是代码或名称，直接填入输入框并触发搜索
		this.setData({ code: keyword, keyword });
		this._checkCode();
		const results = searchStocks(keyword, this.data.market, TIMING_CONFIG.SEARCH_SUGGESTIONS_MAX);
		this.setData({
			suggestions: results,
			showSuggestions: results.length > 0,
			showSearchHistory: false,
		});
		this._scheduleAutoFetch(keyword);
	},

	hideSuggestions() {
		this.setData({ suggestions: [], showSuggestions: false, showSearchHistory: false });
		// 失焦时立即尝试自动获取（无延迟）
		this._tryAutoFetch(this.data.code);
	},

	_checkCode() {
		const data = this.data;
		if (!data.code) {
			this.setData({ codeError: "" });
			return;
		}
		if (!validateStockCode(data.code, data.market)) {
			this.setData({ codeError: "代码格式错误" });
		} else {
			this.setData({ codeError: "" });
		}
	},

	// 延迟自动获取（输入时防抖）
	_scheduleAutoFetch(code) {
		this._clearAutoFetch();
		if (!code || !validateStockCode(code, this.data.market)) return;
		this._fetchTimer = setTimeout(() => {
			this._tryAutoFetch(code);
		}, TIMING_CONFIG.AUTO_FETCH_DELAY_MS);
	},

	_clearAutoFetch() {
		if (this._fetchTimer) {
			clearTimeout(this._fetchTimer);
			this._fetchTimer = null;
		}
	},

	// 调用腾讯财经 API 获取名称和现价
	_tryAutoFetch(code) {
		if (!code || !validateStockCode(code, this.data.market)) return;
		// 避免重复请求
		if (this._fetchingCode === code) return;
		this._fetchingCode = code;

		fetchStockPrice(this.data.market, code)
			.then(
				function (data) {
					if (data?.name && this.data.code === code) {
						const updates = { name: data.name };
						// 如果价格未填或为0，自动填入现价
						if (!this.data.price || parseFloat(this.data.price) === 0) {
							updates.price = String(data.currentPrice);
						}
						this.setData(updates);
						this._calcFee();
						// 缓存现价到 PriceCache
						if (data.currentPrice > 0) {
							const stock = Stock.getByCode(code, this.data.market);
							if (stock) PriceCache.set(stock.id, data.currentPrice);
						}
					}
					this._fetchingCode = null;
				}.bind(this),
			)
			.catch(
				function () {
					this._fetchingCode = null;
				}.bind(this),
			);
	},

	_calcFee() {
		const data = this.data;
		const tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity, 10) || 0);
		this.setData({
			amountText: fmt(tradeAmount),
			actualText: fmt(tradeAmount),
		});
	},

	toggleJournal() {
		this.setData({ showJournal: !this.data.showJournal });
	},

	onReasonInput(e) {
		this.setData({ reason: e.detail.value });
	},

	openStrategyPicker() {
		this.setData({ showStrategyPicker: true, customStrategyInput: "" });
	},

	closeStrategyPicker() {
		this.setData({ showStrategyPicker: false });
	},

	toggleStrategy(e) {
		const tag = e.currentTarget.dataset.tag;
		const strategies = this.data.strategies.slice();
		const idx = strategies.indexOf(tag);
		if (idx >= 0) {
			strategies.splice(idx, 1);
		} else {
			strategies.push(tag);
		}
		this.setData({ strategies: strategies });
	},

	removeStrategy(e) {
		const tag = e.currentTarget.dataset.tag;
		const strategies = this.data.strategies.filter((s) => s !== tag);
		this.setData({ strategies: strategies });
	},

	onCustomStrategyInput(e) {
		this.setData({ customStrategyInput: e.detail.value });
	},

	addCustomStrategy() {
		const tag = (this.data.customStrategyInput || "").trim();
		if (!tag) return;
		Strategy.add(tag);
		const strategies = this.data.strategies.slice();
		if (strategies.indexOf(tag) === -1) strategies.push(tag);
		this.setData({
			strategies: strategies,
			allStrategies: Strategy.getAll(),
			customStrategyInput: "",
		});
	},

	confirmStrategyPicker() {
		this.setData({ showStrategyPicker: false });
	},

	goBack() {
		wx.navigateBack();
	},

	submit() {
		if (this._submitting) return;
		this._submitting = true;
		const data = this.data;
		const market = data.market;
		const code = formatStockCode(data.code, market);
		const name = data.name;
		const type = data.type;
		const price = data.price;
		const quantity = data.quantity;
		const fee = 0;
		const date = data.date;
		const time = data.time;
		const note = data.note;

		if (!code || !name) {
			toast("请填写代码和名称");
			this._resetSubmit();
			return;
		}
		if (!validateStockCode(code, market)) {
			toast("代码格式错误");
			this._resetSubmit();
			return;
		}
		if (!price || parseFloat(price) <= 0) {
			toast("请输入有效价格");
			this._resetSubmit();
			return;
		}
		if (quantity.includes(".")) {
			toast("数量必须为整数");
			this._resetSubmit();
			return;
		}
		if (!quantity || parseInt(quantity, 10) <= 0) {
			toast("请输入有效数量");
			this._resetSubmit();
			return;
		}
		if (!date || !time) {
			toast("请选择日期时间");
			this._resetSubmit();
			return;
		}

		// 新股票：SELL 不允许（无持仓可卖）；BUY 需校验代码真实性
		const stock = Stock.getByCode(code, market);
		if (!stock) {
			if (type === "SELL") {
				toast("暂无可转持有");
				this._resetSubmit();
				return;
			}
			const cacheKey = `${market}_${code}`;
			if (this._stockValidCache?.[cacheKey] === false) {
				toast("代码无效或无法识别，请检查");
				this._resetSubmit();
				return;
			}
			// 缓存未命中（如用户粘贴代码）时探测后提交
			this._validateAndSubmit(
				stock,
				market,
				code,
				name,
				type,
				price,
				quantity,
				fee,
				date,
				time,
				note,
				data,
			);
			return;
		}

		this._doSubmit(stock, type, price, quantity, date, time, code, market, name, fee, note, data);
	},

	// 兜底：提交失败 / 校验失败时统一重置 _submitting
	_resetSubmit() {
		this._subTimer = setTimeout(() => {
			this._submitting = false;
		}, 1000);
	},

	// C4 bail：校验失败早期 return — toast + 解锁 + return（bug #6）
	bail(msg) {
		toast(msg);
		this._resetSubmit();
	},

	/**
	 * 输入时异步探测代码有效性（缓存结果，submit 时同步读）
	 * 在 onCodeInput / selectMarket 时调用，避免 submit 阻塞
	 * @param {string} market
	 * @param {string} code - 格式化后的代码
	 */
	_probeStockValidity(market, code) {
		if (!code || !validateStockCode(code, market)) return;
		if (Stock.getByCode(code, market)) return; // 已有股票不需校验
		const cacheKey = `${market}_${code}`;
		if (!this._stockValidCache) this._stockValidCache = {};
		if (cacheKey in this._stockValidCache) return; // 已探测过

		fetchStockPrice(market, code)
			.then((result) => {
				// 页面已卸载时不要写回 detached 实例（防泄漏 + 防 write-after-unload）
				if (this._detached) return;
				this._stockValidCache[cacheKey] = result && result.currentPrice > 0;
			})
			.catch(() => {
				// 网络异常：不缓存（下次 submit 时可重试）
			});
	},

	// submit 时发现缓存未命中，同步等待一次
	_validateAndSubmit(
		stock,
		market,
		code,
		name,
		type,
		price,
		quantity,
		fee,
		date,
		time,
		note,
		data,
	) {
		fetchStockPrice(market, code)
			.then((result) => {
				const valid = !!(result && result.currentPrice > 0);
				if (!this._stockValidCache) this._stockValidCache = {};
				this._stockValidCache[`${market}_${code}`] = valid;
				if (!valid) {
					this.bail("代码无效或无法识别，请检查");
					return;
				}
				this._doSubmit(
					stock,
					type,
					price,
					quantity,
					date,
					time,
					code,
					market,
					name,
					fee,
					note,
					data,
				);
			})
			.catch(() => {
				// 网络异常：降级允许保存
				this._doSubmit(
					stock,
					type,
					price,
					quantity,
					date,
					time,
					code,
					market,
					name,
					fee,
					note,
					data,
				);
			});
	},

	// 实际创建/保存逻辑（原 submit 后半段）—— 持久化委托 transactionService
	_doSubmit(stock, type, price, quantity, date, time, code, market, name, fee, note, data) {
		const result = persistTransaction({
			stock,
			type,
			price,
			quantity,
			fee,
			date,
			time,
			code,
			market,
			name,
			note,
			reason: data.reason,
			strategies: data.strategies,
			isEdit: this._isEdit,
			editId: this._editId,
		});
		if (!result.ok) {
			toast("转出数量超过持有");
			this._resetSubmit();
			return;
		}
		success(this._isEdit ? "已修改" : "已添加");
		// 默认标签记忆：记住本次使用的标签
		updatePrefs({ lastStrategies: data.strategies || [] });
		this._navTimer = setTimeout(() => {
			wx.navigateBack();
		}, TIMING_CONFIG.NAVIGATE_BACK_DELAY);
		this._resetSubmit();
	},

	onShow() {
		if (pageMixin.onShowSubPackage()) {
			this._refreshAuxData();
		}
	},

	_refreshAuxData() {
		this.setData({ allStrategies: Strategy.getAll() });
		this._loadRecentStocks();
	},

	onUnload() {
		this._detached = true;
		if (this._fetchTimer) clearTimeout(this._fetchTimer);
		if (this._navTimer) clearTimeout(this._navTimer);
		if (this._subTimer) clearTimeout(this._subTimer);
	},
});
