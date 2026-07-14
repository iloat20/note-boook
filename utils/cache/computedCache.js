/**
 * computedCache.js — disk-backed versioned cache for expensive computations.
 *
 * Cache entries are invalidated when dataVersion changes (on any data write).
 * This provides persistence across page reloads without manual TTL management.
 */

const { getData, saveData } = require("../storageCore/core");

const CACHE_KEY_PREFIX = "computed_";
const CACHE_KEY_SUFFIX = "_v2";

let _dataVersion = 0;

/**
 * Increment data version (called from markDataDirty).
 * All existing disk cache entries become stale.
 */
function bumpVersion() {
	_dataVersion++;
}

/**
 * Get current data version.
 * @returns {number}
 */
function getVersion() {
	return _dataVersion;
}

/**
 * Read cache entry. Returns null if missing or version mismatch.
 * @param {string} key - cache key (without prefix/suffix)
 * @returns {any|null}
 */
function getCached(key) {
	const raw = getData(`${CACHE_KEY_PREFIX}${key}${CACHE_KEY_SUFFIX}`);
	if (!raw) return null;
	if (raw.dataVersion !== _dataVersion) return null;
	return raw.value;
}

/**
 * Write cache entry with current version.
 * @param {string} key
 * @param {any} value
 */
function setCached(key, value) {
	saveData(`${CACHE_KEY_PREFIX}${key}${CACHE_KEY_SUFFIX}`, {
		value,
		dataVersion: _dataVersion,
		computedAt: Date.now(),
	});
}

/**
 * Clear all known computed cache entries.
 */
function clearAll() {
	const knownKeys = ["total_stats"];
	knownKeys.forEach((k) => {
		saveData(`${CACHE_KEY_PREFIX}${k}${CACHE_KEY_SUFFIX}`, null);
	});
}

/**
 * Warm up: no-op placeholder. Actual warm-up happens lazily
 * when services call getCached() and disk hits are demoted to memory cache.
 */
function warmUpCache() {
	// Intentionally empty — services hydrate their own LRU caches on first call.
}

module.exports = {
	CACHE_KEY_PREFIX,
	CACHE_KEY_SUFFIX,
	bumpVersion,
	getVersion,
	getCached,
	setCached,
	clearAll,
	warmUpCache,
};
