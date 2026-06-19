/**
 * positionCalculator.js — 持仓计算纯函数
 *
 * 无缓存、无副作用、不依赖任何模型或服务。
 * 调用方负责传入完整数据。
 */

/**
 * 计算单只股票的持仓信息
 * @param {number} stockId
 * @param {Array} transactions - 该股票的交易记录
 * @param {Array} dividends - 该股票的分红记录
 * @param {number|null} currentPrice - 当前价格
 * @returns {Object} 持仓信息
 */
function calcPosition(stockId, transactions, dividends, currentPrice) {
  let totalBuyQuantity = 0
  let totalBuyAmount = 0
  let totalSellQuantity = 0
  let totalSellAmount = 0
  let totalBuyFee = 0
  let totalSellFee = 0

  transactions.forEach(function (t) {
    if (t.type === 'BUY') {
      totalBuyQuantity += t.quantity
      totalBuyAmount += t.price * t.quantity
      totalBuyFee += t.fee
    } else {
      totalSellQuantity += t.quantity
      totalSellAmount += t.price * t.quantity
      totalSellFee += t.fee
    }
  })

  let dividendIncome = 0
  let shareDividendQty = 0
  dividends.forEach(function (d) {
    if (d.type === 'SHARE') {
      shareDividendQty += d.shareQuantity || 0
    } else {
      dividendIncome += d.totalAmount
    }
  })

  let positionQuantity = totalBuyQuantity + shareDividendQty - totalSellQuantity
  let avgCost = totalBuyQuantity > 0
    ? (totalBuyAmount + totalBuyFee) / totalBuyQuantity
    : 0

  let realizedPnL = totalBuyQuantity > 0
    ? totalSellAmount - totalSellFee - avgCost * totalSellQuantity
    : totalSellAmount - totalSellFee

  let floatingPnL = (currentPrice != null && currentPrice > 0 && positionQuantity > 0)
    ? (currentPrice - avgCost) * positionQuantity
    : 0

  function r2(v) { return Math.round(v * 100) / 100 }
  function r4(v) { return Math.round(v * 10000) / 10000 }

  return {
    stockId: stockId,
    quantity: positionQuantity,
    avgCost: avgCost ? r4(avgCost) : 0,
    realizedPnL: r2(realizedPnL),
    dividendIncome: r2(dividendIncome),
    currentPrice: currentPrice != null && currentPrice > 0 ? r2(currentPrice) : null,
    floatingPnL: r2(floatingPnL),
    totalPnL: r2(realizedPnL + floatingPnL + dividendIncome)
  }
}

/**
 * 批量计算多个股票的持仓
 * @param {number[]} stockIds - 股票 ID 数组
 * @param {Array} allTransactions - 全部交易记录
 * @param {Array} allDividends - 全部分红记录
 * @param {Function} priceGetter - (stockId) => number|null 获取价格
 * @returns {Object} { stockId: result, ... } 映射
 */
function batchCalcPositions(stockIds, allTransactions, allDividends, priceGetter) {
  // 按 stockId 分组
  let txMap = {}
  let divMap = {}

  allTransactions.forEach(function (t) {
    if (!txMap[t.stockId]) txMap[t.stockId] = []
    txMap[t.stockId].push(t)
  })

  allDividends.forEach(function (d) {
    if (!divMap[d.stockId]) divMap[d.stockId] = []
    divMap[d.stockId].push(d)
  })

  let results = {}
  stockIds.forEach(function (stockId) {
    let tx = txMap[stockId] || []
    let div = divMap[stockId] || []
    let price = typeof priceGetter === 'function' ? priceGetter(stockId) : null
    results[stockId] = calcPosition(stockId, tx, div, price)
  })

  return results
}

/**
 * 计算浮动盈亏百分比
 * @param {Object} position - 持仓对象，包含 floatingPnL, avgCost, quantity 字段
 * @returns {string} 百分比字符串，如 "5.23" 或 "0.00"
 */
function calcFloatingPercent(position) {
  if (position.quantity > 0 && position.avgCost > 0) {
    return ((position.floatingPnL / (position.avgCost * position.quantity)) * 100).toFixed(2)
  }
  return '0.00'
}

module.exports = { calcPosition, batchCalcPositions, calcFloatingPercent }
