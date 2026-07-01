const {
	today,
	thisWeek,
	thisMonth,
	yearToDate,
	getByPeriod,
} = require("../utils/helpers/dateRange");

const FIXED_DATE = "2026-06-30T07:30:45.500Z";

beforeAll(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date(FIXED_DATE));
});

afterAll(() => {
	jest.useRealTimers();
});

function startOf(d) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

describe("today", () => {
	test("should return 00:00:00 to 23:59:59.999 on the fixed date", () => {
		const { startDate, endDate } = today();
		expect(startOf(startDate)).toBe(startOf(new Date(FIXED_DATE)));
		expect(endDate.getTime() - startDate.getTime()).toBe(86400000 - 1);
	});
});

describe("thisWeek", () => {
	test("should start on Monday and end on Sunday", () => {
		const { startDate, endDate } = thisWeek();
		// 2026-06-30 is Tuesday; week = 2026-06-29 .. 2026-07-05
		expect(startDate.getDay()).toBe(1);
		expect(startDate.getDate()).toBe(29);
		expect(startDate.getMonth()).toBe(5); // June = index 5
		expect(endDate.getHours()).toBe(23);
		expect(endDate.getMinutes()).toBe(59);
		expect(endDate.getSeconds()).toBe(59);
		expect(endDate.getMilliseconds()).toBe(999);
	});
});

describe("thisMonth", () => {
	test("should span from June 1 to June 30, 2026 ( month across 0-indexed )", () => {
		const { startDate, endDate } = thisMonth();
		expect(startDate.getFullYear()).toBe(2026);
		expect(startDate.getMonth()).toBe(5);
		expect(startDate.getDate()).toBe(1);
		expect(endDate.getFullYear()).toBe(2026);
		expect(endDate.getMonth()).toBe(5);
		expect(endDate.getDate()).toBe(30);
		expect(endDate.getHours()).toBe(23);
	});
});

describe("yearToDate", () => {
	test("should span from Jan 1 to today in 2026", () => {
		const { startDate, endDate } = yearToDate();
		expect(startDate.getFullYear()).toBe(2026);
		expect(startDate.getMonth()).toBe(0);
		expect(startDate.getDate()).toBe(1);
		expect(endDate.getFullYear()).toBe(2026);
		expect(endDate.getMonth()).toBe(5);
		expect(endDate.getDate()).toBe(30);
		expect(endDate.getHours()).toBe(23);
	});
});

describe("getByPeriod", () => {
	test("should delegate to today when period is DAY", () => {
		const r = getByPeriod("DAY");
		expect(startOf(r.startDate)).toBe(startOf(new Date(FIXED_DATE)));
	});

	test("should delegate to thisWeek when period is WEEK", () => {
		const r = getByPeriod("WEEK");
		expect(r.startDate.getDay()).toBe(1);
	});

	test("should delegate to thisMonth when period is MONTH", () => {
		const r = getByPeriod("MONTH");
		expect(r.startDate.getDate()).toBe(1);
	});

	test("should delegate to yearToDate when period is YEAR", () => {
		const r = getByPeriod("YEAR");
		expect(r.startDate.getMonth()).toBe(0);
		expect(r.startDate.getDate()).toBe(1);
	});

	test("should return default range with epoch zero for unknown period", () => {
		const r = getByPeriod("DECADE");
		expect(r.startDate.getTime()).toBe(0);
	});
});
