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

// 持仓计算结果缓存

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
  // 过滤掉已有缓存的，只计算缺失的
  const needCalc = stockIds.filter(id => !caches.position.has(id))
  if (needCalc.length === 0) return
  
  // 一次性获取所有数据
  const allTransactions = Transaction.getAll()
  const allDividends = Dividend.getAll()
  
  // 委托给纯函数批量计算
  const results = batchCalcPositions(needCalc, allTransactions, allDividends, function (id) {
    return PriceCache.get(id)
  })
  
  // 写入缓存
  needCalc.forEach(function (stockId) {
    caches.position.set(stockId, results[stockId])
  })
}

/**
 * 获取所有股票的持仓信息（包括已清仓）
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Array} 所有持仓列表
 */
function getAllPositions(forceRefresh = false) {
  const stocks = Stock.getAll()
  const stockIds = stocks.map(s => s.id)
  if (forceRefresh) {
    stockIds.forEach(id => { caches.position.delete(id) })
  }
  batchCalculatePositions(stockIds)

  const positions = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  })

  // 按总盈亏排序
  sortByTotalPnL(positions)
  
  return positions
}

/**
 * 获取组合持仓列表
 * @param {string} market - 市场类型（可选）
 * @returns {Array} 持仓列表
 */
function getPortfolioPositions(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
  const stockIds = stocks.map(s => s.id)
  batchCalculatePositions(stockIds)
  
  const positions = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  }).filter(function (p) {
    return p.quantity > 0 || Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01
  })
  
  // 按总盈亏排序
  sortByTotalPnL(positions)

  return positions
}

/**
 * 获取持仓汇总（按浮动盈亏比例排序）
 * @param {string} market - 市场类型（可选）
 * @returns {Array} 持仓汇总列表
 */
function getPositionSummary(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
  
  // 批量计算持仓，减少重复读取
  const stockIds = stocks.map(s => s.id)
  batchCalculatePositions(stockIds)
  
  const positions = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  }).filter(p => p.quantity > 0)
  
  positions.sort((a, b) => {
    const aRatio = a.avgCost > 0 && a.quantity > 0 ? a.floatingPnL / (a.avgCost * a.quantity) : 0
    const bRatio = b.avgCost > 0 && b.quantity > 0 ? b.floatingPnL / (b.avgCost * b.quantity) : 0
    return bRatio - aRatio
  })
  
  return positions
}

/**
 * 获取已清仓持仓列表
 * @returns {Array} 已清仓持仓列表
 */
function getClearedPositions() {
  const stocks = Stock.getAll()
  
  // 批量计算持仓
  const stockIds = stocks.map(s => s.id)
  batchCalculatePositions(stockIds)
  
  const cleared = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  }).filter(p => p.quantity === 0 && (Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01))
  
  cleared.sort((a, b) => (b.realizedPnL + b.dividendIncome) - (a.realizedPnL + a.dividendIncome))
  
  return cleared
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
