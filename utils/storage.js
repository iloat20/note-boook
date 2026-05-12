const { MARKETS, TRANSACTION_TYPE } = require('./constants')
const { validateStockCode, formatStockCode } = require('./market.js')

// 持仓计算结果缓存，数据变更时由 markDataDirty 清空
let _positionCache = {}
let _heatmapCache = {}

function markDataDirty() {
  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.dataDirty = true
    }
  } catch (e) {
    console.warn('[markDataDirty]', e)
  }
  _positionCache = {}
  _heatmapCache = {}
}

const STOCK_KEY = 'stock_trade_stocks'
const TRANSACTION_KEY = 'stock_trade_transactions'
const DIVIDEND_KEY = 'stock_trade_dividends'
const PRICE_KEY = 'stock_trade_prices'

let _lastTimestamp = 0
let _seq = 0

function getNextId() {
  const now = Date.now()
  if (now === _lastTimestamp) {
    _seq++
  } else {
    _lastTimestamp = now
    _seq = 0
  }
  return now * 1000 + _seq
}

function saveData(key, data) {
  wx.setStorageSync(key, data)
}

function getData(key) {
  return wx.getStorageSync(key) || []
}

const Stock = {
  create(code, name, market) {
    return {
      id: getNextId(),
      code,
      name,
      market,
      createdAt: new Date().toISOString()
    }
  },
  
  save(stock) {
    const stocks = this.getAll()
    const index = stocks.findIndex(s => s.id === stock.id)
    if (index >= 0) {
      stocks[index] = stock
    } else {
      stocks.push(stock)
    }
    saveData(STOCK_KEY, stocks)
    markDataDirty()
    return stock
  },
  
  getAll() {
    return getData(STOCK_KEY)
  },
  
  getById(id) {
    const stocks = this.getAll()
    return stocks.find(s => s.id === id)
  },
  
  getByCode(code, market) {
    const stocks = this.getAll()
    return stocks.find(s => s.code === code && s.market === market)
  },
  
  delete(id) {
    const stocks = this.getAll().filter(s => s.id !== id)
    saveData(STOCK_KEY, stocks)
    markDataDirty()
  },
  
  getByMarket(market) {
    return this.getAll().filter(s => s.market === market)
  }
}

const Transaction = {
  create(stockId, type, price, quantity, fee, date, note = '') {
    return {
      id: getNextId(),
      stockId,
      type,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      fee: parseFloat(fee),
      date: date instanceof Date ? date.toISOString() : date,
      note
    }
  },
  
  save(transaction) {
    const transactions = this.getAll()
    const index = transactions.findIndex(t => t.id === transaction.id)
    if (index >= 0) {
      transactions[index] = transaction
    } else {
      transactions.push(transaction)
    }
    saveData(TRANSACTION_KEY, transactions)
    markDataDirty()
    return transaction
  },
  
  getAll() {
    return getData(TRANSACTION_KEY)
  },
  
  getByStockId(stockId) {
    return this.getAll().filter(t => t.stockId === stockId).sort((a, b) => new Date(b.date) - new Date(a.date))
  },
  
  delete(id) {
    const transactions = this.getAll().filter(t => t.id !== id)
    saveData(TRANSACTION_KEY, transactions)
    markDataDirty()
  },
  
  getByMarket(market) {
    const stocks = Stock.getByMarket(market)
    const stockIds = stocks.map(s => s.id)
    return this.getAll().filter(t => stockIds.includes(t.stockId))
  },
  
  getByDateRange(startDate, endDate) {
    return this.getAll().filter(t => {
      const date = new Date(t.date)
      return date >= startDate && date <= endDate
    })
  }
}

const Dividend = {
  create(stockId, perShareAmount, quantity, date, note = '', type = 'CASH', shareQuantity = 0) {
    const totalAmount = type === 'CASH'
      ? parseFloat(perShareAmount) * parseInt(quantity)
      : 0
    return {
      id: getNextId(),
      stockId,
      perShareAmount: parseFloat(perShareAmount),
      quantity: parseInt(quantity),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      date: date instanceof Date ? date.toISOString() : date,
      note,
      type: type || 'CASH',
      shareQuantity: parseInt(shareQuantity) || 0
    }
  },
  
  save(dividend) {
    const dividends = this.getAll()
    const index = dividends.findIndex(d => d.id === dividend.id)
    if (index >= 0) {
      dividends[index] = dividend
    } else {
      dividends.push(dividend)
    }
    saveData(DIVIDEND_KEY, dividends)
    markDataDirty()
    return dividend
  },
  
  getAll() {
    return getData(DIVIDEND_KEY)
  },
  
  getByStockId(stockId) {
    return this.getAll().filter(d => d.stockId === stockId).sort((a, b) => new Date(b.date) - new Date(a.date))
  },
  
  delete(id) {
    const dividends = this.getAll().filter(d => d.id !== id)
    saveData(DIVIDEND_KEY, dividends)
    markDataDirty()
  },
  
  getByMarket(market) {
    const stocks = Stock.getByMarket(market)
    const stockIds = stocks.map(s => s.id)
    return this.getAll().filter(d => stockIds.includes(d.stockId))
  }
}

const PriceCache = {
  set(stockId, price) {
    const prices = this.getAll()
    prices[stockId] = parseFloat(price)
    saveData(PRICE_KEY, prices)
    // 价格变更，清除该股票的持仓缓存
    if (_positionCache && _positionCache[stockId]) {
      delete _positionCache[stockId]
    }
  },
  
  get(stockId) {
    const prices = this.getAll()
    return prices[stockId] || null
  },
  
  getAll() {
    return getData(PRICE_KEY) || {}
  }
}

function calculatePosition(stockId) {
  if (_positionCache[stockId]) {
    return _positionCache[stockId]
  }

  const transactions = Transaction.getByStockId(stockId)
  let totalBuyQuantity = 0
  let totalBuyAmount = 0
  let totalSellQuantity = 0
  let totalSellAmount = 0
  let totalBuyFee = 0
  let totalSellFee = 0

  transactions.forEach(t => {
    if (t.type === TRANSACTION_TYPE.BUY) {
      totalBuyQuantity += t.quantity
      totalBuyAmount += t.price * t.quantity
      totalBuyFee += t.fee
    } else {
      totalSellQuantity += t.quantity
      totalSellAmount += t.price * t.quantity
      totalSellFee += t.fee
    }
  })

  // 处理分红（现金 + 送股）
  const dividends = Dividend.getByStockId(stockId)
  let dividendIncome = 0
  let shareDividendQty = 0
  dividends.forEach(function (d) {
    if (d.type === 'SHARE') {
      shareDividendQty += d.shareQuantity || 0
    } else {
      dividendIncome += d.totalAmount
    }
  })

  const positionQuantity = totalBuyQuantity + shareDividendQty - totalSellQuantity
  const avgCost = totalBuyQuantity > 0 ? (totalBuyAmount + totalBuyFee) / totalBuyQuantity : 0

  const realizedPnL = totalBuyQuantity > 0
    ? totalSellAmount - totalSellFee - avgCost * totalSellQuantity
    : totalSellAmount - totalSellFee

  const currentPrice = PriceCache.get(stockId)
  const floatingPnL = currentPrice && positionQuantity > 0 ? (currentPrice - avgCost) * positionQuantity : 0

  const result = {
    stockId,
    quantity: positionQuantity,
    avgCost: parseFloat(avgCost.toFixed(4)),
    realizedPnL: parseFloat(realizedPnL.toFixed(2)),
    dividendIncome: parseFloat(dividendIncome.toFixed(2)),
    currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
    floatingPnL: parseFloat(floatingPnL.toFixed(2)),
    totalPnL: parseFloat((realizedPnL + floatingPnL + dividendIncome).toFixed(2))
  }
  _positionCache[stockId] = result
  return result
}

function getPositionSummary(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
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

function getAllPositionsWithRealizedPnL(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
  const positions = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  }).filter(p => Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01)
  
  positions.sort((a, b) => b.realizedPnL + b.dividendIncome - (a.realizedPnL + a.dividendIncome))
  
  return positions
}

function getTotalStats() {
  const transactions = Transaction.getAll()
  const dividends = Dividend.getAll()
  
  let totalInvestment = 0
  let totalRecover = 0
  let totalBuyFee = 0
  let totalSellFee = 0
  
  transactions.forEach(t => {
    const amount = t.price * t.quantity
    if (t.type === TRANSACTION_TYPE.BUY) {
      totalInvestment += amount + t.fee
      totalBuyFee += t.fee
    } else {
      totalRecover += amount - t.fee
      totalSellFee += t.fee
    }
  })
  
  const dividendIncome = dividends.reduce((sum, d) => sum + d.totalAmount, 0)
  
  const positions = Stock.getAll().map(s => calculatePosition(s.id))
  const totalFloatingPnL = positions.reduce((sum, p) => sum + p.floatingPnL, 0)
  const realizedPnL = totalRecover - totalInvestment + totalBuyFee - totalSellFee
  const totalPnL = realizedPnL + totalFloatingPnL + dividendIncome
  const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0
  
  return {
    totalInvestment: parseFloat(totalInvestment.toFixed(2)),
    totalRecover: parseFloat(totalRecover.toFixed(2)),
    totalBuyFee: parseFloat(totalBuyFee.toFixed(2)),
    totalSellFee: parseFloat(totalSellFee.toFixed(2)),
    dividendIncome: parseFloat(dividendIncome.toFixed(2)),
    realizedPnL: parseFloat(realizedPnL.toFixed(2)),
    floatingPnL: parseFloat(totalFloatingPnL.toFixed(2)),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2))
  }
}

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
    if (t.type === TRANSACTION_TYPE.BUY) {
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
    if (t.type === TRANSACTION_TYPE.BUY) {
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

function getPeriodStatsList(periodType, count = 12) {
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
      let weekCount = 0
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
  
  return result.slice(-count)
}

function getHeatmapData(year, month) {
  const cacheKey = year + '-' + month
  if (_heatmapCache[cacheKey]) return _heatmapCache[cacheKey]

  const transactions = Transaction.getAll()
  const dividends = Dividend.getAll()

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)

  const dayMap = {}
  for (let d = 1; d <= 31; d++) {
    dayMap[d] = { count: 0, amount: 0 }
  }

  transactions.forEach(t => {
    const date = new Date(t.date)
    if (date >= startDate && date <= endDate) {
      const day = date.getDate()
      if (dayMap[day]) {
        dayMap[day].count++
        dayMap[day].amount += t.price * t.quantity
      }
    }
  })

  dividends.forEach(d => {
    const date = new Date(d.date)
    if (date >= startDate && date <= endDate) {
      const day = date.getDate()
      if (dayMap[day]) {
        dayMap[day].count++
        dayMap[day].amount += d.totalAmount
      }
    }
  })

  const result = []
  for (let day = 1; day <= 31; day++) {
    const data = dayMap[day]
    let level = 0
    if (data.count === 1) level = 1
    else if (data.count >= 2 && data.count <= 3) level = 2
    else if (data.count >= 4 && data.count <= 5) level = 3
    else if (data.count > 5) level = 4
    result.push({
      day,
      count: data.count,
      amount: parseFloat(data.amount.toFixed(2)),
      level
    })
  }

  _heatmapCache[cacheKey] = result
  return result
}

function getPositionDistribution() {
  const positions = getPositionSummary()
  const result = []
  positions.forEach(function (p) {
    const mv = p.quantity * (p.currentPrice || p.avgCost || 0)
    if (mv > 0) {
      result.push({ name: p.name, value: parseFloat(mv.toFixed(2)) })
    }
  })
  return result
}

function getPieChartData(period) {
  const stats = getStatsByPeriod(period)
  const items = [
    { name: '买入金额', value: stats.buyAmount },
    { name: '卖出金额', value: stats.sellAmount },
    { name: '买入手续费', value: stats.buyFee },
    { name: '卖出手续费', value: stats.sellFee },
    { name: '分红收益', value: stats.dividendIncome }
  ]
  return items.filter(function (it) { return it.value > 0 })
}

function getScatterData() {
  const stocks = Stock.getAll()
  const result = []
  stocks.forEach(function (s) {
    const pos = calculatePosition(s.id)
    if (pos.quantity > 0 || Math.abs(pos.realizedPnL) > 0.01) {
      const cost = pos.avgCost || 1
      const price = pos.currentPrice || cost
      const ret = cost > 0 ? (price - cost) / cost * 100 : 0
      result.push({
        name: s.name,
        value: [cost, price, pos.floatingPnL || 0],
        returnRate: parseFloat(ret.toFixed(2))
      })
    }
  })
  return result
}

function getMixedChartData(periodType, count) {
  count = count || 12
  const list = getPeriodStatsList(periodType, count)
  const barData = []
  const lineData = []
  const labels = []
  var cumulative = 0

  list.forEach(function (item) {
    barData.push(item.pnL || 0)
    cumulative += (item.pnL || 0)
    lineData.push(parseFloat(cumulative.toFixed(2)))
    labels.push(item.label)
  })

  return { labels: labels, barData: barData, lineData: lineData }
}

/**
 * 市场分布（A股/港股/美股）- 用于饼图
 */
function getMarketDistribution() {
  const positions = getPositionSummary()
  var marketMap = {}
  positions.forEach(function (p) {
    var market = p.market || 'UNKNOWN'
    var mv = p.quantity * (p.currentPrice || p.avgCost || 0)
    if (mv > 0) {
      marketMap[market] = (marketMap[market] || 0) + mv
    }
  })
  var result = []
  for (var m in marketMap) {
    var label = m === 'SH' || m === 'SZ' ? 'A股' : m === 'HK' ? '港股' : m === 'US' ? '美股' : m
    result.push({ name: label, value: parseFloat(marketMap[m].toFixed(2)) })
  }
  return result
}

/**
 * 胜率分析 - 返回胜率、平均盈利、平均亏损、盈亏比
 */
function getWinRateAnalysis() {
  var positions = getAllPositionsWithRealizedPnL()
  var winCount = 0, lossCount = 0, totalWin = 0, totalLoss = 0
  positions.forEach(function (p) {
    var ret = p.realizedPnL + (p.dividendIncome || 0)
    if (ret > 0) { winCount++; totalWin += ret }
    else if (ret < 0) { lossCount++; totalLoss += Math.abs(ret) }
  })
  var total = winCount + lossCount
  return {
    winCount: winCount,
    lossCount: lossCount,
    winRate: total > 0 ? parseFloat((winCount / total * 100).toFixed(2)) : 0,
    avgWin: winCount > 0 ? parseFloat((totalWin / winCount).toFixed(2)) : 0,
    avgLoss: lossCount > 0 ? parseFloat((totalLoss / lossCount).toFixed(2)) : 0,
    profitLossRatio: lossCount > 0 ? parseFloat((totalWin / lossCount).toFixed(2)) : 0
  }
}

/**
 * 月度交易量 - 最近 count 个月的买入/卖出金额，用于柱状图
 */
function getMonthlyTradingVolume(count) {
  count = count || 12
  var now = new Date()
  var labels = [], buyData = [], sellData = []
  for (var i = count - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    var start = new Date(d.getFullYear(), d.getMonth(), 1)
    var end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    var txs = Transaction.getByDateRange(start, end)
    var buy = 0, sell = 0
    txs.forEach(function (t) {
      if (t.type === TRANSACTION_TYPE.BUY) buy += t.price * t.quantity
      else sell += t.price * t.quantity
    })
    labels.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
    buyData.push(parseFloat(buy.toFixed(2)))
    sellData.push(parseFloat(sell.toFixed(2)))
  }
  return { labels: labels, buyData: buyData, sellData: sellData }
}

/**
 * 持仓集中度 - Herfindahl 指数 + Top5 持仓占比
 */
function getPositionConcentration() {
  var positions = getPositionSummary()
  var totalMV = 0
  var items = positions.map(function (p) {
    var mv = p.quantity * (p.currentPrice || p.avgCost || 0)
    totalMV += mv
    return { name: p.name, mv: mv }
  }).filter(function (it) { return it.mv > 0 })

  if (totalMV === 0) return { herfindahl: 0, top5Ratio: 0, items: [] }

  // Herfindahl 指数：Σ(占比^2)，越接近1越集中
  var h = 0
  items.forEach(function (it) { h += Math.pow(it.mv / totalMV, 2) })

  // Top5 占比
  items.sort(function (a, b) { return b.mv - a.mv })
  var top5MV = 0
  var top5 = items.slice(0, 5)
  top5.forEach(function (it) { top5MV += it.mv })

  return {
    herfindahl: parseFloat(h.toFixed(4)),
    top5Ratio: parseFloat((top5MV / totalMV * 100).toFixed(2)),
    items: items.map(function (it) {
      return { name: it.name, ratio: parseFloat((it.mv / totalMV * 100).toFixed(2)) }
    })
  }
}

module.exports = {
  MARKETS,
  TRANSACTION_TYPE,
  Stock,
  Transaction,
  Dividend,
  PriceCache,
  calculatePosition,
  getPositionSummary,
  getAllPositionsWithRealizedPnL,
  getTotalStats,
  getStatsByPeriod,
  getPeriodStatsList,
  getHeatmapData,
  getPositionDistribution,
  getPieChartData,
  getScatterData,
  getMixedChartData,
  getMarketDistribution,
  getWinRateAnalysis,
  getMonthlyTradingVolume,
  getPositionConcentration
}
