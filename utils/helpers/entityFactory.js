/**
 * entityFactory.js — 纯实体工厂函数
 *
 * 职责：验证输入 + 创建实体对象。
 * 不依赖 wx storage、缓存、ID 生成器。
 * ID 由调用方传入，便于测试和复用。
 */

let VALID_MARKETS = { A_SHARE: 1, HK_SHARE: 1, US_SHARE: 1 }
let VALID_TX_TYPES = { BUY: 1, SELL: 1 }
let VALID_DIV_TYPES = { CASH: 1, SHARE: 1 }

/**
 * 创建股票实体
 * @param {string} code - 股票代码
 * @param {string} name - 股票名称
 * @param {string} market - 市场类型（A_SHARE|HK_SHARE|US_SHARE）
 * @param {number} id - 唯一 ID
 * @returns {Object}
 */
function createStock(code, name, market, id) {
  if (!code || typeof code !== 'string') throw makeError('Stock', 'code is required')
  if (!name || typeof name !== 'string') throw makeError('Stock', 'name is required')
  if (!VALID_MARKETS[market]) throw makeError('Stock', 'invalid market: ' + market)

  return {
    id: id,
    code: code.trim(),
    name: name.trim(),
    market: market,
    createdAt: new Date().toISOString()
  }
}

/**
 * 创建交易记录实体
 * @param {number} stockId
 * @param {string} type - BUY|SELL
 * @param {number|string} price
 * @param {number|string} quantity
 * @param {number|string} fee
 * @param {Date|string} date
 * @param {string} [note]
 * @param {string} [reason]
 * @param {Array} [strategies]
 * @param {number} id
 * @returns {Object}
 */
function createTransaction(stockId, type, price, quantity, fee, date, note, reason, strategies, id) {
  if (!stockId || stockId <= 0) throw makeError('Transaction', 'invalid stockId')
  if (!VALID_TX_TYPES[type]) throw makeError('Transaction', 'invalid type: ' + type)
  if (price == null || isNaN(parseFloat(price)) || parseFloat(price) <= 0) throw makeError('Transaction', 'price must be positive')
  
  var qty = parseInt(quantity, 10)
  if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) throw makeError('Transaction', 'quantity must be positive integer, got: ' + JSON.stringify(quantity))
  
  var feeNum = parseFloat(fee)
  if (isNaN(feeNum) || feeNum < 0) throw makeError('Transaction', 'fee must be >= 0')

  var dateStr = date instanceof Date ? date.toISOString() : String(date)
  if (!dateStr || isNaN(new Date(dateStr).getTime())) throw makeError('Transaction', 'invalid date')

  return {
    id: id,
    stockId: stockId,
    type: type,
    price: parseFloat(price),
    quantity: qty,
    fee: feeNum,
    date: dateStr,
    note: note || '',
    reason: reason || '',
    strategies: Array.isArray(strategies) ? strategies : []
  }
}

/**
 * 创建分红实体
 * @param {number} stockId
 * @param {number|string} perShareAmount
 * @param {number|string} quantity
 * @param {Date|string} date
 * @param {string} [note]
 * @param {string} [type] - CASH|SHARE
 * @param {number|string} [shareQuantity]
 * @param {number} id
 * @returns {Object}
 */
function createDividend(stockId, perShareAmount, quantity, date, note, type, shareQuantity, id) {
  if (!stockId || stockId <= 0) throw makeError('Dividend', 'invalid stockId')
  if (perShareAmount == null || isNaN(parseFloat(perShareAmount)) || parseFloat(perShareAmount) < 0) throw makeError('Dividend', 'perShareAmount must be >= 0')
  
  var qty = parseInt(quantity, 10)
  if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) throw makeError('Dividend', 'quantity must be positive integer, got: ' + JSON.stringify(quantity))

  var divType = type || 'CASH'
  if (!VALID_DIV_TYPES[divType]) throw makeError('Dividend', 'invalid type: ' + divType)

  var dateStr = date instanceof Date ? date.toISOString() : String(date)
  if (!dateStr || isNaN(new Date(dateStr).getTime())) throw makeError('Dividend', 'invalid date')

  var shareQty = parseInt(shareQuantity, 10) || 0
  var totalAmount = divType === 'CASH' ? parseFloat(perShareAmount) * qty : 0

  return {
    id: id,
    stockId: stockId,
    perShareAmount: parseFloat(perShareAmount),
    quantity: qty,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    date: dateStr,
    note: note || '',
    type: divType,
    shareQuantity: shareQty
  }
}

function makeError(model, msg) {
  return new Error('[' + model + '] ' + msg)
}

module.exports = {
  createStock,
  createTransaction,
  createDividend
}
