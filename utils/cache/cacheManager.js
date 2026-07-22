/**
 * 缓存管理器 - 统一管理多个缓存实例
 * 提供统一的缓存清理接口
 * 实现 markDataDirty 功能
 */

const LRUCache = require("./lruCache");
const { bumpVersion } = require("./version");

// 缓存类型枚举：markDataDirty 的 type 参数、caches 键、各 model 调用点统一引用，
// 避免字符串拼写错误导致缓存静默失效。
const CACHE_TYPES = {
	POSITION: "position",
	HEATMAP: "heatmap",
	PERIOD_STATS: "periodStats",
	STATS: "stats",
	MEM: "mem",
	ALL: "all",
};

// 缓存实例配置
const caches = {
	[CACHE_TYPES.POSITION]: new LRUCache(100), // 持仓计算结果缓存
	[CACHE_TYPES.STATS]: new LRUCache(20), // 统计服务缓存（totalStats/strategyStats）
	[CACHE_TYPES.MEM]: new LRUCache(100), // 内存缓存（避免频繁读取本地存储）
};

/**
 * 标记数据过期并清除缓存
 * @param {string|string[]} [types] - 需要清除的缓存类型。
 *   可选: CACHE_TYPES.POSITION | CACHE_TYPES.HEATMAP | CACHE_TYPES.PERIOD_STATS | CACHE_TYPES.STATS | CACHE_TYPES.ALL
 *   默认 CACHE_TYPES.ALL（向后兼容）。
 * @param {number|number[]} [stockId] - 可选的股票 ID，用于按股票粒度清除 position 缓存。
 *   传入时只清除该股票的 position 缓存，不清除其他 position。
 *   注：HEATMAP / PERIOD_STATS 仍保留为可识别的 dirty tag（向后兼容各 model 的保存调用），
 *   但当前没有为其分配独立缓存实例——markDataDirty 会忽略未分配实例的类型，调用方无需改动。
 */
function markDataDirty(types, stockId) {
	try {
		const appStore = require("../state/appStore");
		appStore.commit("MARK_DIRTY");
		bumpVersion();
	} catch (e) {
		console.warn("[markDataDirty]", e);
	}

	// 任何数据写入都可能影响聚合统计，统一失效 stats 缓存。
	// 原逻辑仅在 types === "all" 时才清 stats，导致各 model 以具体类型
	//（["position","heatmap","periodStats"]）保存后，statsService 的 LRU 仍命中
	// 旧值，统计页面读到陈旧数据。
	caches.stats.clear();

	if (!types || types === CACHE_TYPES.ALL) {
		// 保留 mem 缓存（只是 storage 的内存包装，不需要通过 dirty 清除）
		caches.position.clear();
		caches.stats.clear();
		return;
	}

	const typeList = Array.isArray(types) ? types : [types];
	typeList.forEach((type) => {
		if (type === CACHE_TYPES.MEM || !caches[type]) return;
		if (type === CACHE_TYPES.POSITION && stockId != null) {
			// 按股票粒度清除，避免全量重建 position 缓存
			const ids = Array.isArray(stockId) ? stockId : [stockId];
			ids.forEach((id) => {
				caches.position.delete(id);
			});
		} else {
			caches[type].clear();
		}
	});
}

module.exports = {
	markDataDirty,
	caches,
	CACHE_TYPES,
};
