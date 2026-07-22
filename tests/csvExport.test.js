// 单元测试：CSV 导出（转义 / BOM / 列结构 / 交易与其他收益合并）
jest.mock("../utils/models/index", () => ({
	Stock: {
		getAll: () => [
			{ id: "s1", code: "600000", name: "资产甲", market: "A_SHARE" },
			{ id: "s2", code: "00700", name: '含"逗号,与引号', market: "HK" },
		],
	},
	Transaction: {
		getAll: () => [
			{
				id: 1,
				stockId: "s1",
				type: "BUY",
				price: 10.5,
				quantity: 100,
				date: "2025-03-01",
				strategies: ["定投", "低估"],
				reason: "看好",
				note: "首次建仓",
			},
			{
				id: 2,
				stockId: "s2",
				type: "SELL",
				price: 20,
				quantity: 50,
				date: "2025-06-01",
				strategies: [],
				reason: "",
				note: "换行\n备注",
			},
		],
	},
	Dividend: {
		getAll: () => [
			{
				id: 3,
				stockId: "s1",
				perShareAmount: 0.5,
				quantity: 100,
				totalAmount: 50,
				date: "2025-09-01",
				note: "",
			},
		],
	},
}));

jest.mock("../utils/helpers/format", () => ({
	fmtDate: (d) => {
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, "0");
		const day = String(d.getUTCDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	},
	fmt: (n) => (n == null ? "0.00" : Number(n).toFixed(2)),
}));

jest.mock("../utils/helpers/stockHelpers", () => ({
	buildStockMap: (stocks) => {
		const map = {};
		stocks.forEach((s) => {
			map[s.id] = { code: s.code, name: s.name, market: s.market };
		});
		return map;
	},
}));

const { buildCSV, escapeCSVCell } = require("../utils/exporters/csv");

describe("escapeCSVCell", () => {
	test("null / undefined → 空字符串", () => {
		expect(escapeCSVCell(null)).toBe("");
		expect(escapeCSVCell(undefined)).toBe("");
	});

	test("普通值不加引号", () => {
		expect(escapeCSVCell("abc")).toBe("abc");
		expect(escapeCSVCell(123)).toBe("123");
	});

	test("含逗号 / 引号 / 换行 → 用双引号包裹且内部引号翻倍", () => {
		expect(escapeCSVCell("a,b")).toBe('"a,b"');
		expect(escapeCSVCell('he said "hi"')).toBe('"he said ""hi"""');
		expect(escapeCSVCell("line1\nline2")).toBe('"line1\nline2"');
	});
});

describe("buildCSV", () => {
	const csv = buildCSV();
	const lines = csv.split("\r\n");

	test("以 UTF-8 BOM 开头", () => {
		expect(csv.charCodeAt(0)).toBe(0xfeff);
	});

	test("表头列结构正确", () => {
		const header = lines[0].replace(/^\ufeff/, "");
		expect(header).toBe("日期,类型,代码,名称,价格,数量,金额,策略,理由,备注");
	});

	test("交易 + 其他收益合并为一张表（表头 + 3 行数据）", () => {
		expect(lines.length).toBe(4);
	});

	test("BUY → 转入，含策略拼接", () => {
		const row = lines.find((l) => l.includes("600000") && l.includes("转入"));
		expect(row).toBeTruthy();
		expect(row).toContain("定投 低估");
		expect(row).toContain("2025-03-01");
	});

	test("SELL → 转出", () => {
		const row = lines.find((l) => l.includes("转出"));
		expect(row).toBeTruthy();
	});

	test("分红 → 其他收益", () => {
		const row = lines.find((l) => l.includes("其他收益"));
		expect(row).toBeTruthy();
		expect(row).toContain("50.00");
	});

	test("含特殊字符的名称与备注被正确转义", () => {
		// 名称含引号与逗号
		expect(csv).toContain('"含""逗号,与引号"');
		// 备注含换行
		expect(csv).toContain('"换行\n备注"');
	});
});
