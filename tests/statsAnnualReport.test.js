// 捕获 Page 配置（stats.js 在模块加载时调用 Page({...})）
let pageInstance = null;
global.Page = (cfg) => { pageInstance = cfg; };

jest.mock("../utils/models/index", () => ({
	Stock: { getAll: () => [{ id: "s1", name: "资产甲", market: "A" }] },
	Transaction: {
		getAll: () => [
			{ stockId: "s1", type: "BUY", price: 10, quantity: 100, fee: 5, date: "2025-03-01" },
			{ stockId: "s1", type: "SELL", price: 12, quantity: 100, fee: 5, date: "2025-06-01" },
		],
		getByDateRange: () => [
			{ stockId: "s1", type: "BUY", price: 10, quantity: 100, fee: 5, date: "2025-03-01" },
			{ stockId: "s1", type: "SELL", price: 12, quantity: 100, fee: 5, date: "2025-06-01" },
		],
	},
	Dividend: { getAll: () => [{ stockId: "s1", totalAmount: 50, date: "2025-05-01" }] },
}));

jest.mock("../utils/services/exchangeRate", () => ({
	getRates: jest.fn().mockResolvedValue({}),
	getRate: () => 1,
	getCachedRate: () => 1,
}));

const stats = require("../pages/stats/stats");

describe("onOpenAnnualReport 资产中性契约", () => {
	test("构建年度报告数据且不崩溃", async () => {
		expect(pageInstance).not.toBeNull();
		pageInstance.setData = function (obj) { Object.assign(this.data, obj); };
		await pageInstance.onOpenAnnualReport.call(pageInstance);
		const d = pageInstance.data.annualReportData;
		expect(d).not.toBeNull();
		expect(d.year).toBe(new Date().getFullYear());
		expect(typeof d.netChange).toBe("number");
		expect(d.holdingPortrait).not.toBeNull();
		expect(typeof d.inflowText).toBe("string");
		expect(typeof d.outflowText).toBe("string");
		expect(typeof d.endingAssetText).toBe("string");
		// 旧投资字段不应存在
		expect(d.winRate).toBeUndefined();
		expect(d.yearXIRR).toBeUndefined();
		expect(d.topStocks).toBeUndefined();
		expect(d.strategyStats).toBeUndefined();
	});
});
