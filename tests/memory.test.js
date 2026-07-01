/**
 * 内存预算与性能相关路径的单元测试
 * 测试 LRU 缓存淘汰、请求并发控制等内存/性能优化逻辑
 */

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

describe("Storage LRU Cache", () => {
	let storage;

	beforeEach(() => {
		storage = require("../utils/storageCore");
	});

	test("getData returns data from wx.getStorageSync on cache miss", () => {
		_mockStorage["test_key"] = [1, 2, 3];
		const result = storage.getData("test_key");
		expect(result).toEqual([1, 2, 3]);
		expect(global.wx.getStorageSync).toHaveBeenCalledWith("test_key");
	});

	test("getData caches result and avoids repeated wx.getStorageSync calls", () => {
		_mockStorage["test_key"] = [1, 2, 3];
		storage.getData("test_key");
		storage.getData("test_key");
		// 第二次调用应该从缓存读取，不再调用 wx.getStorageSync
		expect(global.wx.getStorageSync).toHaveBeenCalledTimes(1);
	});

	test("saveData updates both cache and wx.setStorageSync", () => {
		storage.saveData("test_key", [4, 5, 6]);
		expect(global.wx.setStorageSync).toHaveBeenCalledWith("test_key", [4, 5, 6]);
		// 读取时应该从缓存获取
		const result = storage.getData("test_key");
		expect(result).toEqual([4, 5, 6]);
	});

	test("LRU cache evicts oldest entries when exceeding MAX_MEM_CACHE (100)", () => {
		// 填充 50 个条目
		for (let i = 0; i < 100; i++) {
			_mockStorage[`key_${i}`] = [i];
			storage.getData(`key_${i}`);
		}

		// 第 101 个条目应该触发淘汰
		_mockStorage["key_100"] = [100];
		storage.getData("key_100");

		// 验证最早插入的 key_0 应该被淘汰（再次读取会从 wx.getStorageSync 获取）
		global.wx.getStorageSync.mockClear();
		_mockStorage["key_0"] = [0];
		storage.getData("key_0");
		expect(global.wx.getStorageSync).toHaveBeenCalledWith("key_0");
	});

	test("LRU promotes accessed items to end of cache", () => {
		// 填充 100 个条目
		for (let i = 0; i < 100; i++) {
			_mockStorage[`key_${i}`] = [i];
			storage.getData(`key_${i}`);
		}

		// 访问 key_0，使其成为最近使用
		storage.getData("key_0");

		// 插入第 101 个条目，应该淘汰 key_1（而不是 key_0）
		_mockStorage["key_100"] = [100];
		storage.getData("key_100");

		// key_0 应该仍在缓存中（不触发 wx.getStorageSync）
		global.wx.getStorageSync.mockClear();
		storage.getData("key_0");
		expect(global.wx.getStorageSync).not.toHaveBeenCalled();
	});

	test("clearMemCache empties the cache", () => {
		_mockStorage["test_key"] = [1, 2, 3];
		storage.getData("test_key");
		storage.clearMemCache();

		// 清除后再次读取应该从 wx.getStorageSync 获取
		global.wx.getStorageSync.mockClear();
		storage.getData("test_key");
		expect(global.wx.getStorageSync).toHaveBeenCalledWith("test_key");
	});

	test("getDataCopy returns shallow copy of array data", () => {
		_mockStorage["test_key"] = [1, 2, 3];
		const copy = storage.getDataCopy("test_key");
		expect(copy).toEqual([1, 2, 3]);
		// 修改拷贝不应影响原始数据
		copy.push(4);
		const original = storage.getData("test_key");
		expect(original).toEqual([1, 2, 3]);
	});

	test("getDataCopy returns shallow copy of object data", () => {
		_mockStorage["test_key"] = { a: 1, b: 2 };
		const copy = storage.getDataCopy("test_key");
		expect(copy).toEqual({ a: 1, b: 2 });
		// 修改拷贝不应影响原始数据
		copy.c = 3;
		const original = storage.getData("test_key");
		expect(original).toEqual({ a: 1, b: 2 });
	});
});

describe("Cache Size Constants", () => {
	test("mem cache uses LRUCache from cacheManager", () => {
		const coreContent = require("fs").readFileSync(
			require("path").join(__dirname, "../utils/storageCore/core.js"),
			"utf8",
		);
		expect(coreContent).toContain("const _memCache = caches.mem");
	});

	test("cacheManager position cache max size is 100", () => {
		const cacheContent = require("fs").readFileSync(
			require("path").join(__dirname, "../utils/cache/cacheManager.js"),
			"utf8",
		);
		expect(cacheContent).toContain("position: new LRUCache(100)");
	});

	test("cacheManager heatmap cache max size is 50", () => {
		const cacheContent = require("fs").readFileSync(
			require("path").join(__dirname, "../utils/cache/cacheManager.js"),
			"utf8",
		);
		expect(cacheContent).toContain("heatmap: new LRUCache(50)");
	});
});

describe("PriceCache pruneExpired", () => {
	let PriceCache;

	beforeEach(() => {
		jest.resetModules();
		global.wx = {
			getStorageSync: jest.fn(() => ({})),
			setStorageSync: jest.fn(),
		};
		PriceCache = require("../utils/models/priceCache");
	});

	test("pruneExpired removes entries with old timestamps", () => {
		// 模拟数据：2 个过期，1 个未过期
		const oldTime = Date.now() - 40 * 60 * 1000; // 40 分钟前（超过 30 分钟 TTL）
		const recentTime = Date.now() - 5 * 60 * 1000; // 5 分钟前（未过期）

		global.wx.getStorageSync = jest.fn(() => ({
			stock_1: { price: 100, timestamp: oldTime },
			stock_2: { price: 200, timestamp: recentTime },
			stock_3: { price: 50, timestamp: oldTime },
		}));

		const pruned = PriceCache.pruneExpired();
		expect(pruned).toBe(2);

		// 验证 saveData 被调用，且数据只剩未过期的
		expect(global.wx.setStorageSync).toHaveBeenCalledTimes(1);
		const savedKey = global.wx.setStorageSync.mock.calls[0][0];
		const savedData = global.wx.setStorageSync.mock.calls[0][1];
		expect(savedData).toEqual({
			stock_2: { price: 200, timestamp: recentTime },
		});
	});

	test("pruneExpired removes plain-number entries (old format)", () => {
		global.wx.getStorageSync = jest.fn(() => ({
			stock_1: 100, // 旧格式纯数字
			stock_2: { price: 200, timestamp: Date.now() },
		}));

		const pruned = PriceCache.pruneExpired();
		expect(pruned).toBe(1);
	});

	test("pruneExpired returns 0 when cache is empty", () => {
		global.wx.getStorageSync = jest.fn(() => ({}));
		const pruned = PriceCache.pruneExpired();
		expect(pruned).toBe(0);
		expect(global.wx.setStorageSync).not.toHaveBeenCalled();
	});

	test("pruneExpired returns 0 when nothing is expired", () => {
		global.wx.getStorageSync = jest.fn(() => ({
			stock_1: { price: 100, timestamp: Date.now() },
		}));
		const pruned = PriceCache.pruneExpired();
		expect(pruned).toBe(0);
		expect(global.wx.setStorageSync).not.toHaveBeenCalled();
	});
});

describe("StockPrice Retry", () => {
	beforeEach(() => {
		jest.resetModules();
		// Mock the request module
		jest.mock(
			"../api/request",
			() => {
				const mockRequest = function mockRequest() {};
				mockRequest.get = jest.fn();
				mockRequest.post = jest.fn();
				return { request: mockRequest };
			},
			{ virtual: true },
		);
	});

	test("fetchStockPrice retries and succeeds after failures", async () => {
		jest.useRealTimers();

		const { request } = require("../api/request");
		let attempts = 0;
		request.get.mockImplementation(() => {
			attempts++;
			if (attempts < 3) {
				return Promise.reject(new Error("网络错误"));
			}
			// 第 3 次成功 — 返回 ArrayBuffer 模拟真实 API 响应
			const responseStr =
				'="test~名称~100~99~98~1000~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~101~102~0~0~100000"';
			const buf = new Uint8Array(Buffer.from(responseStr, "utf8")).buffer;
			return Promise.resolve(buf);
		});

		const { fetchStockPrice } = require("../utils/services/stockPrice");
		const result = await fetchStockPrice("A_SHARE", "600000");
		expect(attempts).toBe(3);
		expect(result).toBeDefined();
		expect(result.currentPrice).toBe(99);
	});

	test("fetchStockPrice retries exhaust and throws", async () => {
		jest.useRealTimers();

		const { request } = require("../api/request");
		let attempts = 0;
		request.get.mockImplementation(() => {
			attempts++;
			return Promise.reject(new Error("一直失败"));
		});

		const { fetchStockPrice } = require("../utils/services/stockPrice");
		await expect(fetchStockPrice("A_SHARE", "600000")).rejects.toThrow();
		expect(attempts).toBe(3); // 初始 + 2 次重试
	}, 10000);

	test("fetchPriceBatch returns null prices after retries exhausted", async () => {
		jest.useRealTimers();

		const { request } = require("../api/request");
		request.get.mockImplementation(() => Promise.reject(new Error("一直失败")));

		const { fetchAllPrices } = require("../utils/services/stockPrice");
		const stocks = [
			{ id: 1, market: "A_SHARE", code: "600000" },
			{ id: 2, market: "A_SHARE", code: "600001" },
		];
		const results = await fetchAllPrices(stocks);
		expect(results).toHaveLength(2);
		expect(results[0].stockId).toBe(1);
		expect(results[0].price).toBeNull();
		expect(results[1].stockId).toBe(2);
		expect(results[1].price).toBeNull();
	}, 10000);
});
