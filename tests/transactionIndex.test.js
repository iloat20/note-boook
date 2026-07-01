// tests/transactionIndex.test.js
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

describe("TransactionIndex", () => {
	let index;
	beforeEach(() => {
		index = require("../utils/models/transactionIndex");
	});

	test("getByStockId returns only transactions for that stockId", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2026-01-01" },
			{ id: 2, stockId: 20, date: "2026-01-02" },
			{ id: 3, stockId: 10, date: "2026-01-03" },
		];
		const result = index.getByStockId(10);
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id).sort()).toEqual([1, 3]);
	});

	test("getByStockId returns transactions sorted by date descending", () => {
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10, date: "2026-01-01" },
			{ id: 3, stockId: 10, date: "2026-01-03" },
			{ id: 2, stockId: 10, date: "2026-01-02" },
		];
		const result = index.getByStockId(10);
		expect(result.map((t) => t.date)).toEqual([
			"2026-01-03",
			"2026-01-02",
			"2026-01-01",
		]);
	});

	test("getByStockId returns empty array for unknown stockId", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		expect(index.getByStockId(999)).toEqual([]);
	});

	test("index rebuilds after invalidate()", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		index.getByStockId(10);
		_mockStorage["stock_trade_transactions"] = [
			{ id: 1, stockId: 10 },
			{ id: 2, stockId: 10 },
		];
		// Clear storageCore's in-memory cache so the rebuild reads fresh mock data
		require("../utils/storageCore").clearMemCache();
		index.invalidate();
		const result = index.getByStockId(10);
		expect(result).toHaveLength(2);
	});

	test("index caches result between calls (no rebuild without invalidate)", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		index.getByStockId(10);
		_mockStorage["stock_trade_transactions"] = [{ id: 99, stockId: 10 }];
		const result = index.getByStockId(10);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
	});

	test("getByStockId returns a copy (mutations dont affect index)", () => {
		_mockStorage["stock_trade_transactions"] = [{ id: 1, stockId: 10 }];
		const result = index.getByStockId(10);
		result.push({ id: 999, stockId: 10 });
		const again = index.getByStockId(10);
		expect(again).toHaveLength(1);
	});
});
