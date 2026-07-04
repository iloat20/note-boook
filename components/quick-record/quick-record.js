/**
 * QuickRecord 组件 — 快速交易弹窗（重构版）
 *
 * 属性：
 *   visible  {boolean}  控制弹窗显示/隐藏
 *
 * 事件：
 *   close    — 用户关闭弹窗（背景点击 / ✕ 按钮）
 *   submit   — 交易记录保存成功
 */

const { fmt } = require("../../utils/helpers/format");
const {
	validateStockCode,
	getMarketLabel,
	formatStockCode,
} = require("../../utils/constants/market");
const { fetchStockPrice } = require("../../utils/services/stockPrice");
const { calculateFee } = require("../../utils/helpers/feeCalculator");
const { searchStocks } = require("../../utils/data/stockDatabase");
const { MARKETS } = require("../../utils/constants/index");
const { Stock, Transaction } = require("../../utils/models/index");
const { getSellableQuantity } = require("../../utils/services/positionService");

Component({
	properties: {
		visible: {
			type: Boolean,
			value: false,
			observer: "_onVisibleChange",
		},
	},

	data: {
		qrType: "BUY",
		qrCode: "",
		qrName: "",
		qrMarket: "A_SHARE",
		qrMarketLabel: "",
		qrPrice: "",
		qrQuantity: "100",
		qrDate: "",
		qrTime: "",
		qrFee: 0,
		qrFeeText: "0.00",
		qrActualText: "0.00",
		qrAmountText: "0.00",
		qrSuggestions: [],
		showQrSuggestions: false,
		qrFetching: false,
		showQrMore: false,
	},

	lifetimes: {
		attached() {
			this._marketLocked = false;
			this._detached = false;
			this._afTimer = null;
			this._afFetching = null;
			this._afProbe = null;
			this._blurTimer = null;
			this._feeTimer = null;
			this._stockValidCache = {};
		},
		detached() {
			// C2 契约：标记 detached，清理所有 timer 与进行中的异步标记（bug #9）
			this._detached = true;
			if (this._afTimer) clearTimeout(this._afTimer);
			if (this._feeTimer) clearTimeout(this._feeTimer);
			if (this._blurTimer) clearTimeout(this._blurTimer);
			this._afFetching = null;
			this._afProbe = null;
			this._stockValidCache = {};
		},
	},

	methods: {
		// ──── 生命周期 ────
		_onVisibleChange: function (visible) {
			if (visible) {
				const now = new Date();
				this.setData({
					qrDate:
						now.getFullYear() +
						"-" +
						String(now.getMonth() + 1).padStart(2, "0") +
						"-" +
						String(now.getDate()).padStart(2, "0"),
					qrTime:
						String(now.getHours()).padStart(2, "0") +
						":" +
						String(now.getMinutes()).padStart(2, "0"),
					showQrMore: false,
				});
			} else {
				this._resetForm();
			}
		},

		// ──── 关闭 ────
		close: function () {
			this.triggerEvent("close");
		},

		onSheetTap: () => {},

		// ──── 类型切换 ────
		onQrTypeSelect: function (e) {
			this.setData({ qrType: e.currentTarget.dataset.type });
			this._scheduleCalcFee();
			wx.vibrateShort({ type: "light" });
		},

		// 代码输入 + 自动获取（同步格式化 + 异步探测）
		onQrCodeInput: function (e) {
			const value = (e.detail.value || "").trim();
			let market = this.data.qrMarket;
			const prevCode = this.data.qrCode;

			if (!value) {
				this._marketLocked = false;
				market = "A_SHARE";
			} else if (!this._marketLocked) {
				const detected = this._detectMarket(value);
				if (detected) {
					market = detected;
					this._marketLocked = true;
				}
			}

			const formatted = formatStockCode(value, market);
			const codeChanged = value !== prevCode;

			// 核心修复：不清空正在获取中的价格；仅当代码改变+无获取中请求时清空
			const fetching = this._fetchingCode;
			const updates = {
				qrCode: value,
				qrMarket: market,
				qrMarketLabel: getMarketLabel(market),
				qrName: codeChanged && !fetching ? "" : this.data.qrName,
				qrPrice: codeChanged && !fetching ? "" : this.data.qrPrice,
			};

			if (value.length >= 1) {
				const results = searchStocks(value, market, 8);
				updates.qrSuggestions = results;
				updates.showQrSuggestions = results.length > 0;
			} else {
				updates.qrSuggestions = [];
				updates.showQrSuggestions = false;
			}

			this.setData(updates);
			this._scheduleCalcFee();

			// 输入完整（6 位/5 位/1-5 位字母）时获取价格
			if (formatted && validateStockCode(formatted, market)) {
				this._scheduleAutoFetch(formatted);
				this._probeStockPrice(market, formatted);
			}
		},

		onQrCodeBlur: function () {
			this._blurTimer = setTimeout(() => {
				this.setData({ showQrSuggestions: false });
			}, 200);
			// 失焦时：如果 qrPrice 仍空 + 当前代码有效，立即 try probe（兜底）
			const d = this.data;
			const code = formatStockCode(d.qrCode, d.qrMarket);
			if (
				code &&
				validateStockCode(code, d.qrMarket) &&
				(!d.qrPrice || parseFloat(d.qrPrice) <= 0)
			) {
				this._tryAutoFetch(code);
				this._probeStockPrice(d.qrMarket, code);
			}
		},

		onQrSelectSuggestion: function (e) {
			const item = e.currentTarget.dataset.item;
			this._marketLocked = false;
			this.setData({
				qrCode: item.code,
				qrName: item.name,
				qrMarket: item.market,
				qrMarketLabel: getMarketLabel(item.market),
				qrSuggestions: [],
				showQrSuggestions: false,
			});
			// 选中后自动拉取现价
			this._tryAutoFetch(item.code);
			this._scheduleCalcFee();
		},

		// ──── 自动获取（防抖） ────
		_scheduleAutoFetch: function (code) {
			// C2 detached 守卫（bug #9）
			if (this._detached) return;
			if (this._afTimer) {
				clearTimeout(this._afTimer);
				this._afTimer = null;
			}
			if (!code || !validateStockCode(code, this.data.qrMarket)) return;
			this._afTimer = setTimeout(() => {
				this._tryAutoFetch(code);
			}, 500);
		},

		_tryAutoFetch: function (code) {
			// C2 detached 守卫（bug #9）
			if (this._detached) return;
			if (!code || !validateStockCode(code, this.data.qrMarket)) return;
			if (this._afFetching === code) return;
			this._afFetching = code;
			this.setData({ qrFetching: true });

			fetchStockPrice(this.data.qrMarket, code)
				.then((data) => {
					if (this._detached) {
						this._afFetching = null;
						return;
					}
					if (data?.name && this.data.qrCode === code) {
						const updates = { qrName: data.name, qrFetching: false };
						if (!this.data.qrPrice || parseFloat(this.data.qrPrice) === 0) {
							updates.qrPrice = String(data.currentPrice);
						}
						this.setData(updates);
						this._scheduleCalcFee();
					} else {
						this.setData({ qrFetching: false });
					}
					this._afFetching = null;
				})
				.catch(() => {
					if (this._detached) {
						this._afFetching = null;
						return;
					}
					this.setData({ qrFetching: false });
					this._afFetching = null;
				});
		},

		// ──── 价格/数量 ────
		onQrPriceInput: function (e) {
			this.setData({ qrPrice: e.detail.value });
			this._scheduleCalcFee();
		},

		onQrQuantityInput: function (e) {
			this.setData({ qrQuantity: e.detail.value });
			this._scheduleCalcFee();
		},

		onQrQtyMinus: function () {
			const qty = Math.max(0, (parseInt(this.data.qrQuantity, 10) || 0) - 100);
			this.setData({ qrQuantity: qty > 0 ? String(qty) : "0" });
			this._scheduleCalcFee();
			wx.vibrateShort({ type: "light" });
		},

		onQrQtyPlus: function () {
			const qty = (parseInt(this.data.qrQuantity, 10) || 0) + 100;
			this.setData({ qrQuantity: String(qty) });
			this._scheduleCalcFee();
			wx.vibrateShort({ type: "light" });
		},

		// ──── 数量快捷预设 ────
		onQrQtyPreset: function (e) {
			const raw = e.currentTarget.dataset.qty;
			const qty = parseInt(String(raw).replace(/,/g, ""), 10) || 0;
			if (qty === 0) {
				// 全仓：TODO 后续可接持仓数据（需从 positionService.getSellableQuantity 获取当前持仓量，再反向计算市价全仓股数）
				wx.showToast({ title: "全仓功能开发中", icon: "none" });
				return;
			}
			this.setData({ qrQuantity: String(qty) });
			this._scheduleCalcFee();
			wx.vibrateShort({ type: "light" });
		},

		// ──── 日期/时间 ────
		toggleQrMore: function () {
			this.setData({ showQrMore: !this.data.showQrMore });
		},

		onQrDateChange: function (e) {
			this.setData({ qrDate: e.detail.value });
		},

		onQrTimeChange: function (e) {
			this.setData({ qrTime: e.detail.value });
		},

		// ──── [优化] 防抖费用计算 ────
		_scheduleCalcFee: function () {
			if (this._feeTimer) clearTimeout(this._feeTimer);
			this._feeTimer = setTimeout(() => {
				this._feeTimer = null;
				this._calcQrFee();
			}, 80);
		},

		// ──── 费用 ────
		_calcQrFee: function () {
			const d = this.data;
			const fee = calculateFee(d.qrMarket, d.qrType, d.qrPrice, d.qrQuantity);
			const tradeAmount = (parseFloat(d.qrPrice) || 0) * (parseInt(d.qrQuantity, 10) || 0);
			const actualAmount = d.qrType === "BUY" ? tradeAmount + fee : tradeAmount - fee;

			this.setData({
				qrFee: fee,
				qrFeeText: fmt(fee),
				qrAmountText: fmt(tradeAmount),
				qrActualText: fmt(actualAmount),
			});
		},

		// ──── 市场检测 ────
		_detectMarket: (code) => {
			const upper = (code || "").toUpperCase();
			// 优先：6 位数字 = A 股（先于 5 位，避免 6 位被误判为港股）
			if (/^\d{6}$/.test(code)) return MARKETS.A_SHARE;
			// 5 位数字默认 A 股（大多数中小板/创业板/科创板）；仅当有 HK 前缀才判港股
			if (/^(?:hk|HK)\d{1,5}$/.test(upper)) return MARKETS.HK_SHARE;
			if (/^\d{5}$/.test(code)) return MARKETS.A_SHARE;
			if (/^[A-Z]{1,5}$/.test(upper)) return MARKETS.US_SHARE;
			return null;
		},

		// 异步探测代码有效性 + 自动填充名称和价格（缓存结果）
		_probeStockPrice: function (market, code) {
			if (!code || !validateStockCode(code, market)) return;
			// C2 detached 守卫（bug #9）
			if (this._detached) return;
			const existing = Stock.getByCode(code, market);
			if (!this._stockValidCache) this._stockValidCache = {};
			const cacheKey = `${market}_${code}`;
			if (existing && cacheKey in this._stockValidCache) return;

			this._afProbe = code;
			this.setData({ qrFetching: true });
			fetchStockPrice(market, code)
				.then((result) => {
					if (this._detached) return;
					const valid = !!(result && result.currentPrice > 0);
					this._stockValidCache[cacheKey] = valid;

					if (valid && this._afProbe === code) {
						// 只要 probe 未改变输入（用户未快速输新码），无条件设置
						const priceStr = String(result.currentPrice);
						this.setData({
							qrName: result.name || existing?.name || "",
							qrPrice: priceStr,
						});

						this._calcQrFee();
					} else if (!valid) {
						wx.showToast({ title: "股票代码无效或无法获取行情", icon: "none" });
					}
				})
				.catch((err) => {
					if (this._detached) return;
					wx.showToast({ title: "网络异常，请手动输入价格", icon: "none" });
				})
				.finally(() => {
					if (this._detached) return;
					if (this._afProbe === code) {
						this.setData({ qrFetching: false });
					}
				});
		},

		// ──── 提交 ────
		submitQuickRecord: function () {
			if (this._submitting) return;
			this._submitting = true;

			const d = this.data;
			const code = formatStockCode(d.qrCode, d.qrMarket);
			const name = d.qrName;

			const _reset = () => {
				setTimeout(() => {
					this._submitting = false;
				}, 1000);
			};
			const _fail = (msg) => {
				wx.showToast({ title: msg, icon: "none" });
				_reset();
			};

			if (!code) {
				_fail("请输入股票代码");
				return;
			}
			if (!validateStockCode(code, d.qrMarket)) {
				_fail("股票代码格式错误");
				return;
			}
			if (!d.qrPrice || parseFloat(d.qrPrice) <= 0) {
				_fail("价格无效，请等待获取或手动输入");
				return;
			}
			if (!d.qrQuantity || parseInt(d.qrQuantity, 10) <= 0) {
				_fail("请输入有效数量");
				return;
			}
			if (d.qrQuantity.includes(".")) {
				_fail("数量必须为正整数");
				return;
			}

			// 新建股票必须已识别名称（从 API 或列表填充）
			if (!Stock.getByCode(code, d.qrMarket) && !name) {
				_fail("股票名称未识别，请从列表选择或等待自动识别");
				return;
			}

			wx.vibrateShort({ type: "medium" });
			let stock = Stock.getByCode(code, d.qrMarket);

			if (d.qrType === "SELL") {
				if (!stock) {
					_fail("暂无可卖持仓");
					return;
				}
				const sellableQuantity = getSellableQuantity(stock.id);
				if (parseInt(d.qrQuantity, 10) > sellableQuantity) {
					_fail("卖出数量超过持仓");
					return;
				}
			}

			if (!stock) {
				stock = Stock.create(code, name, d.qrMarket);
				Stock.save(stock);
			}
			const dateTimeStr = `${d.qrDate}T${d.qrTime || "00:00"}:00`;
			const tx = Transaction.create(
				stock.id,
				d.qrType,
				d.qrPrice,
				d.qrQuantity,
				d.qrFee,
				new Date(dateTimeStr).toISOString(),
			);
			Transaction.save(tx);

			wx.showToast({ title: "添加成功", icon: "success" });
			this.triggerEvent("submit", { stockId: stock.id });
			_reset();
		},

		// ──── 重置 ────
		_resetForm: function () {
			if (this._afTimer) {
				clearTimeout(this._afTimer);
				this._afTimer = null;
			}
			if (this._feeTimer) {
				clearTimeout(this._feeTimer);
				this._feeTimer = null;
			}
			this._afFetching = null;
			this._marketLocked = false;
			this.setData({
				qrType: "BUY",
				qrCode: "",
				qrName: "",
				qrMarket: "A_SHARE",
				qrMarketLabel: "",
				qrPrice: "",
				qrQuantity: "100",
				qrFee: 0,
				qrFeeText: "0.00",
				qrActualText: "0.00",
				qrAmountText: "0.00",
				qrSuggestions: [],
				showQrSuggestions: false,
				qrFetching: false,
				showQrMore: false,
			});
		},
	},
});
