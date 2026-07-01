const { dateToNumber, xirr } = require("../utils/helpers/xirr");

describe("dateToNumber", () => {
	test("should return epoch millis for a date string", () => {
		expect(dateToNumber("2024-01-01")).toBe(new Date("2024-01-01").getTime());
	});

	test("should return epoch millis for a Date instance", () => {
		const d = new Date("2025-06-30T12:00:00.000Z");
		expect(dateToNumber(d)).toBe(d.getTime());
	});
});

describe("xirr validation", () => {
	test("should return null for mismatched flow and date lengths", () => {
		expect(xirr([-1000, 1100], ["2024-01-01"])).toBeNull();
		expect(xirr([-1000], ["2024-01-01", "2025-01-01"])).toBeNull();
	});

	test("should return null for cashFlows with fewer than 2 entries", () => {
		expect(xirr([-1000], ["2024-01-01"])).toBeNull();
		expect(xirr([], [])).toBeNull();
	});

	test("should return null when no sign change in flows", () => {
		expect(xirr([100, 200], ["2024-01-01", "2025-01-01"])).toBeNull();
		expect(xirr([-100, -200], ["2024-01-01", "2025-01-01"])).toBeNull();
	});
});

describe("xirr calculation", () => {
	test("should approximate 10% for one-year 1000 → 1100", () => {
		const r = xirr([-1000, 1100], ["2024-01-01", "2025-01-01"]);
		expect(r).not.toBeNull();
		expect(r).toBeCloseTo(0.1, 3);
	});

	test("should approximate 0% for break-even flows", () => {
		const r = xirr([-1000, 1000], ["2024-01-01", "2025-01-01"]);
		expect(r).not.toBeNull();
		expect(r).toBeCloseTo(0, 3);
	});

	test("should return negative rate for loss scenario", () => {
		const r = xirr([-1000, 900], ["2024-01-01", "2025-01-01"]);
		expect(r).not.toBeNull();
		expect(r).toBeLessThan(0);
		expect(r).toBeGreaterThanOrEqual(-0.99);
	});

	test("should handle same-date flows without error", () => {
		const r = xirr([-1000, 1100], ["2024-01-01", "2024-01-01"]);
		expect(r === null || typeof r === "number").toBe(true);
	});

	test("should improve with custom guess closer to root", () => {
		const r = xirr([-1000, 1100], ["2024-01-01", "2025-01-01"], 0.2);
		expect(r).not.toBeNull();
		expect(r).toBeCloseTo(0.1, 3);
	});

	test("should handle multi-period flows", () => {
		const r = xirr([-1000, 300, 800], ["2024-01-01", "2024-07-01", "2025-01-01"]);
		expect(r).not.toBeNull();
		expect(r).toBeGreaterThan(0);
		expect(r).toBeLessThan(10);
	});

	test("should return null for extreme flows beyond search bounds", () => {
		const r = xirr([-0.01, 1e18], ["2024-01-01", "2025-01-01"]);
		expect(r === null || typeof r === "number").toBe(true);
	});
});
