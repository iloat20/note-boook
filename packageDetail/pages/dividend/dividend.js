const { Stock, Dividend } = require("../../../utils/models/index");
const { fmt } = require("../../../utils/helpers/format");
const { toast, success } = require("../../../utils/ui/feedback");
const pageMixin = require("../../../utils/ui/pageMixin");

Page({
	data: {
		...pageMixin.initPageData(),
		stockOptions: [],
		stockIdx: 0,
		stockText: "请选择股票",
		divType: "CASH", // CASH | SHARE
		perShare: "",
		qty: "",
		shareQty: "",
		date: "",
		note: "",
		perShareText: "0.00",
		totalText: "0.00",
		isEdit: false,
		editId: null,
	},

	onLoad(o) {
		pageMixin.onLoadMixin(this);

		const n = new Date();
		this.setData({
			date: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`,
		});
		this._loadStocks();
		if (o?.id) {
			this._isEdit = true;
			this._editId = parseInt(o.id, 10);
			this._loadEdit(parseInt(o.id, 10));
		} else if (o?.stockId) {
			const idx = this.data.stockOptions.findIndex(
				(opt) => opt.stock && opt.stock.id === parseInt(o.stockId, 10),
			);
			if (idx >= 0)
				this.setData({
					stockIdx: idx,
					stockText: this.data.stockOptions[idx].label,
				});
		}
		this._preview();
	},

	_loadStocks() {
		const ss = Stock.getAll();
		this.setData({
			stockOptions: ss.map((s) => ({ label: `${s.code} ${s.name}`, stock: s })),
		});
	},

	_loadEdit(id) {
		const ds = Dividend.getAll();
		const d = ds.find((x) => x.id === id);
		if (!d) {
			toast("分红记录不存在");
			wx.navigateBack();
			return;
		}
		const s = Stock.getById(d.stockId);
		const dt = new Date(d.date);
		const idx = this.data.stockOptions.findIndex((o) => o.stock && o.stock.id === d.stockId);
		if (idx === -1) {
			// 原始股票已被删除，需要用户重新选择
			this._stockMissing = true;
			toast("原始股票已删除，请重新选择");
		}
		this.setData({
			isEdit: true,
			stockIdx: idx >= 0 ? idx : -1,
			stockText: s ? `${s.code} ${s.name}` : "请选择股票",
			divType: d.type || "CASH",
			perShare: String(d.perShareAmount || 0),
			qty: String(d.quantity),
			shareQty: String(d.shareQuantity || 0),
			date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
			note: d.note || "",
		});
		this._preview();
	},

	selectDivType(e) {
		const type = e.currentTarget.dataset.type;
		const updates = { divType: type };
		if (type === "CASH") {
			updates.shareQty = "0";
		} else {
			updates.perShare = "";
		}
		this.setData(updates);
		this._preview();
	},

	selStock(e) {
		const i = parseInt(e.detail.value, 10);
		const s = this.data.stockOptions[i]?.stock;
		this._stockMissing = false;
		this.setData({
			stockIdx: i,
			stockText: s ? `${s.code} ${s.name}` : "请选择股票",
		});
	},
	onPS(e) {
		this.setData({ perShare: e.detail.value });
		this._preview();
	},
	onQty(e) {
		this.setData({ qty: e.detail.value });
		this._preview();
	},
	onShareQty(e) {
		this.setData({ shareQty: e.detail.value });
		this._preview();
	},
	onDate(e) {
		this.setData({ date: e.detail.value });
	},
	onNote(e) {
		this.setData({ note: e.detail.value });
	},

	_preview() {
		const type = this.data.divType;
		if (type === "SHARE") {
			const sq = parseInt(this.data.shareQty, 10) || 0;
			const _q = parseInt(this.data.qty, 10) || 0;
			this.setData({
				perShareText: fmt(0),
				totalText: sq > 0 ? `${sq}股` : "0股",
			});
		} else {
			const ps = parseFloat(this.data.perShare) || 0;
			const q = parseInt(this.data.qty, 10) || 0;
			const total = ps * q;
			this.setData({ perShareText: fmt(ps), totalText: fmt(total) });
		}
	},

	goBack() {
		wx.navigateBack();
	},

	submit() {
		if (this._submitting) return;
		this._submitting = true;
		const op = this.data.stockOptions[this.data.stockIdx];
		const s = op?.stock;
		if (!s) {
			toast("请选择股票");
			this._submitting = false;
			return;
		}
		const { divType, perShare: ps, qty: q, shareQty: sq, date: d, note: nt } = this.data;
		if (!d) {
			toast("请选择日期");
			this._submitting = false;
			return;
		}

		if (divType === "SHARE") {
			if (!sq || parseInt(sq, 10) <= 0) {
				toast("请输入有效送股数量");
				this._submitting = false;
				return;
			}
			if (!q || parseInt(q, 10) <= 0) {
				toast("请输入有效持股数量");
				this._submitting = false;
				return;
			}
			// SHARE 类型：perShareAmount=0, type='SHARE', shareQuantity=送股数
			const dv = Dividend.create(
				s.id,
				0,
				q,
				new Date(`${d}T00:00:00`).toISOString(),
				nt,
				"SHARE",
				sq,
			);
			if (this._isEdit) dv.id = this._editId;
			Dividend.save(dv);
		} else {
			if (!ps || parseFloat(ps) <= 0) {
				toast("请输入有效分红金额");
				this._submitting = false;
				return;
			}
			if (!q || parseInt(q, 10) <= 0) {
				toast("请输入有效数量");
				this._submitting = false;
				return;
			}
			const dv = Dividend.create(s.id, ps, q, new Date(`${d}T00:00:00`).toISOString(), nt);
			if (this._isEdit) dv.id = this._editId;
			Dividend.save(dv);
		}

		success(this._isEdit ? "已修改" : "已添加");
		this._navTimer = setTimeout(() => wx.navigateBack(), 800);
		this._subTimer = setTimeout(() => {
			this._submitting = false;
		}, 1000);
	},

	onShow() {
		if (pageMixin.onShowSubPackage()) {
			this._refreshAuxData();
		}
	},

	_refreshAuxData() {
		this._loadStocks();
	},

	onUnload() {
		if (this._navTimer) clearTimeout(this._navTimer);
		if (this._subTimer) clearTimeout(this._subTimer);
	},
});
