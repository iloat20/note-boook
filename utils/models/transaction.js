/**
 * Transaction 模型 - 交易记录数据操作
 */

const {
	TRANSACTION_KEY,
	getNextId,
	saveData,
	getData,
	markDataDirty,
	upsertAndSave,
	deleteAndSave,
} = require("../storageCore/core");
const Stock = require("./stock");
const { createTransaction } = require("../helpers/entityFactory");

const Transaction = {
	/**
	 * 创建新交易记录对象
	 * @param {number} stockId - 股票 ID
	 * @param {string} type - 交易类型（BUY/SELL）
	 * @param {number} price - 价格
	 * @param {number} quantity - 数量
	 * @param {number} fee - 手续费
	 * @param {Date|string} date - 日期
	 * @param {string} note - 备注
	 * @param {string} reason - 交易原因
	 * @param {Array} strategies - 策略标签
	 * @returns {Object} 交易记录对象
	 */
	create(stockId, type, price, quantity, fee, date, note, reason, strategies) {
		return createTransaction(
			stockId,
			type,
			price,
			quantity,
			fee,
			date,
			note,
			reason,
			strategies,
			getNextId(),
		);
	},

	/**
	 * 保存交易记录（新增或更新）
	 * @param {Object} transaction - 交易记录对象
	 * @returns {Object} 保存后的交易记录对象
	 */
	save(transaction) {
		return upsertAndSave(TRANSACTION_KEY, transaction, [
			"position",
			"heatmap",
			"periodStats",
		]);
	},

	/**
	 * 获取所有交易记录
	 * @returns {Array} 交易记录列表
	 */
	getAll() {
		return getData(TRANSACTION_KEY);
	},

	/**
	 * 根据股票 ID 获取交易记录
	 * @param {number} stockId - 股票 ID
	 * @returns {Array} 交易记录列表（按日期降序）
	 */
	getByStockId(stockId) {
		return this.getAll()
			.filter((t) => t.stockId === stockId)
			.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
	},

	/**
	 * 删除交易记录
	 * @param {number} id - 交易记录 ID
	 */
	delete(id) {
		deleteAndSave(TRANSACTION_KEY, id, ["position", "heatmap", "periodStats"]);
	},

	/**
	 * 根据股票 ID 删除所有交易记录
	 * @param {number} stockId - 股票 ID
	 */
	deleteByStockId(stockId) {
		const transactions = this.getAll().filter((t) => t.stockId !== stockId);
		saveData(TRANSACTION_KEY, transactions);
		markDataDirty(["position", "heatmap", "periodStats"], stockId);
	},

	/**
	 * 根据市场获取交易记录
	 * @param {string} market - 市场类型
	 * @returns {Array} 交易记录列表
	 */
	getByMarket(market) {
		const stocks = Stock.getByMarket(market);
		const stockIdSet = new Set(stocks.map((s) => s.id));
		return this.getAll().filter((t) => stockIdSet.has(t.stockId));
	},

	/**
	 * 根据策略标签获取交易记录
	 * @param {string} tag - 策略标签
	 * @returns {Array} 交易记录列表
	 */
	getByStrategy(tag) {
		return this.getAll().filter(
			(t) => t.strategies && t.strategies.includes(tag),
		);
	},

	/**
	 * 根据日期范围获取交易记录
	 * @param {Date} startDate - 开始日期
	 * @param {Date} endDate - 结束日期
	 * @returns {Array} 交易记录列表
	 */
	getByDateRange(startDate, endDate) {
		const start = startDate.toISOString();
		const end = endDate.toISOString();
		return this.getAll().filter((t) => t.date >= start && t.date <= end);
	},
};

module.exports = Transaction;
