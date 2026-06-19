/**
 * PositionService - 持仓计算服务
 */

const Stock = require('../models/stock')
const Transaction = require('../models/transaction')
const Dividend = require('../models/dividend')
const PriceCache = require('../models/priceCache')
const { calcPosition, batchCalcPositions } = require('../helpers/positionCalculator')
const { sortByTotalPnL } = require('../helpers/sortHelpers')
const { caches } = require('../cache/cacheManager')

/**
 * 计算指定股票的持仓信息（带缓存）
 * @param {number} stockId - 股票 ID
 * @returns {Object} 持仓信息
 */
function calculatePosition(stockId) {
  if (caches.position.has(stockId)) {
    return caches.position.get(stockId)
  }
  
  const transactions = Transaction.getByStockId(stockId)
  const dividends = Dividend.getByStockId(stockId)
  const currentPrice = PriceCache.get(stockId)
  const result = calcPosition(stockId, transactions, dividends, currentPrice)
  
  caches.position.set(stockId, result)
  return result
}

/**
 * 获取可卖出数量
 * @param {number} stockId - 股票 ID
 * @param {number} ignoredTransactionId - 忽略的交易 ID（编辑时）
 * @returns {number} 可卖出数量
 */
function getSellableQuantity(stockId, ignoredTransactionId) {
  const transactions = Transaction.getByStockId(stockId)
  const dividends = Dividend.getByStockId(stockId)
  let buyQuantity = 0
  let sellQuantity = 0
  let shareDividendQty = 0

  transactions.forEach(function (t) {
    if (ignoredTransactionId && t.id === ignoredTransactionId) return
    if (t.type === 'BUY') {
      buyQuantity += t.quantity || 0
    } else {
      sellQuantity += t.quantity || 0
    }
  })

  dividends.forEach(function (d) {
    if (d.type === 'SHARE') shareDividendQty += d.shareQuantity || 0
  })

  return buyQuantity + shareDividendQty - sellQuantity
}

/**
 * 批量计算多个股票的持仓，避免重复读取和过滤
 * @param {Array} stockIds - 股票 ID 数组
 */
function batchCalculatePositions(stockIds) {
  const needCalc = stockIds.filter(id => !caches.position.has(id))
  if (needCalc.length === 0) return
  
  const allTransactions = Transaction.getAll()
  const allDividends = Dividend.getAll()
  
  const results = batchCalcPositions(needCalc, allTransactions, allDividends, function (id) {
    return PriceCache.get(id)
  })
  
  needCalc.forEach(function (stockId) {
    caches.position.set(stockId, results[stockId])
  })
}

/**
 * 辅助函数：将股票数组与持仓合并
 * @param {Array} stocks - 股票数组
 * @param {Function} filterFn - 过滤函数（可选）
 * @param {Function} sortFn - 排序函数（可选）
 * @returns {Array} 合并后的持仓数组
 */
function mergePositions(stocks, filterFn, sortFn) {
  var stockIds = stocks.map(s => s.id)
  var allTransactions = Transaction.getAll()
  var allDividends = Dividend.getAll()

  var needCalc = stockIds.filter(id => !caches.position.has(id))
  if (needCalc.length > 0) {
    var results = batchCalcPositions(needCalc, allTransactions, allDividends, function (id) {
      return PriceCache.get(id)
    })
    needCalc.forEach(function (stockId) {
      caches.position.set(stockId, results[stockId])
    })
  }

  var positions = stocks.map(stock => {
    var pos = caches.position.get(stock.id)
    if (!pos) {
      var tx = allTransactions.filter(t => t.stockId === stock.id)
      var div = allDividends.filter(d => d.stockId === stock.id)
      var price = PriceCache.get(stock.id)
      pos = calcPosition(stock.id, tx, div, price)
      caches.position.set(stock.id, pos)
    }
    return Object.assign({}, stock, pos)
  })

  if (filterFn) positions = positions.filter(filterFn)
  if (sortFn) positions.sort(sortFn)

  return positions
}

/**
 * 获取所有股票的持仓信息（包括已清仓）
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Array} 所有持仓列表
 */
function getAllPositions(forceRefresh) {
  forceRefresh = forceRefresh || false
  var stocks = Stock.getAll()
  if (forceRefresh) {
    caches.position.clear()
  }

  return sortByTotalPnL(mergePositions(stocks))
}

/**
 * 获取组合持仓列表
 * @param {string} market - 市场类型（可选）
 * @returns {Array} 持仓列表
 */
function getPortfolioPositions(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
  
  return sortByTotalPnL(mergePositions(
    stocks,
    function (p) {
      return p.quantity > 0 || Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01
    }
  ))
}

/**
 * 获取持仓汇总（按浮动盈亏百分比排序）
 * @param {string} market - 市场类型（可选）
 * @returns {Array} 持仓汇总列表
 */
function getPositionSummary(market) {
  var stocks = market ? Stock.getByMarket(market) : Stock.getAll()

  return mergePositions(
    stocks,
    function (p) { return p.quantity > 0 },
    function (a, b) {
      var aRatio = a.avgCost > 0 && a.quantity > 0 ? a.floatingPnL / (a.avgCost * a.quantity) : 0
      var bRatio = b.avgCost > 0 && b.quantity > 0 ? b.floatingPnL / (b.avgCost * b.quantity) : 0
      return bRatio - aRatio
    }
  )
}

/**
 * 获取已清仓持仓列表
 * @returns {Array} 已清仓持仓列表
 */
function getClearedPositions() {
  const stocks = Stock.getAll()
  
  return mergePositions(
    stocks,
    p => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01),
    (a, b) => (b.realizedPnL + b.dividendIncome) - (a.realizedPnL + a.dividendIncome)
  )
}

module.exports = {
  calculatePosition,
  getSellableQuantity,
  batchCalculatePositions,
  getAllPositions,
  getPortfolioPositions,
  getPositionSummary,
  getClearedPositions
}
