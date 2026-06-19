/**
 * stockHelpers.js — 股票相关辅助函数
 */

/**
 * 从股票数组构建 ID -> 股票的映射对象
 * @param {Array} stocks - 股票数组，每个元素有 id 字段
 * @returns {Object} { stockId: stock, ... } 映射
 */
function buildStockMap(stocks) {
	const map = {};
	stocks.forEach((s) => {
		map[s.id] = s;
	});
	return map;
}

module.exports = { buildStockMap };
