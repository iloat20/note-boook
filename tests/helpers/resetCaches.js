// tests/helpers/resetCaches.js
// 测试辅助：清空所有缓存桶，保证用例间隔离。
// 必须在 jest.resetModules() 之后调用——缓存实例随模块注册表一起重建，
// 这里每次都重新 require，确保操作的是当前测试正在使用的那份 cacheManager 实例。

function resetCaches() {
	const { caches, CACHE_TYPES } = require("../../utils/cache/cacheManager");
	Object.keys(CACHE_TYPES).forEach((key) => {
		const cache = caches[CACHE_TYPES[key]];
		if (cache && typeof cache.clear === "function") cache.clear();
	});
}

module.exports = { resetCaches };
