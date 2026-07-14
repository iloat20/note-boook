/**
 * Stock 模型 - 股票数据操作
 */

const {
	STOCK_KEY,
	getNextId,
	getData,
	upsertAndSave,
	deleteAndSave,
} = require("../storageCore/core");
const { createStock } = require("../helpers/entityFactory");

const Stock = {
	/**
	 * 创建新股票对象
	 * @param {string} code - 股票代码
	 * @param {string} name - 股票名称
	 * @param {string} market - 市场类型
	 * @returns {Object} 股票对象
	 */
	create(code, name, market) {
		return createStock(code, name, market, getNextId());
	},

	/**
	 * 保存股票（新增或更新）
	 * @param {Object} stock - 股票对象
	 * @returns {Object} 保存后的股票对象
	 */
	save(stock) {
		return upsertAndSave(STOCK_KEY, stock, ["position", "periodStats"]);
	},

	/**
	 * 获取所有股票
	 * @returns {Array} 股票列表
	 */
	getAll() {
		const result = getData(STOCK_KEY);
		return Array.isArray(result) ? result : [];
	},

	/**
	 * 根据 ID 获取股票
	 * @param {number} id - 股票 ID
	 * @returns {Object|undefined} 股票对象
	 */
	getById(id) {
		const stocks = this.getAll();
		// 类型宽容匹配：历史数据/旧备份里 id 可能是字符串，
		// 而调用方常传 parseInt 后的数字，严格 === 会漏匹配导致"资产不存在"
		return stocks.find((s) => s.id === id || String(s.id) === String(id));
	},

	/**
	 * 根据代码和市场获取股票
	 * @param {string} code - 股票代码
	 * @param {string} market - 市场类型
	 * @returns {Object|undefined} 股票对象
	 */
	getByCode(code, market) {
		const stocks = this.getAll();
		const marketStock = stocks.filter((s) => s.market === market);
		const exact = marketStock.find((s) => s.code === code);
		if (exact) return exact;
		const { formatStockCode } = require("../constants/market");
		const formatted = formatStockCode(code, market);
		if (formatted !== code) {
			const existing = marketStock.find((s) => s.code === formatted);
			if (existing) return existing;
		}
		const norm =
			String(code)
				.replace(/^(hk|HK)/, "")
				.replace(/^0+/, "") || String(code);
		return marketStock.find((s) => (s.code || "").replace(/^0+/, "") === norm) || undefined;
	},

	/**
	 * 删除股票
	 * @param {number} id - 股票 ID
	 */
	delete(id) {
		deleteAndSave(STOCK_KEY, id, ["position", "periodStats"]);
	},

	/**
	 * 根据市场获取股票列表
	 * @param {string} market - 市场类型
	 * @returns {Array} 股票列表
	 */
	getByMarket(market) {
		return this.getAll().filter((s) => s.market === market);
	},
};

module.exports = Stock;
