/**
 * searchHistory.js 单元测试
 * 搜索历史：去重 + MRU（最近搜索置顶） + 上限截断 + 容错
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
		removeStorageSync: jest.fn((key) => {
			delete _mockStorage[key];
		}),
	};
});

describe("searchHistory", () => {
	let sh;

	beforeEach(() => {
		sh = require("../utils/helpers/searchHistory");
	});

	test("load returns empty array when no history", () => {
		expect(sh.load()).toEqual([]);
	});

	test("load returns history in MRU order after saves", () => {
		sh.save("茅台");
		sh.save("腾讯");
		sh.save("平安");
		expect(sh.load()).toEqual(["平安", "腾讯", "茅台"]);
	});

	test("save deduplicates and moves to front (MRU)", () => {
		sh.save("茅台");
		sh.save("腾讯");
		sh.save("茅台"); // 重复，应移到最前
		expect(sh.load()).toEqual(["茅台", "腾讯"]);
	});

	test("save trims to MAX (20) items", () => {
		for (let i = 0; i < 25; i++) {
			sh.save(`kw${i}`);
		}
		const result = sh.load();
		expect(result.length).toBe(20);
		// 最近 20 个（kw24..kw5），最新在前
		expect(result[0]).toBe("kw24");
		expect(result[19]).toBe("kw5");
	});

	test("save ignores empty / whitespace-only keyword", () => {
		sh.save("  ");
		sh.save("");
		expect(sh.load()).toEqual([]);
	});

	test("save ignores non-string keyword", () => {
		sh.save(null);
		sh.save(undefined);
		sh.save(123);
		expect(sh.load()).toEqual([]);
	});

	test("save trims keyword whitespace", () => {
		sh.save("  茅台  ");
		expect(sh.load()).toEqual(["茅台"]);
	});

	test("clear removes all history", () => {
		sh.save("茅台");
		sh.save("腾讯");
		sh.clear();
		expect(sh.load()).toEqual([]);
		expect(global.wx.removeStorageSync).toHaveBeenCalledWith(sh.SEARCH_HISTORY_KEY);
	});

	test("remove deletes single item", () => {
		sh.save("茅台");
		sh.save("腾讯");
		sh.save("平安");
		sh.remove("腾讯");
		expect(sh.load()).toEqual(["平安", "茅台"]);
	});

	test("remove non-existent item is no-op", () => {
		sh.save("茅台");
		sh.remove("不存在的");
		expect(sh.load()).toEqual(["茅台"]);
	});

	test("load is fault-tolerant to corrupted JSON", () => {
		// 直接写入脏数据，绕过 setStorageSync 的模拟
		_mockStorage[sh.SEARCH_HISTORY_KEY] = "not valid json";
		// wx.getStorageSync 返回 null（因为不是数组，但模拟返回原值）
		// 强制覆盖模拟返回
		global.wx.getStorageSync.mockImplementation(() => "corrupted");
		expect(sh.load()).toEqual([]);
	});

	test("load filters out non-string entries", () => {
		_mockStorage[sh.SEARCH_HISTORY_KEY] = ["茅台", 123, null, "腾讯"];
		const result = sh.load();
		expect(result).toEqual(["茅台", "腾讯"]);
	});

	test("save persists to wx.setStorageSync with correct key", () => {
		sh.save("茅台");
		expect(global.wx.setStorageSync).toHaveBeenCalledWith(
			sh.SEARCH_HISTORY_KEY,
			["茅台"],
		);
	});

	test("storage write failure does not throw and still returns in-memory result", () => {
		global.wx.setStorageSync.mockImplementation(() => {
			throw new Error("storage full");
		});
		// 不应抛错
		expect(() => sh.save("茅台")).not.toThrow();
		// 内存态仍正确
		expect(sh.load()).toEqual(["茅台"]);
	});

	test("SEARCH_HISTORY_KEY is stable", () => {
		expect(sh.SEARCH_HISTORY_KEY).toBe("stock_trade_search_history");
	});
});
