/**
 * market.js — inferMarket 单测
 * 锁定「代码格式 → 市场」推断规则。该逻辑原分散在 record.js / quick-record.js 两份
 * _detectMarket 中（含 5/6 位 A 股歧义），现已收敛到单一入口，去重后行为应保持一致。
 */
const { inferMarket, getAsharePrefix, buildSymbol } = require("../utils/constants/market");
const { MARKETS } = require("../utils/constants/index");

describe("inferMarket", () => {
	test("6 位数字 → A 股", () => {
		expect(inferMarket("600000")).toBe(MARKETS.A_SHARE);
	});

	test("hk + 1~5 位数字 → 港股", () => {
		expect(inferMarket("hk00700")).toBe(MARKETS.HK_SHARE);
		expect(inferMarket("HK007")).toBe(MARKETS.HK_SHARE);
	});

	test("5 位数字 → A 股（历史规则，与 validateStockCode 的 6 位存在分歧，统一在此维护）", () => {
		expect(inferMarket("12345")).toBe(MARKETS.A_SHARE);
	});

	test("1~5 位字母 → 美股", () => {
		expect(inferMarket("AAPL")).toBe(MARKETS.US_SHARE);
		expect(inferMarket("B")).toBe(MARKETS.US_SHARE);
	});

	test("空 / 无法识别 → null", () => {
		expect(inferMarket("")).toBeNull();
		expect(inferMarket(null)).toBeNull();
		expect(inferMarket("1234567")).toBeNull(); // 7 位数字不识别
		expect(inferMarket("hk")).toBe(MARKETS.US_SHARE); // 纯字母 "HK" 命中美股规则（与原始 _detectMarket 一致）
	});

	test("大小写不敏感", () => {
		expect(inferMarket("HK00700")).toBe(MARKETS.HK_SHARE);
		expect(inferMarket("aapl")).toBe(MARKETS.US_SHARE);
	});
});

describe("getAsharePrefix", () => {
	test("600000 → sh（上海主板）", () => {
		expect(getAsharePrefix("600000")).toBe("sh");
	});

	test("688xxx → sh（科创板）", () => {
		expect(getAsharePrefix("688001")).toBe("sh");
	});

	test("000001 → sz（深圳主板）", () => {
		expect(getAsharePrefix("000001")).toBe("sz");
	});

	test("300xxx → sz（创业板）", () => {
		expect(getAsharePrefix("300750")).toBe("sz");
	});

	test("8xxxxx → bj（北交所）", () => {
		expect(getAsharePrefix("830799")).toBe("bj");
	});

	test("4xxxxx → bj（北交所）", () => {
		expect(getAsharePrefix("430047")).toBe("bj");
	});
});

describe("buildSymbol", () => {
	test("A 股 → 前缀 + 代码", () => {
		expect(buildSymbol(MARKETS.A_SHARE, "600000")).toBe("sh600000");
	});

	test("港股 → r_hk + 5 位零填充", () => {
		expect(buildSymbol(MARKETS.HK_SHARE, "700")).toBe("r_hk00700");
	});

	test("美股 → us + 大写", () => {
		expect(buildSymbol(MARKETS.US_SHARE, "aapl")).toBe("usAAPL");
	});

	test("未知市场 → null", () => {
		expect(buildSymbol("UNKNOWN", "x")).toBeNull();
	});
});
