/**
 * Dividend 模型 - 分红数据操作
 */

const {
	DIVIDEND_KEY,
	getNextId,
	saveData,
	getData,
	markDataDirty,
	upsertAndSave,
	deleteAndSave,
} = require("../storageCore/core");
const Stock = require("./stock");
const { createDividend } = require("../helpers/entityFactory");

const Dividend = {
	/**
	 * 创建新分红对象
	 * @param {number} stockId - 股票 ID
	 * @param {number} perShareAmount - 每股分红金额
	 * @param {number} quantity - 持股数量
	 * @param {Date|string} date - 分红日期
	 * @param {string} note - 备注
	 * @param {string} type - 分红类型（CASH|SHARE）
	 * @param {number} shareQuantity - 送股数量
	 * @returns {Object} 分红对象
	 */
	create(stockId, perShareAmount, quantity, date, note, type, shareQuantity) {
		return createDividend(
			stockId,
			perShareAmount,
			quantity,
			date,
			note,
			type,
			shareQuantity,
			getNextId(),
		);
	},

	/**
	 * 保存分红记录（新增或更新）
	 * @param {Object} dividend - 分红对象
	 * @returns {Object} 保存后的分红对象
	 */
	save(dividend) {
		const result = upsertAndSave(DIVIDEND_KEY, dividend);
		markDataDirty(["position", "heatmap", "periodStats"], dividend.stockId);
		return result;
	},

	/**
	 * 获取所有分红记录
	 * @returns {Array} 分红记录列表
	 */
	getAll() {
		const result = getData(DIVIDEND_KEY);
		return Array.isArray(result) ? result : [];
	},

	/**
	 * 根据股票 ID 获取分红记录
	 * @param {number} stockId - 股票 ID
	 * @returns {Array} 分红记录列表（按日期降序）
	 */
	getByStockId(stockId) {
		return this.getAll()
			.filter((d) => d.stockId === stockId)
			.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
	},

	/**
	 * 删除分红记录
	 * @param {number} id - 分红记录 ID
	 */
	delete(id) {
		deleteAndSave(DIVIDEND_KEY, id, ["position", "heatmap", "periodStats"]);
	},

	/**
	 * 根据股票 ID 删除所有分红记录
	 * @param {number} stockId - 股票 ID
	 */
	deleteByStockId(stockId) {
		const dividends = this.getAll().filter((d) => d.stockId !== stockId);
		saveData(DIVIDEND_KEY, dividends);
		markDataDirty(["position", "heatmap", "periodStats"], stockId);
	},

	/**
	 * 根据市场获取分红记录
	 * @param {string} market - 市场类型
	 * @returns {Array} 分红记录列表
	 */
	getByMarket(market) {
		const stocks = Stock.getByMarket(market);
		const stockIdSet = new Set(stocks.map((s) => s.id));
		return this.getAll().filter((d) => stockIdSet.has(d.stockId));
	},
};

module.exports = Dividend;
