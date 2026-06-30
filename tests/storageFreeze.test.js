const core = require("../utils/storageCore/core");

beforeEach(() => {
	global.wx = {
		getStorageSync: jest.fn(),
		setStorageSync: jest.fn(),
	};
});

describe("getData freeze", () => {
	beforeEach(() => {
		core.clearMemCache();
		global.wx.getStorageSync.mockReturnValue([{ id: 1, name: "test" }]);
	});

	test("returns frozen array", () => {
		const data = core.getData("test_key");
		expect(Object.isFrozen(data)).toBe(true);
	});

	test("returns frozen objects inside array", () => {
		const data = core.getData("test_key");
		expect(Object.isFrozen(data[0])).toBe(true);
	});

	test("throws on direct mutation", () => {
		const data = core.getData("test_key");
		expect(() => {
			data.push({ id: 2 });
		}).toThrow(TypeError);
	});

	test("throws on object mutation", () => {
		const data = core.getData("test_key");
		expect(() => {
			data[0].name = "mutated";
		}).toThrow(TypeError);
	});
});

describe("upsertAndSave with frozen data", () => {
	beforeEach(() => {
		core.clearMemCache();
		global.wx.getStorageSync.mockReturnValue([]);
	});

	test("can upsert after freeze", () => {
		core.upsertAndSave("test_key", { id: 1, name: "a" });
		const data = core.getData("test_key");
		expect(data.length).toBe(1);
		expect(data[0].name).toBe("a");
	});

	test("can update existing item", () => {
		core.upsertAndSave("test_key", { id: 1, name: "a" });
		core.upsertAndSave("test_key", { id: 1, name: "b" });
		const data = core.getData("test_key");
		expect(data.length).toBe(1);
		expect(data[0].name).toBe("b");
	});
});
