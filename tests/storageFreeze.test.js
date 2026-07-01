// tests/storageFreeze.test.js
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

describe("Storage freeze-on-write", () => {
	let core;
	beforeEach(() => {
		core = require("../utils/storageCore/core");
	});

	test("saveData freezes the stored array and its items", () => {
		const arr = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
		core.saveData("tx_key", arr);
		const cached = core.getData("tx_key");
		expect(Object.isFrozen(cached)).toBe(true);
		expect(Object.isFrozen(cached[0])).toBe(true);
	});

	test("getData on cache hit returns same reference (no re-freeze)", () => {
		core.saveData("tx_key", [{ id: 1 }]);
		const first = core.getData("tx_key");
		const second = core.getData("tx_key");
		expect(second).toBe(first);
	});

	test("getData on first load returns mutable data (for slice/copy)", () => {
		_mockStorage["tx_key"] = [{ id: 1 }];
		const data = core.getData("tx_key");
		expect(Object.isFrozen(data)).toBe(false);
	});

	test("getDataCopy returns mutable copy even when cache is frozen", () => {
		core.saveData("tx_key", [{ id: 1, name: "frozen" }]);
		const copy = core.getDataCopy("tx_key");
		expect(Object.isFrozen(copy)).toBe(false);
		copy.push({ id: 2 });
		expect(copy.length).toBe(2);
		expect(core.getData("tx_key").length).toBe(1);
	});

	test("upsertAndSave works with freeze-on-write (slice before mutate)", () => {
		core.saveData("tx_key", [{ id: 1, name: "old" }]);
		core.upsertAndSave("tx_key", { id: 1, name: "new" });
		const result = core.getData("tx_key");
		expect(result[0].name).toBe("new");
		expect(Object.isFrozen(result)).toBe(true);
	});

	test("deleteAndSave works with freeze-on-write", () => {
		core.saveData("tx_key", [{ id: 1 }, { id: 2 }]);
		core.deleteAndSave("tx_key", 1);
		const result = core.getData("tx_key");
		expect(result.length).toBe(1);
		expect(result[0].id).toBe(2);
	});

	test("saveData freezes nested objects recursively (deepFreeze)", () => {
		const obj = { a: { b: { c: 1 } } };
		core.saveData("obj_key", obj);
		const cached = core.getData("obj_key");
		expect(Object.isFrozen(cached)).toBe(true);
		expect(Object.isFrozen(cached.a)).toBe(true);
		expect(Object.isFrozen(cached.a.b)).toBe(true);
	});
});
