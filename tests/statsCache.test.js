/**
 * StatsService 缓存层测试
 * 验证 getTotalStats / getStrategyStats 的缓存命中与失效
 */

const { resetCaches } = require("./helpers/resetCaches");

let _mockStorage = {};

describe("StatsService cache", () => {
	let Stock, Transaction, getTotalStats, getStrategyStats, markDataDirty;

	beforeEach(() => {
		jest.resetModules();
		_mockStorage = {};
		global.wx = {
			getStorageSync: jest.fn((key) => _mockStorage[key] || null),
			setStorageSync: jest.fn((key, value) => {
				_mockStorage[key] = value;
			}),
		};

		// resetModules 后重新 require，确保模块间共享同一 storage
		const { MARKETS } = require("../utils/constants/index");
		Stock = require("../utils/models").Stock;
		Transaction = require("../utils/models").Transaction;
		const statsService = require("../utils/services/statsService");
		getTotalStats = statsService.getTotalStats;
		getStrategyStats = statsService.getStrategyStats;
		markDataDirty = require("../utils/cache/cacheManager").markDataDirty;

		// 清除缓存，确保每个测试独立
		resetCaches();
	});

	afterEach(() => {
		resetCaches();
	});

	describe("getTotalStats", () => {
		test("should return cached result on second call when data unchanged", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z"));

			const result1 = getTotalStats();
			const result2 = getTotalStats();

			expect(result1).toBe(result2); // 同一引用，证明缓存命中
			expect(result1.totalInvestment).toBe(1000); // 100 * 10
		});

		test("should recompute after data mutation (Transaction.save marks stats dirty)", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z"));

			const result1 = getTotalStats();
			expect(result1.totalInvestment).toBe(1000);

			// 未变更数据 → 命中缓存（同一引用）
			const result2 = getTotalStats();
			expect(result2).toBe(result1);

			// 修改数据：Transaction.save 内部 markDataDirty 会失效 stats 缓存
			Transaction.save(Transaction.create(stock.id, "BUY", 100, 5, 1, "2026-01-02T00:00:00.000Z"));

			const result3 = getTotalStats();
			expect(result3).not.toBe(result1); // 不再返回陈旧缓存
			expect(result3.totalInvestment).toBe(1500); // 1000 + 500

			// 显式 markDataDirty('stats') 同样触发失效
			markDataDirty("stats");
			const result4 = getTotalStats();
			expect(result4).not.toBe(result3);
		});

		test("should recompute after markDataDirty('all')", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z"));
			Transaction.save(Transaction.create(stock.id, "SELL", 120, 10, 1, "2026-01-02T00:00:00.000Z"));

			const result1 = getTotalStats();
			expect(result1.realizedPnL).toBe(198); // (120-100)*10 - 2 = 198

			// 标记 all dirty
			markDataDirty("all");

			const result2 = getTotalStats();
			expect(result2).not.toBe(result1);
			expect(result2.realizedPnL).toBe(198); // 值不变，但引用变了
		});
	});

	describe("getStrategyStats", () => {
		test("should return cached result on second call when called without transactions", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(
				Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z", null, null, ["价值投资"]),
			);

			const result1 = getStrategyStats();
			const result2 = getStrategyStats();

			expect(result1).toBe(result2);
			expect(result1).toHaveLength(1);
			expect(result1[0].tag).toBe("价值投资");
		});

		test("should not cache when transactions parameter is provided", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(
				Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z", null, null, ["价值投资"]),
			);

			const allTx = Transaction.getAll();
			const result1 = getStrategyStats(allTx);
			const result2 = getStrategyStats(allTx);

			// 传入 transactions 时不缓存，每次返回新对象
			expect(result1).not.toBe(result2);
			expect(result1).toEqual(result2);
		});

		test("should recompute after markDataDirty('stats')", () => {
			const stock = Stock.save(Stock.create("600000", "浦发银行", "A_SHARE"));
			Transaction.save(
				Transaction.create(stock.id, "BUY", 100, 10, 1, "2026-01-01T00:00:00.000Z", null, null, ["价值投资"]),
			);

			const result1 = getStrategyStats();
			expect(result1).toHaveLength(1);

			Transaction.save(
				Transaction.create(stock.id, "BUY", 100, 5, 1, "2026-01-02T00:00:00.000Z", null, null, ["趋势交易"]),
			);
			markDataDirty("stats");

			const result2 = getStrategyStats();
			expect(result2).toHaveLength(2);
		});
	});
});
