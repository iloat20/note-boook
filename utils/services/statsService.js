/**
 * StatsService - 统计数据服务
 */

const Stock = require('../models/stock')
const Transaction = require('../models/transaction')
const Dividend = require('../models/dividend')
const PriceCache = require('../models/priceCache')
const { getStrategyStats: getStrategyStatsFromTransaction } = require('../models/strategy')
const { calcPosition } = require('../helpers/positionCalculator')
const { caches } = require('../cache/cacheManager')

// 周期统计数据缓存

/**
 * 计算指定范围统计数据
 * @param {Array} transactions - 交易记录列表
 * @param {Array} dividends - 分红记录列表
 * @param {Date} startDate - 开始日期
 * @param {Date} endDate - 结束日期
 * @param {string} label - 标签
 * @returns {Object|null} 统计数据
 */
function calcStatsForRange(transactions, dividends, startDate, endDate, label) {
  const periodTrans = transactions.filter(t => {
    const d = new Date(t.date)
    return d >= startDate && d <= endDate
  })
  const periodDivs = dividends.filter(d => {
    const dd = new Date(d.date)
    return dd >= startDate && dd <= endDate
  })
  
  if (periodTrans.length === 0 && periodDivs.length === 0) return null
  
  let buyAmount = 0, sellAmount = 0, buyFee = 0, sellFee = 0
  periodTrans.forEach(t => {
    const amount = t.price * t.quantity
    if (t.type === 'BUY') {
      buyAmount += amount
      buyFee += t.fee
    } else {
      sellAmount += amount
      sellFee += t.fee
    }
  })
  const dividendIncome = periodDivs.reduce((sum, d) => sum + d.totalAmount, 0)
  const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
  
  return {
    label,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    buyAmount: parseFloat(buyAmount.toFixed(2)),
    sellAmount: parseFloat(sellAmount.toFixed(2)),
    buyFee: parseFloat(buyFee.toFixed(2)),
    sellFee: parseFloat(sellFee.toFixed(2)),
    dividendIncome: parseFloat(dividendIncome.toFixed(2)),
    pnL: parseFloat(pnL.toFixed(2))
  }
}

/**
 * 获取总统计数据
 * @returns {Object} 总统计数据
 */
function getTotalStats() {
  let totalInvestment = 0
  let totalBuyFee = 0
  let totalSellFee = 0
  
  // 从交易记录计算投入和手续费
  const transactions = Transaction.getAll()
  transactions.forEach(t => {
    const amount = t.price * t.quantity
    if (t.type === 'BUY') {
      totalInvestment += amount + t.fee
      totalBuyFee += t.fee
    } else {
      totalSellFee += t.fee
    }
  })
  
  // 通过纯函数计算每个持仓，避免依赖 positionService
  const stocks = Stock.getAll()
  const allTx = Transaction.getAll()
  const allDiv = Dividend.getAll()
  
  let txMap = {}, divMap = {}
  allTx.forEach(function (t) {
    if (!txMap[t.stockId]) txMap[t.stockId] = []
    txMap[t.stockId].push(t)
  })
  allDiv.forEach(function (d) {
    if (!divMap[d.stockId]) divMap[d.stockId] = []
    divMap[d.stockId].push(d)
  })
  
  let totalRealizedPnL = 0
  let totalFloatingPnL = 0
  let totalDividendIncome = 0
  
  stocks.forEach(function (s) {
    let tx = txMap[s.id] || []
    let div = divMap[s.id] || []
    let pos = calcPosition(s.id, tx, div, PriceCache.get(s.id))
    totalRealizedPnL += pos.realizedPnL
    totalDividendIncome += pos.dividendIncome
    if (pos.quantity > 0) {
      totalFloatingPnL += pos.floatingPnL
    }
  })
  
  const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome
  const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0
  
  return {
    totalInvestment: parseFloat(totalInvestment.toFixed(2)),
    totalBuyFee: parseFloat(totalBuyFee.toFixed(2)),
    totalSellFee: parseFloat(totalSellFee.toFixed(2)),
    dividendIncome: parseFloat(totalDividendIncome.toFixed(2)),
    realizedPnL: parseFloat(totalRealizedPnL.toFixed(2)),
    floatingPnL: parseFloat(totalFloatingPnL.toFixed(2)),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2))
  }
}

/**
 * 按周期获取统计数据
 * @param {string} period - 周期类型（DAY|WEEK|MONTH|YEAR）
 * @returns {Object} 周期统计数据
 */
function getStatsByPeriod(period) {
  const now = new Date()
  let startDate, endDate
  
  switch (period) {
    case 'DAY':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1)
      break
    case 'WEEK': {
      const dayOfWeek = now.getDay() || 7
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1)
      endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      break
    }
    case 'MONTH':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break
    case 'YEAR':
      startDate = new Date(now.getFullYear(), 0, 1)
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      break
    default:
      startDate = new Date(0)
      endDate = now
  }
  
  const transactions = Transaction.getByDateRange(startDate, endDate)
  const dividends = Dividend.getAll().filter(d => {
    const date = new Date(d.date)
    return date >= startDate && date <= endDate
  })
  
  let buyAmount = 0
  let sellAmount = 0
  let buyFee = 0
  let sellFee = 0
  
  transactions.forEach(t => {
    const amount = t.price * t.quantity
    if (t.type === 'BUY') {
      buyAmount += amount
      buyFee += t.fee
    } else {
      sellAmount += amount
      sellFee += t.fee
    }
  })
  
  const dividendIncome = dividends.reduce((sum, d) => sum + d.totalAmount, 0)
  const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
  
  return {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    buyAmount: parseFloat(buyAmount.toFixed(2)),
    sellAmount: parseFloat(sellAmount.toFixed(2)),
    buyFee: parseFloat(buyFee.toFixed(2)),
    sellFee: parseFloat(sellFee.toFixed(2)),
    dividendIncome: parseFloat(dividendIncome.toFixed(2)),
    pnL: parseFloat(pnL.toFixed(2))
  }
}

/**
 * 获取周期统计数据列表
 * @param {string} periodType - 周期类型（DAY|WEEK|MONTH|YEAR）
 * @param {number} count - 返回数量
 * @returns {Array} 周期统计数据列表
 */
function getPeriodStatsList(periodType, count = 12) {
  // 检查缓存
  const cacheKey = `${periodType}-${count}`
  if (caches.periodStats.has(cacheKey)) {
    return caches.periodStats.get(cacheKey).slice()
  }
  
  const transactions = Transaction.getAll()
  const dividends = Dividend.getAll()
  
  if (transactions.length === 0 && dividends.length === 0) {
    return []
  }
  
  const allDates = [
    ...transactions.map(t => new Date(t.date)),
    ...dividends.map(d => new Date(d.date))
  ].sort((a, b) => a - b)
  
  const firstDate = allDates[0]
  const now = new Date()
  
  const result = []
  let currentStart, currentEnd, label
  
  switch (periodType) {
    case 'WEEK': {
      let weekStart = new Date(firstDate)
      const dayOfWeek = weekStart.getDay() || 7
      weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - dayOfWeek + 1)
      
      while (weekStart <= now) {
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
        const weekLabel = `${weekStart.getFullYear()}W${Math.ceil((weekStart.getDate() + 6) / 7)}`
        
        const item = calcStatsForRange(transactions, dividends, weekStart, weekEnd, weekLabel)
        if (item) result.push(item)
        
        weekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
      break
    }
      
    case 'MONTH': {
      let monthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
      
      while (monthStart <= now) {
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999)
        const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`
        
        const item = calcStatsForRange(transactions, dividends, monthStart, monthEnd, monthLabel)
        if (item) result.push(item)
        
        monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
      }
      break
    }
      
    case 'YEAR': {
      let yearStart = new Date(firstDate.getFullYear(), 0, 1)
      
      while (yearStart <= now) {
        const yearEnd = new Date(yearStart.getFullYear(), 11, 31, 23, 59, 59, 999)
        const yearLabel = `${yearStart.getFullYear()}`
        
        const item = calcStatsForRange(transactions, dividends, yearStart, yearEnd, yearLabel)
        if (item) result.push(item)
        
        yearStart = new Date(yearStart.getFullYear() + 1, 0, 1)
      }
      break
    }
      
    default: {
      let dayStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate())
      
      while (dayStart <= now) {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
        const dayLabel = `${dayStart.getMonth() + 1}/${dayStart.getDate()}`
        
        const item = calcStatsForRange(transactions, dividends, dayStart, dayEnd, dayLabel)
        if (item) result.push(item)
        
        dayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      }
    }
  }
  
  const finalResult = result.slice(-count)
  caches.periodStats.set(cacheKey, finalResult.slice())
  return finalResult
}

/**
 * 获取策略统计数据
 * @param {Array} [transactions] - 可选：指定的交易记录列表，默认使用全部交易
 * @returns {Array} 策略统计数据列表
 */
function getStrategyStats(transactions) {
  const txList = transactions || Transaction.getAll()
  const stats = {}
  txList.forEach(function (t) {
    if (!t.strategies || !t.strategies.length) return
    t.strategies.forEach(function (tag) {
      if (!stats[tag]) stats[tag] = { tag: tag, count: 0, buyAmount: 0, sellAmount: 0 }
      stats[tag].count++
      if (t.type === 'BUY') {
        stats[tag].buyAmount += t.price * t.quantity
      } else {
        stats[tag].sellAmount += t.price * t.quantity
      }
    })
  })
  return Object.values(stats).map(function (s) {
    s.netPnL = parseFloat((s.sellAmount - s.buyAmount).toFixed(2))
    s.buyAmount = parseFloat(s.buyAmount.toFixed(2))
    s.sellAmount = parseFloat(s.sellAmount.toFixed(2))
    return s
  }).sort(function (a, b) { return b.count - a.count })
}

module.exports = {
  calcStatsForRange,
  getTotalStats,
  getStatsByPeriod,
  getPeriodStatsList,
  getStrategyStats
}
