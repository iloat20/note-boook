/**
 * PriceCache 模型 - 股票价格缓存操作
 *
 * 价格缓存带有 TTL（生存时间），过期后返回 null
 * 以触发重新获取行情。
 */

const { PRICE_KEY, getData, saveData } = require("../storageCore/core");
const { markDataDirty, CACHE_TYPES } = require("../cache/cacheManager");
const { TIMING_CONFIG } = require("../constants/index");

// 价格缓存 TTL：30 分钟（毫秒）
const PRICE_TTL = TIMING_CONFIG.PRICE_TTL_MS;
// 负结果缓存 TTL：5 分钟（毫秒）。仅用于「代码确实无有效行情」的短缓存，
// 避免每轮刷新都重复打网络；过期后自动重新探测。
const NEGATIVE_TTL = TIMING_CONFIG.NEGATIVE_TTL_MS;

const PriceCache = {
	/**
	 * 设置股票价格缓存
	 * @param {number} stockId - 股票 ID
	 * @param {number} price - 股票价格
	 */
	set(stockId, price) {
		if (stockId == null || Number.isNaN(parseFloat(price)) || parseFloat(price) < 0) return;
		const prices = { ...this.getAll() };
		prices[stockId] = {
			price: parseFloat(price),
			timestamp: Date.now(),
		};
		saveData(PRICE_KEY, prices);
		markDataDirty([CACHE_TYPES.POSITION], stockId);
	},

	/**
	 * 批量设置股票价格缓存（只写一次 storage）
	 * @param {Array<{stockId: number, price: number}>} entries
	 */
	setBatch(entries) {
		if (!entries || entries.length === 0) return;
		const prices = { ...this.getAll() };
		const now = Date.now();
		const updatedIds = [];
		entries.forEach((item) => {
			if (
				item.stockId == null ||
				Number.isNaN(parseFloat(item.price)) ||
				parseFloat(item.price) < 0
			)
				return;
			prices[item.stockId] = {
				price: parseFloat(item.price),
				timestamp: now,
			};
			updatedIds.push(item.stockId);
		});
		saveData(PRICE_KEY, prices);
		// 批量传递所有更新的股票 ID，按粒度清除
		markDataDirty([CACHE_TYPES.POSITION], updatedIds);
	},

	/**
	 * 获取股票价格缓存
	 * @param {number} stockId - 股票 ID
	 * @returns {number|null} 股票价格，过期或为负结果返回 null
	 */
	get(stockId) {
		const prices = this.getAll();
		const entry = prices[stockId];
		if (!entry) return null;
		if (typeof entry === "number") return entry;
		const ttl = entry.negative ? NEGATIVE_TTL : PRICE_TTL;
		if (Date.now() - entry.timestamp > ttl) return null;
		return entry.price != null ? entry.price : null;
	},

	/**
	 * 获取所有股票价格缓存
	 * @returns {Object} 股票价格缓存对象
	 */
	getAll() {
		return getData(PRICE_KEY) || {};
	},

	markNegative(stockId) {
		if (stockId == null) return;
		const prices = { ...this.getAll() };
		prices[stockId] = { price: null, negative: true, timestamp: Date.now() };
		saveData(PRICE_KEY, prices);
		markDataDirty([CACHE_TYPES.POSITION], stockId);
	},

	setBatchNegative(entries) {
		if (!entries || entries.length === 0) return;
		const prices = { ...this.getAll() };
		const now = Date.now();
		const updatedIds = [];
		entries.forEach((id) => {
			if (id == null) return;
			prices[id] = { price: null, negative: true, timestamp: now };
			updatedIds.push(id);
		});
		saveData(PRICE_KEY, prices);
		markDataDirty([CACHE_TYPES.POSITION], updatedIds);
	},

	/**
	 * 批量获取多只股票的价格（只读一次 storage）
	 * @param {Array<number>} stockIds - 股票 ID 列表
	 * @returns {Object} { stockId: price, ... }，过期或不存在的不包含
	 */
	getBatch(stockIds) {
		if (!stockIds || stockIds.length === 0) return {};
		const prices = { ...this.getAll() };
		const now = Date.now();
		const result = {};
		const expiredIds = [];

		stockIds.forEach((id) => {
			const entry = prices[id];
			if (!entry) return;
			// 兼容旧格式
			if (typeof entry === "number") {
				result[id] = entry;
				return;
			}
			const ttl = entry.negative ? NEGATIVE_TTL : PRICE_TTL;
			if (now - entry.timestamp > ttl) {
				expiredIds.push(id);
			} else if (entry.price != null) {
				// 负结果（price 为 null）不进入 result，但仍在 TTL 内视为已缓存
				result[id] = entry.price;
			}
		});

		// Batch cleanup expired entries
		if (expiredIds.length > 0) {
			expiredIds.forEach((id) => {
				delete prices[id];
			});
			saveData(PRICE_KEY, prices);
		}

		return result;
	},

	/**
	 * 检查价格缓存是否有效（含负结果）
	 * @param {number} stockId - 股票 ID
	 * @returns {boolean} 是否存在且未过期。已缓存的负结果（未过期）也视为 true，
	 *   使刷新跳过重复网络请求；过期（含负结果 TTL 到期）返回 false 触发重新探测。
	 */
	has(stockId) {
		const prices = this.getAll();
		const entry = prices[stockId];
		if (!entry) return false;
		if (typeof entry === "number") return true;
		const ttl = entry.negative ? NEGATIVE_TTL : PRICE_TTL;
		if (Date.now() - entry.timestamp > ttl) return false;
		return true;
	},

	/**
	 * 批量清理所有过期价格缓存
	 * 在 app 启动时调用，避免惰性清理累积太多垃圾
	 * @returns {number} 清理的过期条目数
	 */
	pruneExpired() {
		const prices = { ...getData(PRICE_KEY) };
		if (!prices || typeof prices !== "object") return 0;

		const now = Date.now();
		let pruned = 0;

		Object.keys(prices).forEach((key) => {
			const entry = prices[key];
			// 清理旧格式（纯数字，无 TTL 信息）
			if (typeof entry === "number") {
				delete prices[key];
				pruned++;
				return;
			}
			// 清理过期条目（按负结果/正常价各自的 TTL）
			const ttl = entry && entry.negative ? NEGATIVE_TTL : PRICE_TTL;
			if (entry && typeof entry.timestamp === "number" && now - entry.timestamp > ttl) {
				delete prices[key];
				pruned++;
			}
		});

		if (pruned > 0) saveData(PRICE_KEY, prices);
		return pruned;
	},
};

module.exports = PriceCache;
