/**
 * Canvas 渲染：持仓卡片截图
 */

const { fmt } = require("../helpers/format");

function renderPortfolioCard(ctx, _canvas, data, width, height) {
	const _dpr = data.dpr || 2;

	// ====== 背景（白底，匹配 app 风格） ======
	ctx.fillStyle = "#FAFAFC";
	ctx.fillRect(0, 0, width, height);

	// ====== 顶部品牌色条 ======
	const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
	headerGrad.addColorStop(0, "#FF3B30");
	headerGrad.addColorStop(1, "#FF6B61");
	ctx.fillStyle = headerGrad;
	ctx.fillRect(0, 0, width, 180);

	// ====== 标题 ======
	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 18px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("我的持仓", width / 2, 45);

	// ====== 日期 ======
	ctx.font = "12px sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.7)";
	ctx.fillText(data.date || "", width / 2, 65);

	// ====== 总市值 ======
	ctx.fillStyle = "#FFFFFF";
	ctx.font = "bold 30px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`¥${data.totalMarketValueText || "0.00"}`, width / 2, 115);

	// ====== 总盈亏 ======
	const pnlColor = data.totalPnL >= 0 ? "#FFFFFF" : "rgba(255,255,255,0.8)";
	ctx.fillStyle = pnlColor;
	ctx.font = "14px sans-serif";
	const pnlText = (data.totalPnL >= 0 ? "+" : "") + (data.totalPnLText || "0.00");
	const percentText = `${(data.totalPnLPercent >= 0 ? "+" : "") + (data.totalPnLPercent || "0")}%`;
	ctx.fillText(`${pnlText} (${percentText})`, width / 2, 145);

	// ====== 持仓数量 ======
	ctx.fillStyle = "#999999";
	ctx.font = "12px sans-serif";
	ctx.textAlign = "left";
	ctx.fillText(`持仓 ${data.positionCount} 只`, 20, 210);

	// ====== 持仓列表（最多 5 只）=====
	const positions = data.positions || [];
	const startY = 230;

	positions.forEach((p, i) => {
		const y = startY + i * 55;

		// 卡片背景
		ctx.fillStyle = "#FFFFFF";
		ctx.beginPath();
		ctx.roundRect(16, y - 5, width - 32, 48, [8]);
		ctx.fill();

		// 市场标签圆点
		const tagColor =
			p.market === "A_SHARE" ? "#007AFF" : p.market === "HK_SHARE" ? "#FF9500" : "#AF52DE";
		ctx.fillStyle = tagColor;
		ctx.beginPath();
		ctx.arc(32, y + 18, 4, 0, Math.PI * 2);
		ctx.fill();

		// 股票名称
		ctx.fillStyle = "#1C1C1E";
		ctx.font = "14px sans-serif";
		ctx.textAlign = "left";
		ctx.fillText(p.name || "", 44, y + 15);

		// 代码
		ctx.fillStyle = "#999999";
		ctx.font = "11px sans-serif";
		ctx.fillText(p.code || "", 44, y + 32);

		// 盈亏
		const pnl = p.floatingPnL || 0;
		ctx.fillStyle = pnl >= 0 ? "#FF6B6B" : "#34C759";
		ctx.font = "bold 15px sans-serif";
		ctx.textAlign = "right";
		ctx.fillText((pnl >= 0 ? "+" : "") + fmt(pnl), width - 24, y + 22);
	});

	// ====== 底部 ======
	ctx.fillStyle = "#C7C7CC";
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`茄子笔记本 · ${data.date || ""}`, width / 2, height - 15);
}

module.exports = { renderPortfolioCard };
