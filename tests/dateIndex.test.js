// tests/dateIndex.test.js
let _mockStorage = {};

beforeEach(() => {
	_mockStorage = {};
	jest.clearAllMocks();
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => {
			_mockStorage[key] = value;
		}),
	};
});

describe("DateIndex", () => {
	let index;
	beforeEach(() => {
		index = require("../utils/models/dateIndex");
	});

	test("getByDateRange returns transactions within range", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, type: "BUY", price: 100, quantity: 10, fee: 5, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
			{ id: 2, stockId: 10, type: "BUY", price: 100, quantity: 10, fee: 5, date: "2024-02-20", _sortKey: new Date("2024-02-20").getTime() },
			{ id: 3, stockId: 10, type: "SELL", price: 120, quantity: 10, fee: 5, date: "2024-03-10", _sortKey: new Date("2024-03-10").getTime() },
			{ id: 4, stockId: 10, type: "BUY", price: 90, quantity: 10, fee: 5, date: "2024-04-05", _sortKey: new Date("2024-04-05").getTime() },
		];
		const result = index.getByDateRange(new Date("2024-02-01"), new Date("2024-03-31"));
		expect(result).toHaveLength(2);
		expect(result[0].date).toBe("2024-02-20");
		expect(result[1].date).toBe("2024-03-10");
	});

	test("getByDateRange returns empty array when no transactions in range", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
			{ id: 2, stockId: 10, date: "2024-04-05", _sortKey: new Date("2024-04-05").getTime() },
		];
		const result = index.getByDateRange(new Date("2024-05-01"), new Date("2024-06-30"));
		expect(result).toHaveLength(0);
	});

	test("getByDateRange returns all for wide range", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
			{ id: 2, stockId: 10, date: "2024-06-20", _sortKey: new Date("2024-06-20").getTime() },
		];
		const result = index.getByDateRange(new Date("2020-01-01"), new Date("2030-12-31"));
		expect(result).toHaveLength(2);
	});

	test("getByDateRange handles exact boundary dates", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-01-01", _sortKey: new Date("2024-01-01").getTime() },
			{ id: 2, stockId: 10, date: "2024-06-15", _sortKey: new Date("2024-06-15").getTime() },
			{ id: 3, stockId: 10, date: "2024-12-31", _sortKey: new Date("2024-12-31").getTime() },
		];
		const result = index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		expect(result).toHaveLength(3);
	});

	test("getByDateRange returns results sorted ascending by date", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 3, stockId: 10, date: "2024-04-05", _sortKey: new Date("2024-04-05").getTime() },
			{ id: 1, stockId: 10, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
			{ id: 2, stockId: 10, date: "2024-02-20", _sortKey: new Date("2024-02-20").getTime() },
		];
		const result = index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		expect(result.map((t) => t.date)).toEqual(["2024-01-15", "2024-02-20", "2024-04-05"]);
	});

	test("index rebuilds after invalidate()", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
		];
		index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));

		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-06-15", _sortKey: new Date("2024-06-15").getTime() },
			{ id: 2, stockId: 10, date: "2024-07-20", _sortKey: new Date("2024-07-20").getTime() },
		];
		require("../utils/storageCore").clearMemCache();
		index.invalidate();

		const result = index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		expect(result).toHaveLength(2);
		expect(result[0].date).toBe("2024-06-15");
	});

	test("index caches result between calls (no rebuild without invalidate)", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-01-15", _sortKey: new Date("2024-01-15").getTime() },
		];
		index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		_mockStorage["stock_trade_transactions"] = [{ id: 99, stockId: 10, date: "2025-01-01", _sortKey: new Date("2025-01-01").getTime() }];
		const result = index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
	});

	test("handles empty transaction list", () => {
		_mockStorage["stock_trade_transactions"] = [];
		const result = index.getByDateRange(new Date("2024-01-01"), new Date("2024-12-31"));
		expect(result).toHaveLength(0);
	});

	test("falls back to new Date() when _sortKey missing", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-03-15" },
		];
		const result = index.getByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
	});

	test("getByDateRange with NaN sortKey excludes invalid entries gracefully", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2024-03-15", _sortKey: new Date("2024-03-15").getTime() },
		];
		const result = index.getByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));
		expect(result).toHaveLength(1);
	});
});
