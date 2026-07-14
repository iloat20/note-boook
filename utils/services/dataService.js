/**
 * dataService.js — 跨模型的写操作封装。
 *
 * 把"涉及多张底层存储表 + 多个缓存桶 + 两个索引"的一次性原语收到这里，
 * 让页面不再直接 require storageCore / cacheManager / 裸 *_KEY。
 *
 * 当前提供一个事务级擦除原语 wipeAll()；将来备份/恢复、全量替换也放这里。
 */

const storage = require("../storageCore/core");
const { clearMemCache, markDataDirty } = require("../cache/cacheManager");

/**
 * 清空全部本地数据。
 * 顺序：清 5 张表（股票 / 交易 / 分红 / 行情 / 策略）→ 清 `mem` 缓存 → 全量 dirty → 失效时间索引。
 * @returns {void}
 */
function wipeAll() {
	storage.saveData("stock_trade_stocks", []);
	storage.saveData("stock_trade_transactions", []);
	storage.saveData("stock_trade_dividends", []);
	storage.saveData("stock_trade_prices", {});
	storage.saveData("stock_trade_strategies", []);
	clearMemCache();
	markDataDirty("all");
	// 索引层读到空数据无需显式清空；若以后索引加内存缓存，在此 require 后调用 invalidate()
}

module.exports = {
	wipeAll,
};
