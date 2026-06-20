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
		detached() {
			if (this._afTimer) clearTimeout(this._afTimer);
			if (this._feeTimer) clearTimeout(this._feeTimer);
			if (this._blurTimer) clearTimeout(this._blurTimer);
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

		// ──── 代码输入 + 自动获取 ────
		onQrCodeInput: function (e) {
			const value = (e.detail.value || "").trim();
			const market = this._detectMarket(value);

			// [优化] 合并 setData：一次调用完成所有更新
			const updates = {
				qrCode: value,
				qrMarket: market,
				qrMarketLabel: getMarketLabel(market),
				qrName: "",
				qrPrice: "",
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
			this._scheduleAutoFetch(value);
		},

		onQrCodeBlur: function () {
			this._blurTimer = setTimeout(() => {
				this.setData({ showQrSuggestions: false });
			}, 200);
			// 失焦时立即尝试获取
			this._tryAutoFetch(this.data.qrCode);
		},

		onQrSelectSuggestion: function (e) {
			const item = e.currentTarget.dataset.item;
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
			if (!code || !validateStockCode(code, this.data.qrMarket)) return;
			if (this._afFetching === code) return;
			this._afFetching = code;
			this.setData({ qrFetching: true });

			fetchStockPrice(this.data.qrMarket, code)
				.then((data) => {
					if (data?.name && this.data.qrCode === code) {
						const localResults = searchStocks(code, this.data.qrMarket, 1);
						const localName = localResults.length > 0 ? localResults[0].name : null;
						const finalName = localName || data.name;
						const updates = { qrName: finalName, qrFetching: false };
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
			const qty = parseInt(e.currentTarget.dataset.qty, 10) || 0;
			if (qty === 0) {
				// 全仓：TODO 后续可接持仓数据
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
			if (/^\d{6}$/.test(code)) return MARKETS.A_SHARE;
			if (/^\d{1,5}$/.test(code)) return MARKETS.HK_SHARE;
			if (/^[A-Za-z]{1,5}$/.test(code)) return MARKETS.US_SHARE;
			return "A_SHARE";
		},

		// ──── 提交 ────
		submitQuickRecord: function () {
			const d = this.data;
			const code = formatStockCode(d.qrCode, d.qrMarket);
			const name = d.qrName;

			if (!code) {
				wx.showToast({ title: "请输入股票代码", icon: "none" });
				return;
			}
			if (!name) {
				wx.showToast({ title: "请从列表中选择或等待自动识别", icon: "none" });
				return;
			}
			if (!d.qrPrice || parseFloat(d.qrPrice) <= 0) {
				wx.showToast({ title: "请输入有效价格", icon: "none" });
				return;
			}
			if (!d.qrQuantity || parseInt(d.qrQuantity, 10) <= 0) {
				wx.showToast({ title: "请输入有效数量", icon: "none" });
				return;
			}

			wx.vibrateShort({ type: "medium" });
			let stock = Stock.getByCode(code, d.qrMarket);

			if (d.qrType === "SELL") {
				if (!stock) {
					wx.showToast({ title: "暂无可卖持仓", icon: "none" });
					return;
				}
				const sellableQuantity = getSellableQuantity(stock.id);
				if (parseInt(d.qrQuantity, 10) > sellableQuantity) {
					wx.showToast({ title: "卖出数量超过持仓", icon: "none" });
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
