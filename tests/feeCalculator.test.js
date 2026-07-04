const { MARKETS, TRANSACTION_TYPE } = require("../utils/constants/index");
const { calculateFee, getFeeBreakdown } = require("../utils/helpers/feeCalculator");

describe("calculateFee A股", () => {
	test("should apply min 5 commission on small BUY", () => {
		const r = getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, 10, 100);
		expect(r.total).toBe(5.01);
		expect(r.items).toHaveLength(3);
		const commission = r.items.find((i) => i.name === "佣金");
		expect(commission.value).toBe(5);
		expect(commission.min).toBe(5);
	});

	test("should compute full breakdown for SELL", () => {
		const r = getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.SELL, 10, 1000);
		expect(r.total).toBe(15.1);
		const stampDuty = r.items.find((i) => i.name === "印花税");
		expect(stampDuty.value).toBe(10);
	});

	test("should omit stampDuty on BUY", () => {
		const r = getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, 50, 200);
		expect(r.items.find((i) => i.name === "印花税").value).toBe(0);
	});

	test("should round commission at 2 decimals with large amount", () => {
		const r = getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.SELL, 123.45, 10000);
		expect(r.items.find((i) => i.name === "佣金").value).toBe(308.63);
	});
});

describe("calculateFee 港股", () => {
	test("should sum all HK fee items", () => {
		const r = getFeeBreakdown(MARKETS.HK_SHARE, TRANSACTION_TYPE.BUY, 100, 500);
		expect(r.items).toHaveLength(5);
		expect(r.total).toBe(85.89);
	});

	test("should apply min transactionFee and clearingFee", () => {
		const r = getFeeBreakdown(MARKETS.HK_SHARE, TRANSACTION_TYPE.BUY, 10, 10);
		expect(r.total).toBe(8);
	});
});

describe("calculateFee 美股", () => {
	test("should charge fixed commission on BUY", () => {
		const r = getFeeBreakdown(MARKETS.US_SHARE, TRANSACTION_TYPE.BUY, 100, 50);
		expect(r.total).toBe(0.99);
	});

	test("should compute SEC + TAF on SELL", () => {
		const r = getFeeBreakdown(MARKETS.US_SHARE, TRANSACTION_TYPE.SELL, 200, 100);
		// items 与 total 同精度：明细加总 = 合计（修复前 SEC/TAF 未 round，导致明细合计 ≠ total）
		expect(r.items[1].value).toBeCloseTo(0.56, 3);
		expect(r.items[2].value).toBeCloseTo(0.02, 3);
		expect(r.total).toBe(1.57);
		expect(r.items.reduce((s, i) => s + i.value, 0)).toBeCloseTo(r.total, 5);
	});

	test("should cap SEC fee against USD amount (cap in CNY ≈148.51 at 6.8 rate)", () => {
		// 5000000 * 10 = 50M CNY sale; raw SEC fee = 50M * 0.0000278 ≈ 1390 CNY
		// Convert to USD: 1390 / 6.8 ≈ 204 USD > 21.84 USD cap → cap = 21.84 * 6.8 ≈ 148.51 CNY
		const r = getFeeBreakdown(MARKETS.US_SHARE, TRANSACTION_TYPE.SELL, 5000000, 10);
		expect(r.items.find((i) => i.name === "SEC费").value).toBeCloseTo(148.51, 2);
	});
});

describe("calculateFee edge cases", () => {
	test("should return zero for invalid price or quantity", () => {
		expect(calculateFee(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, 0, 100)).toBe(0);
		expect(calculateFee(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, 10, 0)).toBe(0);
		expect(calculateFee(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, -5, 100)).toBe(0);
		expect(calculateFee(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, "abc", 100)).toBe(0);
	});

	test("should return zero for unknown market", () => {
		const r = getFeeBreakdown("FX", TRANSACTION_TYPE.BUY, 100, 100);
		expect(r.total).toBe(0);
		expect(r.items).toEqual([]);
	});

	test("should coerce string price and quantity inputs", () => {
		expect(getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.BUY, "10", "100").total).toBe(5.01);
	});

	test("calculateFee should match getFeeBreakdown total", () => {
		const total = calculateFee(MARKETS.A_SHARE, TRANSACTION_TYPE.SELL, 88.8, 300);
		const bd = getFeeBreakdown(MARKETS.A_SHARE, TRANSACTION_TYPE.SELL, 88.8, 300);
		expect(total).toBe(bd.total);
	});
});
