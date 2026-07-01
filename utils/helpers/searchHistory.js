/**
 * searchHistory.js — 全局搜索历史管理
 *
 * 0 依赖，封装 wx.setStorageSync，跨页面共享同一份历史。
 * 行为：去重 + MRU（最近搜索置顶） + 上限截断。
 * 所有函数容错：storage 损坏时返回空数组，不抛错（遵循 errors.js 的"UI 不崩溃"原则）。
 */

const { TIMING_CONFIG } = require("../constants/index");

const SEARCH_HISTORY_KEY = "stock_trade_search_history";
const MAX = TIMING_CONFIG.SEARCH_HISTORY_MAX || 20;

// 内存镜像：避免每次 load 都读 storage，与 storageCore 的 LRU 模式一致
let _memCache = null;

/**
 * 读取搜索历史
 * @returns {string[]} 历史关键词数组（MRU 序，最新在前）；storage 损坏返回 []
 */
function load() {
	if (_memCache !== null) return _memCache;
	try {
		const raw = wx.getStorageSync(SEARCH_HISTORY_KEY);
		if (!Array.isArray(raw)) {
			_memCache = [];
			return _memCache;
		}
		_memCache = raw.filter((item) => typeof item === "string");
		return _memCache;
	} catch (_e) {
		_memCache = [];
		return _memCache;
	}
}

/**
 * 保存关键词到历史（去重置顶 + 截断到上限）
 * @param {string} keyword - 原始关键词（非空字符串才保存）
 * @returns {string[]} 保存后的完整历史数组
 */
function save(keyword) {
	if (typeof keyword !== "string") return load();
	const trimmed = keyword.trim();
	if (!trimmed) return load();

	const history = load();
	const deduped = history.filter((item) => item !== trimmed);
	deduped.unshift(trimmed);
	const capped = deduped.slice(0, MAX);
	_memCache = capped;

	try {
		wx.setStorageSync(SEARCH_HISTORY_KEY, capped);
	} catch (_e) {
		// 存储满或不可用：静默失败，内存态仍返回正确结果
	}
	return capped;
}

/**
 * 清空搜索历史
 * @returns {void}
 */
function clear() {
	_memCache = [];
	try {
		wx.removeStorageSync(SEARCH_HISTORY_KEY);
	} catch (_e) {
		// 不存在时也静默失败
	}
}

/**
 * 删除单条历史
 * @param {string} keyword - 要删除的关键词
 * @returns {string[]} 删除后的完整历史数组
 */
function remove(keyword) {
	if (typeof keyword !== "string") return load();
	const history = load().filter((item) => item !== keyword);
	_memCache = history;
	try {
		wx.setStorageSync(SEARCH_HISTORY_KEY, history);
	} catch (_e) {
		// 静默失败
	}
	return history;
}

module.exports = {
	SEARCH_HISTORY_KEY,
	load,
	save,
	clear,
	remove,
	// 别名（与其它页面导入名一致）
	loadSearchHistory: load,
	saveSearchHistory: save,
	clearSearchHistory: clear,
	removeSearchHistory: remove,
};
