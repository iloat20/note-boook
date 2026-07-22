const { fmt, fmtDate, fmtTime, fmtShortDate, todayISO } = require("../utils/helpers/format");

describe("fmt", () => {
	test("should format with thousands separator and two decimals", () => {
		expect(fmt(1234567.89)).toBe("1,234,567.89");
		expect(fmt(1000)).toBe("1,000.00");
		expect(fmt(0)).toBe("0.00");
	});

	test("should handle negative numbers", () => {
		expect(fmt(-1234.5)).toBe("-1,234.50");
	});

	test("should return 0.00 for non-finite values", () => {
		expect(fmt(NaN)).toBe("0.00");
		expect(fmt(Infinity)).toBe("0.00");
		expect(fmt(-Infinity)).toBe("0.00");
		expect(fmt("not a number")).toBe("0.00");
		expect(fmt(undefined)).toBe("0.00");
	});

	test("should parse numeric strings", () => {
		expect(fmt("42")).toBe("42.00");
		expect(fmt("3.14159")).toBe("3.14");
	});
});

describe("fmtDate", () => {
	test("should format to yyyy-MM-dd", () => {
		expect(fmtDate(new Date(2024, 0, 5))).toBe("2024-01-05");
		expect(fmtDate(new Date(2024, 11, 31))).toBe("2024-12-31");
	});

	test("should handle string input", () => {
		expect(fmtDate("2024-03-15")).toBe("2024-03-15");
	});

	test("should return empty string for invalid date", () => {
		expect(fmtDate("not-a-date")).toBe("");
		expect(fmtDate(NaN)).toBe("");
	});

	test("should zero-pad month and day", () => {
		expect(fmtDate(new Date(2024, 2, 1))).toBe("2024-03-01");
	});
});

describe("fmtTime", () => {
	test("should format to HH:mm", () => {
		expect(fmtTime(new Date(2024, 0, 1, 9, 5))).toBe("09:05");
		expect(fmtTime(new Date(2024, 0, 1, 23, 59))).toBe("23:59");
	});

	test("should zero-pad hours and minutes", () => {
		expect(fmtTime(new Date(2024, 0, 1, 0, 0))).toBe("00:00");
		expect(fmtTime(new Date(2024, 0, 1, 1, 2))).toBe("01:02");
	});

	test("should return empty string for invalid input", () => {
		expect(fmtTime("invalid")).toBe("");
		expect(fmtTime(NaN)).toBe("");
	});
});

describe("fmtShortDate", () => {
	test("should format to M/d without leading zeros", () => {
		expect(fmtShortDate(new Date(2024, 0, 5))).toBe("1/5");
		expect(fmtShortDate(new Date(2024, 11, 31))).toBe("12/31");
	});

	test("should handle string input", () => {
		expect(fmtShortDate("2024-07-04")).toBe("7/4");
	});

	test("should return empty string for invalid input", () => {
		expect(fmtShortDate("nope")).toBe("");
	});
});

describe("todayISO", () => {
	test("returns today as yyyy-MM-dd and equals fmtDate(new Date())", () => {
		const expected = fmtDate(new Date());
		expect(todayISO()).toBe(expected);
		expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
