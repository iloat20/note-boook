// pages/record/record.js
const { MARKETS, TIMING_CONFIG } = require("../../../utils/constants/index");
const { Stock, Transaction, Strategy, PriceCache } = require("../../../utils/models/index");
const {
	getSellableQuantity,
	calculatePosition,
} = require("../../../utils/services/positionService");
const { fetchStockPrice } = require("../../../utils/services/stockPrice");
const { calculateFee, getFeeBreakdown } = require("../../../utils/helpers/feeCalculator");
const { fmt } = require("../../../utils/helpers/format");
const { loadSearchHistory, saveSearchHistory } = require("../../../utils/helpers/searchHistory");
const {
	getMarketLabel,
	validateStockCode,
	formatStockCode,
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
		fee: "",
		date: "",
		time: "",
		note: "",
		codeError: "",
		feePreview: [],
		amountText: "0.00",
		actualText: "0.00",
		isEdit: false,
		marketLabel: "A股",
		markets: [
			{ key: MARKETS.A_SHARE, label: "A股" },
			{ key: MARKETS.HK_SHARE, label: "港股" },
			{ key: MARKETS.US_SHARE, label: "美股" },
		],
		showSuggestions: false,
		suggestions: [],
		highlightIndex: -1,
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
			date:
				now.getFullYear() +
				"-" +
				String(now.getMonth() + 1).padStart(2, "0") +
				"-" +
				String(now.getDate()).padStart(2, "0"),
			time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
			allStrategies: Strategy.getAll(),
		});
		if (options?.id) {
			this._isEdit = true;
			this._editId = parseInt(options.id, 10);
			this._loadEdit(this._editId);
		} else {
			if (options?.type) {
				this.setData({ type: options.type });
			}
			// 处理从持仓页跳转的新增交易
			if (options?.stockId) {
				const stock = Stock.getById(parseInt(options.stockId, 10));
				if (stock) {
					this.setData({
						market: stock.market,
						code: stock.code,
						name: stock.name,
						marketLabel: getMarketLabel(stock.market),
					});
					// 卖出交易自动填入现价和持仓数量
					if (this.data.type === "SELL") {
						this._fillSellDefaults(stock.id, stock.market, stock.code);
					}
				}
			}
		}
	},

	_loadEdit(id) {
		const transactions = Transaction.getAll();
		const transaction = transactions.find((t) => t.id === id);
		if (!transaction) {
			toast("交易记录不存在");
			wx.navigateBack();
			return;
		}
		const stock = Stock.getById(transaction.stockId);
		if (!stock) {
			toast("交易记录不存在");
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
			fee: String(transaction.fee),
			date:
				date.getFullYear() +
				"-" +
				String(date.getMonth() + 1).padStart(2, "0") +
				"-" +
				String(date.getDate()).padStart(2, "0"),
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
	onFeeInput(e) {
		this._feeManuallySet = true;
		this.setData({ fee: e.detail.value });
		const data = this.data;
		const tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity, 10) || 0);
		const fee = parseFloat(e.detail.value) || 0;
		const actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee;
		this.setData({
			amountText: fmt(tradeAmount),
			actualText: fmt(actualAmount),
		});
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
			this.setData({ codeError: `${getMarketLabel(data.market)}代码格式错误` });
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
		if (this._feeManuallySet) return;
		const data = this.data;
		const fee = calculateFee(data.market, data.type, data.price, data.quantity);
		const breakdown = getFeeBreakdown(data.market, data.type, data.price, data.quantity);
		const tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity, 10) || 0);
		const actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee;
		this.setData({
			fee: String(fee),
			feePreview: breakdown.items.map((item) => ({
				name: item.name,
				value: item.value,
				vt: fmt(item.value),
				rate: item.rate,
				min: item.min,
				note: item.note,
			})),
			amountText: fmt(tradeAmount),
			actualText: fmt(actualAmount),
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

	toggleFee() {
		this.setData({ feeExpanded: !this.data.feeExpanded });
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
		const fee = data.fee;
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
				toast("暂无可卖持仓");
				this._resetSubmit();
				return;
			}
			const cacheKey = `${market}_${code}`;
			if (this._stockValidCache?.[cacheKey] === false) {
				toast("股票代码无效或不在该市场，请检查");
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
					toast("股票代码无效或不在该市场，请检查");
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

	// 实际创建/保存逻辑（原 submit 后半段）
	_doSubmit(stock, type, price, quantity, date, time, code, market, name, fee, note, data) {
		if (type === "SELL") {
			const ignoredTransactionId = this._isEdit ? this._editId : null;
			const sellableQuantity = getSellableQuantity(stock.id, ignoredTransactionId);
			if (parseInt(quantity, 10) > sellableQuantity) {
				toast("卖出数量超过持仓");
				this._resetSubmit();
				return;
			}
		}
		if (!stock) {
			stock = Stock.create(code, name, market);
			Stock.save(stock);
		}

		// 提交时把价格写入 PriceCache，回到持仓页立即可用
		const priceNum = parseFloat(price);
		if (stock?.id && priceNum > 0) {
			PriceCache.set(stock.id, priceNum);
		}

		const transaction = Transaction.create(
			stock.id,
			type,
			price,
			quantity,
			fee,
			new Date(`${date}T${time}:00`).toISOString(),
			note,
			data.reason,
			data.strategies,
		);
		if (this._isEdit) transaction.id = this._editId;
		Transaction.save(transaction);
		success(this._isEdit ? "已修改" : "已添加");
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
	},

	onUnload() {
		if (this._fetchTimer) clearTimeout(this._fetchTimer);
		if (this._navTimer) clearTimeout(this._navTimer);
		if (this._subTimer) clearTimeout(this._subTimer);
	},
});
