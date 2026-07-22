/**
 * PriceCache 单元测试
 * 覆盖正常价格缓存与「负结果缓存」（瓶颈 A）：
 * - markNegative / setBatchNegative 写入短 TTL 负结果
 * - has() 在 NEGATIVE_TTL 内视为已缓存（true），过期后 false
 * - get() / getBatch() 对负结果返回 null，但 has() 仍命中
 * - pruneExpired 按负结果 TTL 清理过期条目
 * - 正常 set() 覆盖负结果
 */

let _mockStorage = {};

beforeEach(() => {
	_mockStorage = {};
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => {
			_mockStorage[key] = value;
		}),
	};
});

describe("PriceCache negative caching", () => {
	let PriceCache;

	beforeEach(() => {
		PriceCache = require("../utils/models/priceCache");
	});

	test("markNegative: has() true within NEGATIVE_TTL, get() returns null", () => {
		PriceCache.markNegative(123);
		expect(PriceCache.has(123)).toBe(true);
		expect(PriceCache.get(123)).toBeNull();
	});

	test("setBatchNegative: marks multiple ids as negative", () => {
		PriceCache.setBatchNegative([1, 2, 3]);
		expect(PriceCache.has(1)).toBe(true);
		expect(PriceCache.has(2)).toBe(true);
		expect(PriceCache.has(3)).toBe(true);
		expect(PriceCache.get(2)).toBeNull();
	});

	test("negative entry has() returns false after NEGATIVE_TTL expires", () => {
		// 负结果 timestamp 设为 6 分钟前（> 5 分钟 NEGATIVE_TTL）
		const oldTime = Date.now() - 6 * 60 * 1000;
		global.wx.getStorageSync = jest.fn(() => ({
			123: { price: null, negative: true, timestamp: oldTime },
		}));
		expect(PriceCache.has(123)).toBe(false);
		expect(PriceCache.get(123)).toBeNull();
	});

	test("set() with valid price overrides a prior negative entry", () => {
		PriceCache.markNegative(123);
		expect(PriceCache.has(123)).toBe(true);
		PriceCache.set(123, 12.34);
		expect(PriceCache.get(123)).toBe(12.34);
		expect(PriceCache.has(123)).toBe(true);
	});

	test("pruneExpired removes expired negative entries but keeps fresh ones", () => {
		const oldTime = Date.now() - 6 * 60 * 1000;
		const recentTime = Date.now() - 1 * 60 * 1000;
		global.wx.getStorageSync = jest.fn(() => ({
			1: { price: null, negative: true, timestamp: oldTime },
			2: { price: null, negative: true, timestamp: recentTime },
		}));
		const pruned = PriceCache.pruneExpired();
		expect(pruned).toBe(1);
		const saved = global.wx.setStorageSync.mock.calls[0][1];
		expect(saved[1]).toBeUndefined();
		expect(saved[2]).toBeDefined();
	});

	test("getBatch excludes negative but has() still considers it cached", () => {
		PriceCache.set(10, 5.5);
		PriceCache.markNegative(20);
		const batch = PriceCache.getBatch([10, 20]);
		expect(batch[10]).toBe(5.5);
		// 负结果不进入 result（price 为 null）
		expect(batch[20]).toBeUndefined();
		// 但仍在 TTL 内视为已缓存（跳过重复网络请求）
		expect(PriceCache.has(20)).toBe(true);
	});
});
