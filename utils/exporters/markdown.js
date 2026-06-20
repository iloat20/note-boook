/**
 * Markdown 导出工具
 * 生成 .md 文件并分享
 */
const { Stock, Transaction, Dividend } = require("../models/index");
const { fmtDate, fmtTime, fmt } = require("../helpers/format");
const { buildStockMap } = require("../helpers/stockHelpers");
const { getMarketLabel } = require("../constants/market");

function buildMarkdown() {
	const stocks = Stock.getAll();
	const stockMap = buildStockMap(stocks);

	const lines = [];
	lines.push("# 茄子笔记本明细");
	lines.push("");
	lines.push(`> 导出时间：${fmtDate(new Date())} ${fmtTime(new Date())}`);
	lines.push("");

	// —— 交易记录 ——
	const transactions = Transaction.getAll();
	transactions.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);

	lines.push(`## 交易记录（${transactions.length} 笔）`);
	lines.push("");
	if (transactions.length > 0) {
		lines.push(
			"| 日期 | 类型 | 代码 | 名称 | 市场 | 价格 | 数量 | 手续费 | 金额 | 策略 | 理由 | 备注 |",
		);
		lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
		transactions.forEach((t) => {
			const stock = stockMap[t.stockId];
			const code = stock ? stock.code : "-";
			const name = stock ? stock.name : "-";
			const market = stock ? getMarketLabel(stock.market) : "-";
			const typeStr = t.type === "BUY" ? "买入" : "卖出";
			const amount = (t.price || 0) * (t.quantity || 0);
			const dateStr = t.date ? fmtDate(new Date(t.date)) : "-";
			const strategies = t.strategies?.length ? t.strategies.join(", ") : "-";
			const reason = (t.reason || "").replace(/\|/g, "\\|") || "-";
			const note = (t.note || "").replace(/\|/g, "\\|") || "-";
			lines.push(
				"| " +
					dateStr +
					" | " +
					typeStr +
					" | " +
					code +
					" | " +
					name +
					" | " +
					market +
					" | " +
					fmt(t.price || 0) +
					" | " +
					(t.quantity || 0) +
					" | " +
					fmt(t.fee || 0) +
					" | " +
					fmt(amount) +
					" | " +
					strategies +
					" | " +
					reason +
					" | " +
					note +
					" |",
			);
		});
	} else {
		lines.push("暂无交易记录");
	}

	// —— 分红记录 ——
	const dividends = Dividend.getAll();
	dividends.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);

	lines.push("");
	lines.push(`## 分红记录（${dividends.length} 笔）`);
	lines.push("");
	if (dividends.length > 0) {
		lines.push("| 日期 | 代码 | 名称 | 市场 | 每股金额 | 数量 | 总金额 | 备注 |");
		lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
		dividends.forEach((d) => {
			const stock = stockMap[d.stockId];
			const code = stock ? stock.code : "-";
			const name = stock ? stock.name : "-";
			const market = stock ? getMarketLabel(stock.market) : "-";
			const dateStr = d.date ? fmtDate(new Date(d.date)) : "-";
			const note = (d.note || "").replace(/\|/g, "\\|");
			lines.push(
				"| " +
					dateStr +
					" | " +
					code +
					" | " +
					name +
					" | " +
					market +
					" | " +
					fmt(d.perShareAmount || 0) +
					" | " +
					(d.quantity || 0) +
					" | " +
					fmt(d.totalAmount || 0) +
					" | " +
					note +
					" |",
			);
		});
	} else {
		lines.push("暂无分红记录");
	}

	lines.push("");
	lines.push("---");
	lines.push("*由茄子笔记本小程序自动生成*");

	return lines.join("\n");
}

function exportMD() {
	wx.showLoading({ title: "生成文件中..." });

	try {
		const mdContent = buildMarkdown();
		const fsm = wx.getFileSystemManager();
		const now = new Date();
		const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
		try {
			const files = fsm.readdirSync(wx.env.USER_DATA_PATH);
			files.forEach((f) => {
				if (!f.endsWith(".md")) return;
				try {
					const fp = `${wx.env.USER_DATA_PATH}/${f}`;
					const st = fsm.statSync(fp);
					if (st.mtime.getTime() < cutoff) {
						fsm.unlinkSync(fp);
					}
				} catch (_e) {}
			});
		} catch (_e) {}
		const timestamp =
			now.getFullYear() +
			"" +
			String(now.getMonth() + 1).padStart(2, "0") +
			String(now.getDate()).padStart(2, "0") +
			String(now.getHours()).padStart(2, "0") +
			String(now.getMinutes()).padStart(2, "0") +
			String(now.getSeconds()).padStart(2, "0");
		const filePath = `${wx.env.USER_DATA_PATH}/交易记录_${timestamp}.md`;

		fsm.writeFileSync(filePath, mdContent, "utf8");

		wx.hideLoading();

		wx.shareFileMessage({
			filePath: filePath,
			fileName: `交易记录_${timestamp}.md`,
			success: () => {
				wx.showToast({ title: "导出成功", icon: "success" });
			},
			fail: () => {
				wx.showModal({
					title: "导出提示",
					content: '文件已生成，但无法分享。可前往"文件管理"查看。',
					showCancel: false,
				});
			},
		});
	} catch (e) {
		wx.hideLoading();
		wx.showToast({ title: `导出失败: ${e.message || ""}`, icon: "none" });
		console.error("[exportMD]", e);
	}
}

module.exports = {
	exportMD: exportMD,
};
