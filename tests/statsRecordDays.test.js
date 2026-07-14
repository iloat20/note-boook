// 回归测试：记录天数需兼容日期存储的两种格式
// - "YYYY-MM-DD"（表单传字符串）
// - "YYYY-MM-DDTHH:mm:ss.sssZ"（表单传 Date 对象时由 entityFactory 归一化）
// 之前用 new Date(earliest + "T00:00:00Z") 拼接到 ISO datetime 会得到 Invalid Date → NaN（UI 显示 null）。
const fs = require("fs");
const path = require("path");

let pageInstance = null;
global.Page = (cfg) => { pageInstance = cfg; };

jest.mock("../utils/models/index", () => {
	const txDates = ["2025-03-01T00:00:00.000Z", "2025-06-01T08:30:00.000Z"];
	const divDates = ["2025-09-01T12:00:00.000Z"];
	return {
		Stock: { getAll: () => [{ id: "s1", name: "资产甲", code: "600000", market: "A_SHARE" }] },
		Transaction: {
			getAll: () => txDates.map((d, i) => ({
				id: "t" + i, stockId: "s1", type: i === 0 ? "BUY" : "SELL",
				price: 10, quantity: 100, fee: 5, date: d,
			})),
			getByDateRange: () => [],
		},
		Dividend: {
			getAll: () => divDates.map((d, i) => ({
				id: "d" + i, stockId: "s1", perShareAmount: 0.5, quantity: 100,
				date: d, type: "CASH",
			})),
		},
	};
});

jest.mock("../utils/services/statsService", () => ({
	getTotalStats: () => ({ totalPnL: 198, realizedPnL: 198 }),
}));
jest.mock("../utils/services/positionService", () => ({ getAllPositions: () => [], getClearedPositions: () => [] }));
jest.mock("../utils/cache/cacheManager", () => ({ caches: { stats: { has: () => false, get: () => null, set: () => {} }, periodStats: { has: () => false, get: () => null, set: () => {} } } }));
jest.mock("../utils/services/exchangeRate", () => ({ getRates: () => ({}), getRate: () => 1, getCachedRate: () => 1 }));
jest.mock("../utils/helpers/format", () => ({ fmt: (n) => (n == null ? "0.00" : Number(n).toFixed(2)) }));
jest.mock("../utils/helpers/dateRange", () => ({ getByPeriod: () => ({ startDate: "", endDate: "" }) }));
jest.mock("../utils/helpers/annualReport", () => ({ computeAssetHoldingPortrait: () => ({}), computeAllTimeAssetFlow: () => ({ endingAsset: 0 }), assembleAnnualReport: () => ({}) }));
jest.mock("../utils/helpers/stockHelpers", () => ({ buildStockMap: () => ({}) }));
jest.mock("../utils/helpers/recordView", () => ({ buildRecordView: () => ({}) }));
jest.mock("../utils/exporters/markdown", () => ({ exportMD: () => {} }));
jest.mock("../utils/services/dataService", () => ({ wipeAll: () => {} }));
jest.mock("../utils/ui/pageMixin", () => ({ initPageData: () => ({}), onLoadMixin: () => {}, onShowMixin: () => false }));

test("loadStats: recordDays 在 ISO datetime 日期下为有限正整数（非 NaN/null）", async () => {
	require("../pages/stats/stats");
	expect(pageInstance).not.toBeNull();
	pageInstance.setData = function (obj) { Object.assign(this.data, obj); };
	await pageInstance.loadStats.call(pageInstance);
	const { stats } = pageInstance.data;
	expect(stats).toBeTruthy();
	expect(typeof stats.recordDays).toBe("number");
	expect(Number.isFinite(stats.recordDays)).toBe(true);
	expect(stats.recordDays).toBeGreaterThan(0);
});
