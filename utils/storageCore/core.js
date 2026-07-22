/**
 * 核心存储函数
 * 封装 wx.getStorageSync/wx.setStorageSync（经 platform/storage 抽象层）
 * 提供内存缓存以减少 I/O
 */

const { MARKETS, TRANSACTION_TYPE, DEFAULT_STRATEGIES } = require("../constants/index");
const storage = require("../platform/storage");
// 注意：core 不再在顶层 require cacheManager。
// 内存缓存（caches.mem）与 markDataDirty 均改为惰性获取（见 getMemCache / _markDirty），
// 以打破 core ↔ cacheManager ↔ computedCache 的结构性循环依赖。

const STOCK_KEY = "stock_trade_stocks";
const TRANSACTION_KEY = "stock_trade_transactions";
const DIVIDEND_KEY = "stock_trade_dividends";
const PRICE_KEY = "stock_trade_prices";
const STRATEGY_KEY = "stock_trade_strategies";

// 内存缓存，避免频繁读取本地存储
// 使用 LRU 策略，防止缓存无限增长
// 惰性获取 cacheManager.caches.mem，避免 core 在加载期依赖 cacheManager。
let _memCacheRef = null;
function getMemCache() {
	if (!_memCacheRef) {
		_memCacheRef = require("../cache/cacheManager").caches.mem;
	}
	return _memCacheRef;
}

let _lastTimestamp = 0;
let _seq = 0;

// 写操作队列，串行化所有 read-modify-write 操作，防止数据竞争
let _writeQueue = Promise.resolve();

/**
 * 将写操作加入队列，确保同一时刻只有一个写操作在执行
 * @param {Function} operation - 返回 Promise 的写操作
 * @returns {Promise} 操作结果
 */
function enqueueWrite(operation) {
	_writeQueue = _writeQueue.catch(() => {}).then(() => operation());
	return _writeQueue;
}

/**
 * 清空写队列（仅用于测试）
 * @returns {void}
 */
function clearWriteQueue() {
	_writeQueue = Promise.resolve();
}

/**
 * 等待所有排队的写操作完成（仅用于测试）
 * @returns {Promise<void>}
 */
function flushWriteQueue() {
	return _writeQueue;
}

/**
 * 生成唯一 ID
 * 基于时间戳 + 序列号，避免冲突
 * @returns {number} 唯一 ID
 */
function getNextId() {
	const now = Date.now();
	if (now === _lastTimestamp) {
		_seq++;
	} else {
		_lastTimestamp = now;
		_seq = 0;
	}
	const ID_MULTIPLIER = 1000;
	return now * ID_MULTIPLIER + _seq;
}

/**
 * Recursively freeze an object/array.
 *
 * 性能不变式：deepFreeze 保证「一个对象被冻结 ⇒ 其所有后代也已被冻结」。
 * 因此对已冻结对象可直接返回，无需再向下递归。写操作（upsertAndSave/
 * deleteAndSave）每次 slice 出的新数组里，绝大多数元素是上一次已冻结的旧引用，
 * 命中此短路后为 O(1)，只有新建/合并出的对象会被真正深冻结——把每次写入的
 * 冻结成本从 O(全部节点) 降到 O(数组长度 + 改动子树)。
 * @param {any} obj
 * @returns {any} the frozen object (same reference)
 */
function deepFreeze(obj) {
	if (obj === null || typeof obj !== "object") return obj;
	// 已冻结 ⇒ 后代必然已冻结（见上方不变式），直接跳过递归。
	if (Object.isFrozen(obj)) return obj;
	Object.freeze(obj);
	if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			const item = obj[i];
			if (item && typeof item === "object") deepFreeze(item);
		}
	} else {
		const keys = Object.keys(obj);
		for (let i = 0; i < keys.length; i++) {
			const v = obj[keys[i]];
			if (v && typeof v === "object") deepFreeze(v);
		}
	}
	return obj;
}

/**
 * 保存数据到本地存储和内存缓存
 * @param {string} key - 存储键
 * @param {any} data - 数据
 */
function saveData(key, data) {
	storage.setStorageSync(key, data);
	// Freeze on write: subsequent getData cache-hits return the frozen reference
	const frozen = deepFreeze(data);
	getMemCache().delete(key);
	getMemCache().set(key, frozen);
}

/**
 * 从内存缓存或本地存储读取数据
 * @param {string} key - 存储键
 * @returns {any} 数据
 */
function getData(key) {
	const mem = getMemCache();
	if (mem.has(key)) return mem.get(key);
	let data = storage.getStorageSync(key);
	if (
		data === undefined ||
		data === null ||
		data === "" ||
		(Array.isArray(data) && data.length === 0)
	) {
		if (key === PRICE_KEY) {
			data = {};
		} else {
			data = [];
		}
	}
	// C1 freeze contract: freeze on every read so callers cannot mutate the shared cache ref
	mem.set(key, deepFreeze(data));
	return mem.get(key);
}

/**
 * 返回数据的浅拷贝，防止外部修改污染缓存
 * @param {string} key - 存储键
 * @returns {any} 数据的浅拷贝
 */
function getDataCopy(key) {
	const data = getData(key);
	if (Array.isArray(data)) return data.slice();
	if (typeof data === "object" && data !== null) return Object.assign({}, data);
	return data;
}

/**
 * 清除内存缓存
 */
function clearMemCache() {
	getMemCache().clear();
}

/**
 * 惰性调用 cacheManager.markDataDirty。
 * 不直接依赖 cacheManager，避免 core 在加载期形成对状态层的反向依赖。
 * @param {string|string[]} types
 * @param {number|number[]} [stockId]
 */
function _markDirty(types, stockId) {
	require("../cache/cacheManager").markDataDirty(types, stockId);
}

/**
 * 通用 upsert 并保存
 * 封装 findIndex → replace/push → saveData → markDataDirty 模式
 * @param {string} key - 存储键
 * @param {Object} item - 要保存的对象（必须有 id 字段）
 * @param {string|Array} dirtyTags - dirty 标记，传给 markDataDirty
 * @returns {Object} 保存后的对象
 */
function upsertAndSave(key, item, dirtyTags) {
	if (!item || item.id == null) {
		console.error("[upsertAndSave] Invalid item:", item);
		return item;
	}
	const list = getData(key).slice();
	const index = list.findIndex((x) => x.id === item.id);
	if (index >= 0) {
		list[index] = { ...list[index], ...item };
	} else {
		list.push(item);
	}
	saveData(key, list);
	if (dirtyTags) _markDirty(dirtyTags, item.id);
	return list[index >= 0 ? index : list.length - 1];
}

/**
 * 通用删除并保存
 * @param {string} key - 存储键
 * @param {number} id - 要删除的对象 ID
 * @param {string|Array} dirtyTags - dirty 标记
 * @param {number} [stockId] - 可选的 stockId，用于按股票粒度清除缓存。
 *   不传时自动从被删除项目中检测。
 */
function deleteAndSave(key, id, dirtyTags) {
	const list = getData(key).slice();
	let foundStockId = null;
	const newList = list.filter((x) => {
		if (x.id === id && foundStockId == null) {
			foundStockId = x.stockId != null ? x.stockId : x.id;
		}
		return x.id !== id;
	});
	saveData(key, newList);
	if (dirtyTags) _markDirty(dirtyTags, foundStockId);
}

module.exports = {
	MARKETS,
	TRANSACTION_TYPE,
	DEFAULT_STRATEGIES,
	STOCK_KEY,
	TRANSACTION_KEY,
	DIVIDEND_KEY,
	PRICE_KEY,
	STRATEGY_KEY,
	getNextId,
	saveData,
	getData,
	getDataCopy,
	clearMemCache,
	upsertAndSave,
	deleteAndSave,
	enqueueWrite,
	clearWriteQueue,
	flushWriteQueue,
};
