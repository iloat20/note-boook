// tests/resetCaches.test.js
// 验证 resetCaches 辅助能清空所有缓存桶（用例隔离用）。

const { resetCaches } = require("./helpers/resetCaches");

describe("resetCaches helper", () => {
	beforeEach(() => {
		jest.resetModules();
	});

	test("清空所有缓存桶", () => {
		const cm = require("../utils/cache/cacheManager");
		cm.caches.position.set("k", "v");
		cm.caches.stats.set("k", "v");
		resetCaches();
		expect(cm.caches.position.has("k")).toBe(false);
		expect(cm.caches.stats.has("k")).toBe(false);
	});
});
