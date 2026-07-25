/**
 * 资产截图分享助手
 * 从 index.js 提取，减少页面文件大小
 *
 * 注意：canvasRenderer.js 已弃用，渲染逻辑内联在此处。
 */
const { toast, hideLoading, loading } = require("../ui/feedback");
const { fmt, fmtDate } = require("../helpers/format");

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
			const dateStr = fmtDate(now);

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
						previewShareImage(fileRes.tempFilePath);
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
 * 预览分享图片（原生查看器，长按可保存/转发）。
 * 不调用 wx.saveImageToPhotosAlbum 等相册写入隐私接口，符合「不采集用户隐私」定位：
 * 保存动作由微信客户端原生长按菜单处理，不经过小程序隐私 API。
 * @param {string} imagePath - 截图临时路径
 */
function previewShareImage(imagePath) {
	wx.previewImage({
		current: imagePath,
		urls: [imagePath],
	});
}

/**
 * 在画布上绘制单资产分享卡片
 * 复刻组合卡视觉：白底、顶部红橙渐变条、资产名/代码/市场、当前价值、资产变动、
 * 持有数量/成本/现价、备注与标签。
 */
function renderAssetCard(ctx, data, width, height) {
	// 背景
	ctx.fillStyle = "#FAFAFC";
	ctx.fillRect(0, 0, width, height);

	// 顶部品牌色条
	const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
	headerGrad.addColorStop(0, "#FF3B30");
	headerGrad.addColorStop(1, "#FF6B61");
	ctx.fillStyle = headerGrad;
	ctx.fillRect(0, 0, width, 150);

	// 资产名 + 代码 / 市场
	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 20px sans-serif";
	ctx.textAlign = "left";
	ctx.fillText(data.name || "", 20, 52);
	ctx.font = "13px sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.78)";
	ctx.fillText(`${data.code || ""}  ·  ${data.marketLabel || ""}`, 20, 78);

	// 日期（右上）
	ctx.font = "12px sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.6)";
	ctx.textAlign = "right";
	ctx.fillText(data.date || "", width - 20, 52);

	// 当前价值
	ctx.fillStyle = "#999999";
	ctx.font = "12px sans-serif";
	ctx.textAlign = "left";
	ctx.fillText("当前价值", 20, 196);
	ctx.fillStyle = "#1C1C1E";
	ctx.font = "bold 32px sans-serif";
	ctx.fillText(`¥${fmt(data.marketValue || 0)}`, 20, 232);

	// 资产变动（右）
	const pnl = data.totalPnL || 0;
	ctx.fillStyle = "#999999";
	ctx.font = "12px sans-serif";
	ctx.textAlign = "right";
	ctx.fillText("资产变动", width - 20, 196);
	ctx.fillStyle = pnl >= 0 ? "#FF3B30" : "#07C160";
	ctx.font = "bold 18px sans-serif";
	ctx.fillText(`${pnl >= 0 ? "+" : ""}${fmt(Math.abs(pnl))}`, width - 20, 232);

	// 分隔线
	ctx.strokeStyle = "#EFEFF3";
	ctx.beginPath();
	ctx.moveTo(20, 262);
	ctx.lineTo(width - 20, 262);
	ctx.stroke();

	// 明细行
	const rows = [
		["持有数量", `${data.quantity || 0} 份`],
		["平均成本", `¥${fmt(data.avgCost || 0)}`],
		["当前价", data.currentPrice != null ? `¥${fmt(data.currentPrice)}` : "--"],
	];
	let y = 302;
	rows.forEach((r) => {
		ctx.fillStyle = "#999999";
		ctx.font = "13px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(r[0], 20, y);
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "bold 15px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText(r[1], width - 20, y);
		y += 42;
	});

	// 备注 / 标签
		let fy = y + 8;
		if (data.tags?.length) {
		ctx.fillStyle = "#FF3B30";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(`#${data.tags.join("  #")}`, 20, fy);
		fy += 30;
	}
	if (data.note) {
		ctx.fillStyle = "#666666";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "left";
		const note = data.note.length > 44 ? `${data.note.slice(0, 44)}…` : data.note;
		ctx.fillText(note, 20, fy);
		fy += 26;
	}

	// 底部品牌
	ctx.fillStyle = "#C7C7CC";
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`茄子笔记本 · ${data.date || ""}`, width / 2, height - 15);
}

/**
 * 生成单资产分享卡片截图
 * @param {Object} page - 页面实例（this）
 */
function shareAsset(page) {
	const stock = page.data.stock;
	const position = page.data.position;
	if (!stock) {
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
			const dateStr = fmtDate(now);

			const marketValue =
				position.currentPrice && position.quantity > 0
					? position.currentPrice * position.quantity
					: 0;
			const totalPnL = (position.realizedPnL || 0) + (position.floatingPnL || 0);

			const cardData = {
				date: dateStr,
				name: stock.name,
				code: stock.code,
				marketLabel: page.data.marketLabel,
				quantity: position.quantity,
				avgCost: position.avgCost,
				currentPrice: position.currentPrice,
				marketValue,
				totalPnL,
				note: stock.note || "",
				tags: stock.tags || [],
			};

			renderAssetCard(ctx, cardData, canvasWidth, canvasHeight);

			const exportCanvas = () => {
				wx.canvasToTempFilePath({
					canvas,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					destWidth: canvas.width,
					destHeight: canvas.height,
					success: (fileRes) => {
						hideLoading();
						page.setData({ generatingShare: false });
						previewShareImage(fileRes.tempFilePath);
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
 * 绘制「完整明细」长图
 * @param {Object} ctx - 2d 上下文
 * @param {Object} data - { date, stats, records }
 * @param {number} width
 * @param {number} layout - 布局常量集合
 */
function renderDetailList(ctx, data, width, layout) {
	const { headerH, summaryH, rowH, footerH, totalH } = layout;
	const records = data.records || [];

	// 背景
	ctx.fillStyle = "#FAFAFC";
	ctx.fillRect(0, 0, width, totalH);

	// 顶部品牌色条
	const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
	headerGrad.addColorStop(0, "#FF3B30");
	headerGrad.addColorStop(1, "#FF6B61");
	ctx.fillStyle = headerGrad;
	ctx.fillRect(0, 0, width, headerH);

	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 19px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("完整明细", width / 2, 40);
	ctx.font = "12px sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.75)";
	ctx.fillText(`导出于 ${data.date || ""}`, width / 2, 62);

	// 摘要条（4 列）
	const stats = data.stats || {};
	const summaryY = headerH;
	ctx.fillStyle = "#FFFFFF";
	ctx.fillRect(0, summaryY, width, summaryH);
	const cols = [
		["总收益", stats.totalPnLText || "0.00"],
		["记录数", String(stats.recordCount != null ? stats.recordCount : records.length)],
		["期末资产", stats.endingAssetText || "0.00"],
		["记录天数", String(stats.recordDays || 0)],
	];
	const colW = width / cols.length;
	cols.forEach((c, i) => {
		const cx = colW * i + colW / 2;
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "bold 15px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(c[1], cx, summaryY + 34);
		ctx.fillStyle = "#999999";
		ctx.font = "11px sans-serif";
		ctx.fillText(c[0], cx, summaryY + 54);
	});

	// 记录列表
	const listStartY = headerH + summaryH;
	records.forEach((r, i) => {
		const top = listStartY + i * rowH;
		// 交替底色
		if (i % 2 === 1) {
			ctx.fillStyle = "#F4F4F7";
			ctx.fillRect(0, top, width, rowH);
		}

		// 类型徽标
		const badge =
			r.type === "DIVIDEND" ? "#FF9500" : r.type === "BUY" ? "#FF3B30" : "#07C160";
		ctx.fillStyle = badge;
		ctx.beginPath();
		ctx.arc(24, top + rowH / 2, 4, 0, Math.PI * 2);
		ctx.fill();

		// 第一行：类型 + 代码 + 名称
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "bold 14px sans-serif";
		ctx.textAlign = "left";
		const title = `${r.typeText || ""} ${r.name || ""}`;
		const clippedTitle = title.length > 16 ? `${title.slice(0, 16)}…` : title;
		ctx.fillText(clippedTitle, 40, top + 26);
		ctx.fillStyle = "#999999";
		ctx.font = "11px sans-serif";
		ctx.fillText(`${r.code || ""}  ${r.dateText || ""}`, 40, top + 46);

		// 右侧：金额（+ 价×量）
		ctx.textAlign = "right";
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "bold 15px sans-serif";
		ctx.fillText(`¥${r.amountText || "0.00"}`, width - 20, top + 26);
		if (r.type !== "DIVIDEND") {
			ctx.fillStyle = "#B0B0B5";
			ctx.font = "11px sans-serif";
			ctx.fillText(`¥${r.priceText || "0.00"} × ${r.quantity || 0}`, width - 20, top + 46);
		}
	});

	// 底部品牌
	ctx.fillStyle = "#C7C7CC";
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	const foot = data.truncated
		? `茄子笔记本 · 仅展示前 ${records.length} 条`
		: `茄子笔记本 · 共 ${records.length} 条`;
	ctx.fillText(foot, width / 2, totalH - footerH / 2 + 4);
}

/**
 * 导出「完整明细」为长图（保存/分享）。
 * 数据来源：page.data.completeTrades（视图模型）+ page.data.stats。
 * @param {Object} page - 页面实例（this），需含 #detailCanvas 节点
 */
function exportDetailImage(page) {
	const all = page.data.completeTrades || [];
	if (all.length === 0) {
		page.setData({ generatingImage: false });
		toast("暂无可导出的记录");
		return;
	}

	loading("生成长图中...");

	const MAX_ROWS = 200;
	const truncated = all.length > MAX_ROWS;
	const records = truncated ? all.slice(0, MAX_ROWS) : all;

	const windowInfo = wx.getWindowInfo();
	const width = windowInfo.screenWidth || 375;
	const headerH = 80;
	const summaryH = 72;
	const rowH = 60;
	const footerH = 40;
	const totalH = headerH + summaryH + records.length * rowH + footerH;
	const layout = { headerH, summaryH, rowH, footerH, totalH };

	const query = wx.createSelectorQuery();
	query
		.select("#detailCanvas")
		.fields({ node: true, size: true })
		.exec((res) => {
			if (!res?.[0]?.node) {
				hideLoading();
				page.setData({ generatingImage: false });
				toast("生成失败");
				return;
			}

			const canvas = res[0].node;
			const ctx = canvas.getContext("2d");
			const dpr = windowInfo.pixelRatio || 2;
			canvas.width = width * dpr;
			canvas.height = totalH * dpr;
			ctx.scale(dpr, dpr);

			renderDetailList(
				ctx,
				{ date: fmtDate(new Date()), stats: page.data.stats, records, truncated },
				width,
				layout,
			);

			const exportCanvas = () => {
				wx.canvasToTempFilePath({
					canvas,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					destWidth: canvas.width,
					destHeight: canvas.height,
					success: (fileRes) => {
						hideLoading();
						page.setData({ generatingImage: false });
						previewShareImage(fileRes.tempFilePath);
					},
					fail: () => {
						hideLoading();
						page.setData({ generatingImage: false });
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

module.exports = {
	sharePortfolio,
	previewShareImage,
	shareAsset,
	exportDetailImage,
};
