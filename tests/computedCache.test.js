// tests/computedCache.test.js
let _mockStorage = {};
let _firstLoad = {};

beforeEach(() => {
	_mockStorage = {};
	_firstLoad = {};
	jest.clearAllMocks();
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => {
			if (key in _mockStorage) return _mockStorage[key];
			if (key in _firstLoad) return _firstLoad[key];
			return null;
		}),
		setStorageSync: jest.fn((key, value) => {
			_mockStorage[key] = value;
		}),
	};
});

describe("computedCache", () => {
	let computedCache;
	beforeEach(() => {
		computedCache = require("../utils/cache/computedCache");
	});

	test("getCached returns null when no cache exists", () => {
		const result = computedCache.getCached("test_key");
		expect(result).toBeNull();
	});

	test("getCached returns value when version matches", () => {
		const value = { totalPnL: 1234.56 };
		computedCache.setCached("test_key", value);
		// setCached writes synchronously to _mockStorage via saveData
		const result = computedCache.getCached("test_key");
		expect(result).toEqual(value);
	});

	test("getCached returns null when version mismatches", () => {
		const value = { totalPnL: 1234.56 };
		computedCache.setCached("test_key", value);
		computedCache.bumpVersion();
		const result = computedCache.getCached("test_key");
		expect(result).toBeNull();
	});

	test("setCached persists value with current version", () => {
		const value = { xirr: 12.5 };
		computedCache.setCached("xirr_key", value);
		const raw = _mockStorage["computed_xirr_key_v2"];
		expect(raw).toBeDefined();
		expect(raw.value).toEqual(value);
		expect(raw.dataVersion).toBe(0);
		expect(typeof raw.computedAt).toBe("number");
	});

	test("bumpVersion increments version", () => {
		expect(computedCache.getVersion()).toBe(0);
		computedCache.bumpVersion();
		expect(computedCache.getVersion()).toBe(1);
		computedCache.bumpVersion();
		expect(computedCache.getVersion()).toBe(2);
	});

	test("clearAll removes known keys", () => {
		computedCache.setCached("total_stats", { a: 1 });
		computedCache.setCached("total_xirr", { b: 2 });
		computedCache.clearAll();
		expect(_mockStorage["computed_total_stats_v2"]).toBeNull();
		expect(_mockStorage["computed_total_xirr_v2"]).toBeNull();
	});

	test("version is module-scoped (shared after bump)", () => {
		computedCache.setCached("k1", { v: 1 });
		computedCache.bumpVersion();
		// Previous write now stale
		expect(computedCache.getCached("k1")).toBeNull();
		// New write with new version
		computedCache.setCached("k1", { v: 2 });
		expect(computedCache.getCached("k1")).toEqual({ v: 2 });
	});
});
