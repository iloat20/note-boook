/**
 * CSV 导出工具
 * 生成 .csv 文件（含 UTF-8 BOM，Excel 友好）并分享
 */
const { Stock, Transaction, Dividend } = require("../models/index");
const { fmtDate, fmt } = require("../helpers/format");
const { buildStockMap } = require("../helpers/stockHelpers");

/**
 * 转义 CSV 单元格：含逗号/引号/换行时用双引号包裹，内部引号翻倍。
 * @param {*} value
 * @returns {string}
 */
function escapeCSVCell(value) {
	if (value === null || value === undefined) return "";
	const str = String(value);
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * 拼一行 CSV（数组 → 逗号分隔的转义字符串）
 * @param {Array} cells
 * @returns {string}
 */
function buildRow(cells) {
	return cells.map(escapeCSVCell).join(",");
}

/**
 * 生成全量记录 CSV 文本（交易 + 其他收益合并为一张表），带 UTF-8 BOM。
 * 列：日期,类型,代码,名称,价格,数量,金额,策略,理由,备注
 * @returns {string}
 */
function buildCSV() {
	const stockMap = buildStockMap(Stock.getAll());
	const header = [
		"日期",
		"类型",
		"代码",
		"名称",
		"价格",
		"数量",
		"金额",
		"策略",
		"理由",
		"备注",
	];
	const rows = [buildRow(header)];

	const transactions = [...Transaction.getAll()].sort(
		(a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id,
	);
	transactions.forEach((t) => {
		const stock = stockMap[t.stockId];
		const amount = (t.price || 0) * (t.quantity || 0);
		rows.push(
			buildRow([
				t.date ? fmtDate(new Date(t.date)) : "",
				t.type === "BUY" ? "转入" : "转出",
				stock ? stock.code : "",
				stock ? stock.name : "",
				fmt(t.price || 0),
				t.quantity || 0,
				fmt(amount),
				t.strategies?.length ? t.strategies.join(" ") : "",
				t.reason || "",
				t.note || "",
			]),
		);
	});

	const dividends = [...Dividend.getAll()].sort(
		(a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id,
	);
	dividends.forEach((d) => {
		const stock = stockMap[d.stockId];
		rows.push(
			buildRow([
				d.date ? fmtDate(new Date(d.date)) : "",
				"其他收益",
				stock ? stock.code : "",
				stock ? stock.name : "",
				fmt(d.perShareAmount || 0),
				d.quantity || 0,
				fmt(d.totalAmount || 0),
				"",
				"",
				d.note || "",
			]),
		);
	});

	// UTF-8 BOM 前缀，保证 Excel 正确识别中文
	return `\ufeff${rows.join("\r\n")}`;
}

/**
 * 清理 USER_DATA_PATH 下过期（>24h）的同扩展名文件
 * @param {Object} fsm
 * @param {string} ext - 如 ".csv"
 */
function cleanupOldFiles(fsm, ext) {
	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	try {
		const files = fsm.readdirSync(wx.env.USER_DATA_PATH);
		files.forEach((f) => {
			if (!f.endsWith(ext)) return;
			try {
				const fp = `${wx.env.USER_DATA_PATH}/${f}`;
				const st = fsm.statSync(fp);
				if (st.mtime.getTime() < cutoff) {
					fsm.unlinkSync(fp);
				}
			} catch (_e) {}
		});
	} catch (_e) {}
}

/**
 * 导出 CSV 文件并唤起分享。
 */
function exportCSV() {
	wx.showLoading({ title: "生成文件中..." });

	try {
		const csvContent = buildCSV();
		const fsm = wx.getFileSystemManager();
		cleanupOldFiles(fsm, ".csv");

		const now = new Date();
		const timestamp =
			now.getFullYear() +
			String(now.getMonth() + 1).padStart(2, "0") +
			String(now.getDate()).padStart(2, "0") +
			String(now.getHours()).padStart(2, "0") +
			String(now.getMinutes()).padStart(2, "0") +
			String(now.getSeconds()).padStart(2, "0");
		const fileName = `资产记录_${timestamp}.csv`;
		const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

		fsm.writeFileSync(filePath, csvContent, "utf8");
		wx.hideLoading();

		wx.shareFileMessage({
			filePath: filePath,
			fileName: fileName,
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
		console.error("[exportCSV]", e);
	}
}

module.exports = {
	buildCSV,
	exportCSV,
	escapeCSVCell,
};
