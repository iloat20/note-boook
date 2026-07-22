/**
 * transactionService.js — 交易写入流程的单一归属（#5 / SRP）
 *
 * 把"卖出数量校验 + 股票自动创建 + 价格写入缓存 + 交易构造与保存"收敛到这里，
 * 让 record 页面 / quick-record 组件不再各自复制写流程。
 *
 * 本模块不含任何 UI 副作用（toast / 导航 / loading），调用方负责反馈与跳转。
 */

const Stock = require("../models/stock");
const Transaction = require("../models/transaction");
const PriceCache = require("../models/priceCache");
const { getSellableQuantity } = require("./positionService");

/**
 * 持久化一笔交易（BUY / SELL）。
 * @param {Object} draft
 * @param {Object|null} draft.stock - 已存在的股票实体；为 null 时按 code/market/name 自动创建
 * @param {string} draft.type - BUY | SELL
 * @param {string|number} draft.price
 * @param {string|number} draft.quantity
 * @param {string|number} [draft.fee]
 * @param {string} draft.date - YYYY-MM-DD
 * @param {string} draft.time - HH:mm
 * @param {string} draft.code
 * @param {string} draft.market
 * @param {string} draft.name
 * @param {string} [draft.note]
 * @param {string} [draft.reason]
 * @param {Array} [draft.strategies]
 * @param {boolean} [draft.isEdit]
 * @param {number} [draft.editId]
 * @returns {{ok: boolean, transaction?: Object, stock?: Object, error?: string}}
 */
function persistTransaction(draft) {
	const {
		stock,
		type,
		price,
		quantity,
		fee = 0,
		date,
		time,
		code,
		market,
		name,
		note = "",
		reason = "",
		strategies = [],
		isEdit = false,
		editId = null,
	} = draft;

	if (type === "SELL") {
		const ignoredTransactionId = isEdit ? editId : null;
		const sellableQuantity = getSellableQuantity(stock ? stock.id : null, ignoredTransactionId);
		if (parseInt(quantity, 10) > sellableQuantity) {
			return { ok: false, error: "SELL_EXCEEDS" };
		}
	}

	let targetStock = stock;
	if (!targetStock) {
		targetStock = Stock.create(code, name, market);
		Stock.save(targetStock);
	}

	const priceNum = parseFloat(price);
	if (targetStock?.id && priceNum > 0) {
		PriceCache.set(targetStock.id, priceNum);
	}

	const transaction = Transaction.create(
		targetStock.id,
		type,
		price,
		quantity,
		fee,
		new Date(`${date}T${time}:00`).toISOString(),
		note,
		reason,
		strategies,
	);
	if (isEdit) transaction.id = editId;
	Transaction.save(transaction);
	return { ok: true, transaction, stock: targetStock };
}

module.exports = { persistTransaction };
