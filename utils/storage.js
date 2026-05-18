const { MARKETS, TRANSACTION_TYPE, DEFAULT_STRATEGIES } = require('./constants')
const { validateStockCode, formatStockCode } = require('./market.js')

// 持仓计算结果缓存，数据变更时由 markDataDirty 清空
// 使用 Map 实现 LRU 缓存（访问时移到末尾，淘汰时删除第一个）
let _positionCache = new Map()
let _heatmapCache = new Map()
let _periodStatsCache = new Map()

// 缓存配置
const MAX_POSITION_CACHE = 100
const MAX_HEATMAP_CACHE = 50

function _clearExpiredCache() {
  // 清理 _positionCache（LRU 策略）
  while (_positionCache.size > MAX_POSITION_CACHE) {
    const oldestKey = _positionCache.keys().next().value
    _positionCache.delete(oldestKey)
  }
  
  // 清理 _heatmapCache
  while (_heatmapCache.size > MAX_HEATMAP_CACHE) {
    const oldestKey = _heatmapCache.keys().next().value
    _heatmapCache.delete(oldestKey)
  }
}

// 清除内存缓存，释放内存
function clearMemCache() {
  _memCache.clear()
}

function markDataDirty() {
  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.dataDirty = true
    }
  } catch (e) {
    console.warn('[markDataDirty]', e)
  }
  _positionCache.clear()
  _heatmapCache.clear()
  _periodStatsCache.clear()
}

const STOCK_KEY = 'stock_trade_stocks'
const TRANSACTION_KEY = 'stock_trade_transactions'
const DIVIDEND_KEY = 'stock_trade_dividends'
const PRICE_KEY = 'stock_trade_prices'
const STRATEGY_KEY = 'stock_trade_strategies'

// 内存缓存，避免频繁读取本地存储
// 使用 LRU 策略，防止缓存无限增长
const MAX_MEM_CACHE = 50
let _memCache = new Map()
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
  // LRU: 删除后重新插入，保证最近使用的在末尾
  _memCache.delete(key)
  _memCache.set(key, data)
  _evictIfNeeded()
}

function getData(key) {
  if (_memCache.has(key)) {
    // LRU: 移到末尾
    const val = _memCache.get(key)
    _memCache.delete(key)
    _memCache.set(key, val)
    return val
  }
  let data = wx.getStorageSync(key)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    // 如果是价格缓存，返回对象而不是数组
    if (key === PRICE_KEY) {
      data = {}
    } else {
      data = []
    }
  }
  _memCache.set(key, data)
  _evictIfNeeded()
  return data
}

// LRU 淘汰：超过上限时删除最久未使用的条目
function _evictIfNeeded() {
  while (_memCache.size > MAX_MEM_CACHE) {
    const oldestKey = _memCache.keys().next().value
    _memCache.delete(oldestKey)
  }
}

// 返回数据的浅拷贝，防止外部修改污染缓存
function getDataCopy(key) {
  const data = getData(key)
  if (Array.isArray(data)) return data.slice()
  if (typeof data === 'object' && data !== null) return Object.assign({}, data)
  return data
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
  create(stockId, type, price, quantity, fee, date, note = '', reason = '', strategies = []) {
    return {
      id: getNextId(),
      stockId,
      type,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      fee: parseFloat(fee),
      date: date instanceof Date ? date.toISOString() : date,
      note,
      reason,
      strategies: Array.isArray(strategies) ? strategies : []
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
    return this.getAll().filter(t => t.stockId === stockId).sort((a, b) => b.date > a.date ? 1 : b.date < a.date ? -1 : 0)
  },

  delete(id) {
    const transactions = this.getAll().filter(t => t.id !== id)
    saveData(TRANSACTION_KEY, transactions)
    markDataDirty()
  },

  deleteByStockId(stockId) {
    const transactions = this.getAll().filter(t => t.stockId !== stockId)
    saveData(TRANSACTION_KEY, transactions)
    markDataDirty()
  },

  getByMarket(market) {
    const stocks = Stock.getByMarket(market)
    const stockIdSet = new Set(stocks.map(s => s.id))
    return this.getAll().filter(t => stockIdSet.has(t.stockId))
  },

  getByStrategy(tag) {
    return this.getAll().filter(t => t.strategies && t.strategies.includes(tag))
  },

  getByDateRange(startDate, endDate) {
    const start = startDate.toISOString()
    const end = endDate.toISOString()
    return this.getAll().filter(t => t.date >= start && t.date <= end)
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
    return this.getAll().filter(d => d.stockId === stockId).sort((a, b) => b.date > a.date ? 1 : b.date < a.date ? -1 : 0)
  },

  delete(id) {
    const dividends = this.getAll().filter(d => d.id !== id)
    saveData(DIVIDEND_KEY, dividends)
    markDataDirty()
  },

  deleteByStockId(stockId) {
    const dividends = this.getAll().filter(d => d.stockId !== stockId)
    saveData(DIVIDEND_KEY, dividends)
    markDataDirty()
  },

  getByMarket(market) {
    const stocks = Stock.getByMarket(market)
    const stockIdSet = new Set(stocks.map(s => s.id))
    return this.getAll().filter(d => stockIdSet.has(d.stockId))
  }
}

const PriceCache = {
  set(stockId, price) {
    const prices = this.getAll()
    prices[stockId] = parseFloat(price)
    saveData(PRICE_KEY, prices)
    // 价格变更，清除该股票的持仓缓存
    if (_positionCache && _positionCache.has(stockId)) {
      _positionCache.delete(stockId)
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

const Strategy = {
  getAll() {
    const customs = getData(STRATEGY_KEY) || []
    const merged = DEFAULT_STRATEGIES.slice()
    customs.forEach(function (tag) {
      if (merged.indexOf(tag) === -1) merged.push(tag)
    })
    return merged
  },

  save(list) {
    saveData(STRATEGY_KEY, list)
  },

  add(tag) {
    if (!tag || typeof tag !== 'string') return
    tag = tag.trim()
    if (!tag) return
    const customs = getData(STRATEGY_KEY) || []
    if (customs.indexOf(tag) === -1 && DEFAULT_STRATEGIES.indexOf(tag) === -1) {
      customs.push(tag)
      saveData(STRATEGY_KEY, customs)
    }
  },

  remove(tag) {
    const customs = getData(STRATEGY_KEY) || []
    const idx = customs.indexOf(tag)
    if (idx >= 0) {
      customs.splice(idx, 1)
      saveData(STRATEGY_KEY, customs)
    }
  },

  getUsedStrategies() {
    const transactions = Transaction.getAll()
    const countMap = {}
    transactions.forEach(function (t) {
      if (t.strategies && t.strategies.length) {
        t.strategies.forEach(function (tag) {
          countMap[tag] = (countMap[tag] || 0) + 1
        })
      }
    })
    const result = Object.keys(countMap).map(function (tag) {
      return { tag: tag, count: countMap[tag] }
    })
    result.sort(function (a, b) { return b.count - a.count })
    return result
  }
}

function getStrategyStats() {
  const transactions = Transaction.getAll()
  const stats = {}
  transactions.forEach(function (t) {
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

function calculatePosition(stockId) {
  if (_positionCache.has(stockId)) {
    return _positionCache.get(stockId)
  }

  // 仅在缓存达到上限时执行清理
  if (_positionCache.size >= MAX_POSITION_CACHE) {
    _clearExpiredCache()
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
  _positionCache.set(stockId, result)
  return result
}

// 批量计算多个股票的持仓，避免重复读取和过滤
// 一次性获取所有交易和分红数据，按 stockId 分组后批量计算
function batchCalculatePositions(stockIds) {
  // 过滤掉已有缓存的，只计算缺失的
  const needCalc = stockIds.filter(id => !_positionCache.has(id))
  if (needCalc.length === 0) return
  
  // 一次性获取所有数据
  const allTransactions = Transaction.getAll()
  const allDividends = Dividend.getAll()
  
  // 按 stockId 分组
  const txMap = {}
  const divMap = {}
  allTransactions.forEach(t => {
    if (!txMap[t.stockId]) txMap[t.stockId] = []
    txMap[t.stockId].push(t)
  })
  allDividends.forEach(d => {
    if (!divMap[d.stockId]) divMap[d.stockId] = []
    divMap[d.stockId].push(d)
  })
  
  // 批量计算
  needCalc.forEach(stockId => {
    const transactions = txMap[stockId] || []
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
    
    const dividends = divMap[stockId] || []
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
    
    _positionCache.set(stockId, {
      stockId,
      quantity: positionQuantity,
      avgCost: parseFloat(avgCost.toFixed(4)),
      realizedPnL: parseFloat(realizedPnL.toFixed(2)),
      dividendIncome: parseFloat(dividendIncome.toFixed(2)),
      currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
      floatingPnL: parseFloat(floatingPnL.toFixed(2)),
      totalPnL: parseFloat((realizedPnL + floatingPnL + dividendIncome).toFixed(2))
    })
  })
}

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

function getAllPositionsWithRealizedPnL(market = null) {
  const stocks = market ? Stock.getByMarket(market) : Stock.getAll()
  
  // 批量计算持仓
  const stockIds = stocks.map(s => s.id)
  batchCalculatePositions(stockIds)
  
  const positions = stocks.map(stock => {
    const pos = calculatePosition(stock.id)
    return {
      ...stock,
      ...pos
    }
  }).filter(p => Math.abs(p.realizedPnL) > 0.01 || Math.abs(p.dividendIncome) > 0.01)

  positions.sort((a, b) => (b.realizedPnL + b.dividendIncome) - (a.realizedPnL + a.dividendIncome))

  return positions
}

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

function getTotalStats() {
  // 使用 getPositionSummary 获取所有持仓，避免重复计算
  const positions = getPositionSummary()
  
  let totalInvestment = 0
  let totalBuyFee = 0
  let totalSellFee = 0

  // 从交易记录计算投入和手续费
  const transactions = Transaction.getAll()
  transactions.forEach(t => {
    const amount = t.price * t.quantity
    if (t.type === TRANSACTION_TYPE.BUY) {
      totalInvestment += amount + t.fee
      totalBuyFee += t.fee
    } else {
      totalSellFee += t.fee
    }
  })

  const totalRealizedPnL = positions.reduce((sum, p) => sum + p.realizedPnL, 0)
  const totalFloatingPnL = positions.reduce((sum, p) => sum + p.floatingPnL, 0)
  const totalDividendIncome = positions.reduce((sum, p) => sum + p.dividendIncome, 0)
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
  // 检查缓存
  const cacheKey = `${periodType}-${count}`
  if (_periodStatsCache.has(cacheKey)) {
    return _periodStatsCache.get(cacheKey).slice()
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
  
  const finalResult = result.slice(-count)
  _periodStatsCache.set(cacheKey, finalResult.slice())
  return finalResult
}

function getHeatmapData(year, month) {
  const cacheKey = year + '-' + month
  if (_heatmapCache.has(cacheKey)) return _heatmapCache.get(cacheKey)
  
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
  
  _heatmapCache.set(cacheKey, result)
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

module.exports = {
  MARKETS,
  TRANSACTION_TYPE,
  Stock,
  Transaction,
  Dividend,
  PriceCache,
  Strategy,
  DEFAULT_STRATEGIES,
  getStrategyStats,
  getData,
  saveData,
  getDataCopy,
  clearMemCache,
  calculatePosition,
  getPositionSummary,
  getAllPositionsWithRealizedPnL,
  getClearedPositions,
  getTotalStats,
  getStatsByPeriod,
  getPeriodStatsList,
  getHeatmapData,
  getPositionDistribution,
  getPieChartData,
  getScatterData,
  getMixedChartData
}
