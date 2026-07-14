/**
 * 资产截图分享助手
 * 从 index.js 提取，减少页面文件大小
 *
 * 注意：canvasRenderer.js 已弃用，渲染逻辑内联在此处。
 */
const { toast, success, hideLoading, loading } = require("../ui/feedback");
const { fmt } = require("../helpers/format");

/**
 * 在画布上绘制资产卡片
 * 原为 utils/render/canvasRenderer.js 中的 renderPortfolioCard，现内联以消除外部依赖。
 * 视觉样式：白底、顶部红橙渐变条、总值/收益、最多 5 行资产。
 */
function renderPortfolioCard(ctx, data, width, height) {
	const rc =
		typeof ctx.roundRect === "function" ? (x, y, w, h, r) => ctx.roundRect(x, y, w, h, r) : null;

	// 背景
	ctx.fillStyle = "#FAFAFC";
	ctx.fillRect(0, 0, width, height);

	// 顶部品牌色条
	const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
	headerGrad.addColorStop(0, "#FF3B30");
	headerGrad.addColorStop(1, "#FF6B61");
	ctx.fillStyle = headerGrad;
	ctx.fillRect(0, 0, width, 180);

	// 标题
	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 18px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("我的资产", width / 2, 45);

	// 日期
	ctx.font = "12px sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.7)";
	ctx.fillText(data.date || "", width / 2, 65);

	// 总值
	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 30px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`¥${data.totalMarketValueText || "0.00"}`, width / 2, 115);

	// 总收益
	const pnlColor = data.totalPnL >= 0 ? "#FFFFFF" : "rgba(255,255,255,0.8)";
	ctx.fillStyle = pnlColor;
	ctx.font = "14px sans-serif";
	const pnlText = (data.totalPnL >= 0 ? "+" : "") + (data.totalPnLText || "0.00");
	const percentText = `${(data.totalPnLPercent >= 0 ? "+" : "") + (data.totalPnLPercent || "0")}%`;
	ctx.fillText(`${pnlText} (${percentText})`, width / 2, 145);

	// 资产数量
	ctx.fillStyle = "#999999";
	ctx.font = "12px sans-serif";
	ctx.textAlign = "left";
	ctx.fillText(`持有 ${data.positionCount} 项`, 20, 210);

	// 资产列表（最多 5 项）
	const positions = data.positions || [];
	const startY = 230;
	positions.forEach((p, i) => {
		const y = startY + i * 55;
		ctx.fillStyle = "#FFFFFF";
		ctx.beginPath();
		if (rc) rc(16, y - 5, width - 32, 48, [8]);
		else ctx.rect(16, y - 5, width - 32, 48);
		ctx.fill();

		const tagColor = "#C7C7CC";
		ctx.fillStyle = tagColor;
		ctx.beginPath();
		ctx.arc(32, y + 18, 4, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = "#1C1C1E";
		ctx.font = "14px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(p.name || "", 44, y + 15);
		ctx.fillStyle = "#999999";
		ctx.font = "11px sans-serif";
		ctx.fillText(p.code || "", 44, y + 32);
		const pnl = p.floatingPnL || 0;
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "bold 15px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText((pnl >= 0 ? "+" : "") + fmt(pnl), width - 24, y + 22);
	});

	// 底部品牌
	ctx.fillStyle = "#C7C7CC";
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`茄子笔记本 · ${data.date || ""}`, width / 2, height - 15);
}

/**
 * 生成持仓分享卡片截图
 * @param {Object} page - 页面实例（this）
 */
function sharePortfolio(page) {
	const positions = page._positionsCache || page.data.positions;
	if (!positions || positions.length === 0) {
		page.setData({ generatingShare: false });
		toast("暂无资产数据");
		return;
	}

	loading("生成截图中...");

	const windowInfo = wx.getWindowInfo();
	const canvasWidth = windowInfo.screenWidth || 375;
	const canvasHeight = windowInfo.screenHeight || 667;

	const query = wx.createSelectorQuery();
	query
		.select("#shareCanvas")
		.fields({ node: true, size: true })
		.exec((res) => {
			if (!res?.[0]?.node) {
				hideLoading();
				page.setData({ generatingShare: false });
				toast("生成失败");
				return;
			}

			const canvas = res[0].node;
			const ctx = canvas.getContext("2d");
			const dpr = windowInfo.pixelRatio || 2;
			canvas.width = canvasWidth * dpr;
			canvas.height = canvasHeight * dpr;
			ctx.scale(dpr, dpr);

			const now = new Date();
			const dateStr =
				now.getFullYear() +
				"-" +
				String(now.getMonth() + 1).padStart(2, "0") +
				"-" +
				String(now.getDate()).padStart(2, "0");

			const cardData = {
				date: dateStr,
				totalMarketValue: page.data.totalMarketValue,
				totalMarketValueText: fmt(page.data.totalMarketValue || 0),
				totalPnL: page.data.totalPnL,
				totalPnLText: fmt(page.data.totalPnL || 0),
				totalPnLPercent: page.data.totalPnLPercent,
				positionCount: positions.length,
				positions: positions.slice(0, 5).map((p) => ({
					market: p.market,
					name: p.name,
					code: p.code,
					floatingPnL: p.floatingPnL,
				})),
			};

			renderPortfolioCard(ctx, cardData, canvasWidth, canvasHeight);

			const exportCanvas = () => {
				// type="2d" 画布必须用 canvas 节点（而非 canvasId），尺寸取 backing store
				wx.canvasToTempFilePath({
					canvas: canvas,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					destWidth: canvas.width,
					destHeight: canvas.height,
					success: (fileRes) => {
						hideLoading();
						page.setData({ generatingShare: false });
						showShareActions(fileRes.tempFilePath);
					},
					fail: () => {
						hideLoading();
						page.setData({ generatingShare: false });
						toast("生成失败");
					},
				});
			};

			if (typeof canvas.requestAnimationFrame === "function") {
				canvas.requestAnimationFrame(exportCanvas);
			} else {
				setTimeout(exportCanvas, 200);
			}
		});
}

/**
 * 显示分享操作面板
 * @param {string} imagePath - 截图临时路径
 */
function showShareActions(imagePath) {
	wx.showActionSheet({
		itemList: ["保存到相册", "转发给朋友"],
		success: (res) => {
			if (res.tapIndex === 0) {
				wx.authorize({
					scope: "scope.writePhotosAlbum",
					success: () => {
						wx.saveImageToPhotosAlbum({
							filePath: imagePath,
							success: () => {
								success("已保存到相册");
							},
							fail: () => {
								toast("保存失败");
							},
						});
					},
					fail: () => {
						wx.showModal({
							title: "需要权限",
							content: "请在设置中允许保存到相册",
							confirmText: "去设置",
							success: (modalRes) => {
								if (modalRes.confirm) wx.openSetting();
							},
						});
					},
				});
			} else if (res.tapIndex === 1) {
				if (typeof wx.shareImageMessage === "function") {
					wx.shareImageMessage({
						imageUrl: imagePath,
						success: () => {
							success("分享成功");
						},
						fail: () => {
							wx.saveImageToPhotosAlbum({
								filePath: imagePath,
								success: () => {
									toast("已保存到相册，请手动分享");
								},
							});
						},
					});
				} else {
					wx.saveImageToPhotosAlbum({
						filePath: imagePath,
						success: () => {
							toast("已保存到相册，请手动分享");
						},
						fail: () => {
							toast("保存失败");
						},
					});
				}
			}
		},
	});
}

module.exports = {
	sharePortfolio,
	showShareActions,
};
