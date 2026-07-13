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

		onExportImage: function () {
			if (this.data.exporting) return;
			this.setData({ exporting: true });
			const that = this;
			const query = wx.createSelectorQuery().in(this);
			query.select("#arCanvas")
				.fields({ node: true, size: true })
				.exec(function (res) {
					if (!res || !res[0] || !res[0].node) {
						that.setData({ exporting: false });
						wx.showToast({ title: "导出失败", icon: "none" });
						return;
					}
					const canvas = res[0].node;
					const ctx = canvas.getContext("2d");
					let dpr = 2;
					try {
						if (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) {
							dpr = wx.getWindowInfo().pixelRatio;
						} else if (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) {
							dpr = wx.getSystemInfoSync().pixelRatio;
						}
					} catch (e) { /* keep dpr=2 */ }
					const W = 750;
					const H = 1600;
					canvas.width = W * dpr;
					canvas.height = H * dpr;
					ctx.scale(dpr, dpr);
					that._drawReport(ctx, W, H);
					wx.canvasToTempFilePath({
						canvas: canvas,
						success: function (tmp) {
							that._saveToAlbum(tmp.tempFilePath);
						},
						fail: function () {
							that.setData({ exporting: false });
							wx.showToast({ title: "生成失败", icon: "none" });
						},
					});
				});
		},

		_saveToAlbum: function (filePath) {
			const that = this;
			wx.saveImageToPhotosAlbum({
				filePath: filePath,
				success: function () {
					that.setData({ exporting: false });
					wx.showToast({ title: "已保存到相册", icon: "success" });
				},
				fail: function (err) {
					that.setData({ exporting: false });
					if (err && err.errMsg && err.errMsg.indexOf("auth deny") >= 0) {
						wx.showModal({
							title: "需要相册权限",
							content: "请在设置中允许保存到相册",
							confirmText: "去设置",
							success: function (m) {
								if (m.confirm) wx.openSetting();
							},
						});
					} else {
						wx.showToast({ title: "保存失败", icon: "none" });
					}
				},
			});
		},

		_drawReport: function (ctx, W, H) {
			const d = this.properties.data;
			ctx.fillStyle = "#F5F5F7";
			ctx.fillRect(0, 0, W, H);
			let y = 90;
			ctx.textAlign = "center";
			ctx.fillStyle = "#1C1C1E";
			ctx.font = "28px sans-serif";
			ctx.fillText(String(d.year), W / 2, y);
			y += 48;
			ctx.font = "40px sans-serif";
			ctx.fillText("年度资产复盘", W / 2, y);
			y += 76;
			ctx.font = "bold 64px sans-serif";
			ctx.fillText((d.netChangeSign || "") + (d.netChangeText || ""), W / 2, y);
			y += 52;
			ctx.font = "26px sans-serif";
			ctx.fillStyle = "#999999";
			ctx.fillText(d.conclusion || "", W / 2, y);

			y += 90;
			const items = [
				{ label: "年度流入", value: "¥" + (d.inflowText || "") },
				{ label: "年度流出", value: "¥" + (d.outflowText || "") },
				{ label: "年度净变化", value: "¥" + (d.netChangeText || "") },
				{ label: "期末资产", value: "¥" + (d.endingAssetText || "") },
			];
			const gx = 40;
			const gap = 16;
			const gw = (W - 80 - gap) / 2;
			const gh = 140;
			items.forEach(function (it, i) {
				const cx = gx + (i % 2) * (gw + gap);
				const cy = y + Math.floor(i / 2) * (gh + gap);
				ctx.fillStyle = "#FFFFFF";
				roundRect(ctx, cx, cy, gw, gh, 16);
				ctx.fill();
				ctx.textAlign = "left";
				ctx.fillStyle = "#1C1C1E";
				ctx.font = "34px sans-serif";
				ctx.fillText(it.value, cx + 24, cy + 72);
				ctx.fillStyle = "#999999";
				ctx.font = "24px sans-serif";
				ctx.fillText(it.label, cx + 24, cy + 112);
			});

			y += 2 * (gh + gap) + 48;
			const p = d.holdingPortrait || {};
			const pitems = [
				{ label: "在册最久", name: p.longest && p.longest.name, val: p.longest && (p.longest.days + "天") },
				{ label: "在册最短", name: p.shortest && p.shortest.name, val: p.shortest && (p.shortest.days + "天") },
				{ label: "变动最多", name: p.mostActive && p.mostActive.name, val: p.mostActive && (p.mostActive.count + "笔") },
			];
			const pw = (W - 80 - 24) / 3;
			const pG = 12;
			pitems.forEach(function (it, i) {
				const cx = gx + i * (pw + pG);
				ctx.fillStyle = "#FFFFFF";
				roundRect(ctx, cx, y, pw, 160, 16);
				ctx.fill();
				ctx.textAlign = "center";
				ctx.fillStyle = "#1C1C1E";
				ctx.font = "26px sans-serif";
				ctx.fillText(it.name || "-", cx + pw / 2, y + 64);
				ctx.fillStyle = "#FF3B30";
				ctx.font = "bold 30px sans-serif";
				ctx.fillText(it.val || "-", cx + pw / 2, y + 104);
				ctx.fillStyle = "#999999";
				ctx.font = "22px sans-serif";
				ctx.fillText(it.label, cx + pw / 2, y + 144);
			});

			ctx.fillStyle = "#999999";
			ctx.font = "22px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("茄子笔记本 · " + d.year + " 年度资产复盘", W / 2, H - 60);
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
