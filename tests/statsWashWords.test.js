// stats 页面洗词校验：运行期可见文案与渲染数据均不含投资禁用词
const fs = require("fs");
const path = require("path");

let pageInstance = null;
global.Page = (cfg) => { pageInstance = cfg; };

jest.mock("../utils/models/index", () => ({
	Stock: {
		getAll: () => [{ id: "s1", name: "资产甲", code: "600000", market: "A" }],
	},
	Transaction: {
		getAll: () => [
			{ id: "t1", stockId: "s1", type: "BUY", price: 10, quantity: 100, fee: 5, date: "2025-03-01" },
			{ id: "t2", stockId: "s1", type: "SELL", price: 12, quantity: 100, fee: 5, date: "2025-06-01" },
		],
		getByDateRange: () => [],
	},
	Dividend: { getAll: () => [] },
}));

jest.mock("../utils/services/statsService", () => ({
	getTotalStats: () => ({
		totalPnL: 198,
		totalPnLPercent: 19.8,
		realizedPnL: 198,
	}),
}));

jest.mock("../utils/services/positionService", () => ({
	getAllPositions: () => ({}),
}));

jest.mock("../utils/helpers/recordView", () => ({
	buildRecordView: (entity) => ({ id: entity.id, name: "资产甲" }),
}));

jest.mock("../utils/helpers/stockHelpers", () => ({
	buildStockMap: () => ({}),
}));

jest.mock("../utils/helpers/annualReport", () => ({
	computeAssetHoldingPortrait: () => ({ longest: null, shortest: null, mostActive: null }),
	computeAllTimeAssetFlow: () => ({ endingAsset: 0 }),
	assembleAnnualReport: () => ({}),
}));

jest.mock("../utils/services/exchangeRate", () => ({
	getRates: jest.fn().mockResolvedValue({}),
	getRate: () => 1,
	getCachedRate: () => 1,
}));

jest.mock("../utils/exporters/markdown", () => ({
	exportMD: jest.fn(),
}));

jest.mock("../utils/services/dataService", () => ({
	wipeAll: jest.fn(),
}));

jest.mock("../utils/ui/pageMixin", () => ({
	initPageData: () => ({}),
	onLoadMixin: jest.fn(),
	onShowMixin: jest.fn(() => false),
}));

// 禁用词（沿用设计文档第7节，覆盖运行期可见文案）
const FORBIDDEN = /投资|持仓|盈亏|盈利|收益率|年化|买入|卖出|分红|股票|证券|胜率|已结清|已实现|总收益/;

describe("stats 页面洗词", () => {
	test("stats.wxml 运行期可见文案无禁用词", () => {
		const file = path.join(__dirname, "../pages/stats/stats.wxml");
		const content = fs.readFileSync(file, "utf8");
		// 先去掉 HTML 注释（如历史注释）再做可见文案校验
		const visible = content.replace(/<!--[\s\S]*?-->/g, "");
		expect(visible).not.toMatch(FORBIDDEN);
	});

	test("loadStats 渲染数据不含禁用词，且移除投资字段、新增期末资产", async () => {
		require("../pages/stats/stats");
		expect(pageInstance).not.toBeNull();
		pageInstance.setData = function (obj) { Object.assign(this.data, obj); };
		await pageInstance.loadStats.call(pageInstance);
		const { stats } = pageInstance.data;
		expect(stats).toBeTruthy();

		// 旧投资字段不应存在
		expect(stats.returnValue).toBeUndefined();
		expect(stats.returnText).toBeUndefined();
		expect(stats.winRate).toBeUndefined();
		expect(stats.winRateText).toBeUndefined();

		// 新增 期末资产 卡片
		expect(typeof stats.endingAssetText).toBe("string");

		// 新增 记录天数 卡片（从最早一条记录到今天，含今天）
		expect(typeof stats.recordDays).toBe("number");
		expect(stats.recordDays).toBeGreaterThan(0);
	});
});
