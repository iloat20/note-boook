const { previewShareImage } = require("../../utils/render/shareHelper");

Component({
	properties: {
		data: {
			type: Object,
			value: null,
		},
		statusBarHeight: {
			type: Number,
			value: 20,
		},
		navBarHeight: {
			type: Number,
			value: 44,
		},
	},

	data: {
		exporting: false,
	},

	methods: {
		onClose: function () {
			this.triggerEvent("close");
		},

		// 生成报告图片 → 原生预览（长按可保存/转发，不调用相册写入隐私接口）
		onShare: function () {
			if (this.data.exporting) return;
			this.setData({ exporting: true });
			const query = wx.createSelectorQuery().in(this);
			query.select("#arCanvas")
				.fields({ node: true, size: true })
				.exec((res) => {
					if (!res?.[0]?.node) {
						this.setData({ exporting: false });
						wx.showToast({ title: "生成失败", icon: "none" });
						return;
					}
					const canvas = res[0].node;
					const ctx = canvas.getContext("2d");
					let dpr = 2;
					try {
						if (wx.getWindowInfo?.().pixelRatio) {
							dpr = wx.getWindowInfo().pixelRatio;
						} else if (wx.getSystemInfoSync?.().pixelRatio) {
							dpr = wx.getSystemInfoSync().pixelRatio;
						}
					} catch { /* keep dpr=2 */ }
					const W = 750;
					const H = 1600;
					canvas.width = W * dpr;
					canvas.height = H * dpr;
					ctx.scale(dpr, dpr);
					this._drawReport(ctx, W, H);
					wx.canvasToTempFilePath({
						canvas: canvas,
						success: (tmp) => {
							this.setData({ exporting: false });
							previewShareImage(tmp.tempFilePath);
						},
						fail: () => {
							this.setData({ exporting: false });
							wx.showToast({ title: "生成失败", icon: "none" });
						},
					});
				});
		},

	_drawReport: function (ctx, W, H) {
		const d = this.properties.data;
		// 浅色设计系统配色（与屏幕一致）
		const C = {
			bg: "#FAFAFC",       // --xhs-bg
			surface: "#FFFFFF",  // --xhs-surface
			title: "#1C1C1E",    // --xhs-title
			caption: "#999999",  // --xhs-caption
			sub: "#F2F2F7",      // --xhs-bg-secondary
			profit: "#FF0000",   // --xhs-profit
			loss: "#00AA00",     // --xhs-loss
			in: "#007AFF",       // --xhs-secondary
			barIn: "#FF3B30",    // 品牌红（流入条/价值强调，与屏幕一致）
			out: "#E5E5EA",      // --xhs-bg-tertiary
			profitBg: "rgba(255,0,0,0.08)",
			lossBg: "rgba(0,170,0,0.08)",
		};

		ctx.fillStyle = C.bg;
		ctx.fillRect(0, 0, W, H);

		const cardX = 40;
		const cardW = W - 80;
		const cardR = 16;
		let y = 48;
		const newCard = (h) => {
			ctx.fillStyle = C.surface;
			roundRect(ctx, cardX, y, cardW, h, cardR);
			ctx.fill();
			return y;
		};
		const sign = d.netChange >= 0 ? C.profit : C.loss;

		// ── Hero：品牌红橙渐变横幅（年份标题） ──
		const HERO_H = 280;
		const grad = ctx.createLinearGradient(0, 0, W, HERO_H);
		grad.addColorStop(0, "#FF3B30");
		grad.addColorStop(1, "#FF6B61");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, HERO_H);
		ctx.textAlign = "center";
		ctx.fillStyle = "rgba(255,255,255,0.85)";
		ctx.font = "28px sans-serif";
		ctx.fillText(`${d.year} 年度资产复盘`, W / 2, 80);
		ctx.fillStyle = "#FFFFFF";
		ctx.font = "bold 84px sans-serif";
		ctx.fillText(String(d.year), W / 2, 180);

		// ── 年度资产总览：对比条 + 四宫格 ──
		y = HERO_H + 24;
		let cy = newCard(470);
		const tx = cardX + 32;
		let iy2 = cy + 56;
		ctx.textAlign = "left";
		ctx.fillStyle = C.title;
		ctx.font = "bold 30px sans-serif";
		ctx.fillText("年度资产总览", tx, iy2);

		// 流入/流出对比条
		const drawBar = (label, pct, amount, isIn) => {
			iy2 += 44;
			ctx.fillStyle = C.caption;
			ctx.font = "24px sans-serif";
			ctx.fillText(label, tx, iy2);
			const trackX = tx + 56;
			const trackW = cardW - 64 - 56 - 210;
			const trackY = iy2 - 16;
			ctx.fillStyle = C.sub;
			roundRect(ctx, trackX, trackY, trackW, 16, 8);
			ctx.fill();
			const fw = Math.max(0, Math.round((Math.min(100, Math.max(0, pct)) / 100) * trackW));
			if (fw > 0) {
				ctx.fillStyle = isIn ? C.barIn : C.out;
				roundRect(ctx, trackX, trackY, fw, 16, 8);
				ctx.fill();
			}
			ctx.textAlign = "right";
			ctx.fillStyle = isIn ? C.barIn : C.title;
			ctx.font = "bold 24px sans-serif";
			ctx.fillText(`¥${amount}`, cardX + cardW - 32, iy2);
			ctx.textAlign = "left";
		};
		drawBar("流入", d.inflowPct || 0, d.inflowText || "", true);
		drawBar("流出", d.outflowPct || 0, d.outflowText || "", false);
		iy2 += 56;

		// 2×2 四宫格（浅灰内卡，净变化项按语义色高亮）
		const gap = 16;
		const gw = (cardW - 64 - gap) / 2;
		const gh = 110;
		const items = [
			{ label: "年度流入", value: `¥${d.inflowText || ""}`, color: C.title, bg: C.sub },
			{ label: "年度流出", value: `¥${d.outflowText || ""}`, color: C.title, bg: C.sub },
			{ label: "年度净变化", value: `¥${d.netChangeSign || ""}${d.netChangeText || ""}`, color: sign, bg: sign === C.profit ? C.profitBg : C.lossBg },
			{ label: "期末资产", value: `¥${d.endingAssetText || ""}`, color: C.title, bg: C.sub },
		];
		items.forEach((it, i) => {
			const cx = tx + (i % 2) * (gw + gap);
			const ccy = iy2 + Math.floor(i / 2) * (gh + gap);
			ctx.fillStyle = it.bg;
			roundRect(ctx, cx, ccy, gw, gh, 12);
			ctx.fill();
			ctx.textAlign = "left";
			ctx.fillStyle = it.color;
			ctx.font = "bold 30px sans-serif";
			ctx.fillText(it.value, cx + 20, ccy + 50);
			ctx.fillStyle = C.caption;
			ctx.font = "22px sans-serif";
			ctx.fillText(it.label, cx + 20, ccy + 86);
		});

		// ── 资产持有画像 ──
		const p = d.holdingPortrait || {};
		if (p?.longest) {
			y += 470 + 24;
			cy = newCard(230);
			let py = cy + 56;
			ctx.textAlign = "left";
			ctx.fillStyle = C.title;
			ctx.font = "bold 30px sans-serif";
			ctx.fillText("资产持有画像", tx, py);
			py += 36;
			const pitems = [
				{ label: "在册最久", name: (p.longest?.name) || "-", val: (p.longest && (`${p.longest.days}天`)) || "-" },
				{ label: "在册最短", name: (p.shortest?.name) || "-", val: (p.shortest && (`${p.shortest.days}天`)) || "-" },
				{ label: "变动最多", name: (p.mostActive?.name) || "-", val: (p.mostActive && (`${p.mostActive.count}笔`)) || "-" },
			];
			const pw = (cardW - 64 - 24) / 3;
			pitems.forEach((it, i) => {
				const cx = tx + i * (pw + 12);
				ctx.fillStyle = C.sub;
				roundRect(ctx, cx, py, pw, 130, 12);
				ctx.fill();
				ctx.textAlign = "center";
				ctx.fillStyle = C.title;
				ctx.font = "24px sans-serif";
				ctx.fillText(it.name, cx + pw / 2, py + 54);
				ctx.fillStyle = C.barIn;
				ctx.font = "bold 28px sans-serif";
				ctx.fillText(it.val, cx + pw / 2, py + 90);
				ctx.fillStyle = C.caption;
				ctx.font = "20px sans-serif";
				ctx.fillText(it.label, cx + pw / 2, py + 118);
			});
		}

		// ── 页脚 ──
		ctx.fillStyle = C.caption;
		ctx.font = "22px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(`茄子笔记本 · ${d.year} 年度资产复盘`, W / 2, H - 48);
	},
	},
});

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
