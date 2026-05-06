const STOCK_KEY = 'stock_trade_stocks'
const TRANSACTION_KEY = 'stock_trade_transactions'
const DIVIDEND_KEY = 'stock_trade_dividends'
const PRICE_KEY = 'stock_trade_prices'

const MARKETS = {
  A_SHARE: 'A_SHARE',
  HK_SHARE: 'HK_SHARE',
  US_SHARE: 'US_SHARE'
}

const TRANSACTION_TYPE = {
  BUY: 'BUY',
  SELL: 'SELL'
}

function getNextId(key) {
  const data = wx.getStorageSync(key) || []
  if (data.length === 0) return 1
  const maxId = Math.max(...data.map(item => item.id))
  return maxId + 1
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
      id: getNextId(STOCK_KEY),
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
  },
  
  getByMarket(market) {
    return this.getAll().filter(s => s.market === market)
  }
}

const Transaction = {
  create(stockId, type, price, quantity, fee, date, note = '') {
    return {
      id: getNextId(TRANSACTION_KEY),
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
  create(stockId, perShareAmount, quantity, date, note = '') {
    const totalAmount = parseFloat(perShareAmount) * parseInt(quantity)
    return {
      id: getNextId(DIVIDEND_KEY),
      stockId,
      perShareAmount: parseFloat(perShareAmount),
      quantity: parseInt(quantity),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      date: date instanceof Date ? date.toISOString() : date,
      note
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

  const positionQuantity = totalBuyQuantity - totalSellQuantity
  const avgCost = totalBuyQuantity > 0 ? (totalBuyAmount + totalBuyFee) / totalBuyQuantity : 0

  const realizedPnL = totalSellAmount - totalSellFee - (avgCost * totalSellQuantity + totalBuyFee * (totalSellQuantity / totalBuyQuantity))

  const dividends = Dividend.getByStockId(stockId)
  const dividendIncome = dividends.reduce((sum, d) => sum + d.totalAmount, 0)

  const currentPrice = PriceCache.get(stockId)
  const floatingPnL = currentPrice && positionQuantity > 0 ? (currentPrice - avgCost) * positionQuantity : 0

  return {
    stockId,
    quantity: positionQuantity,
    avgCost: parseFloat(avgCost.toFixed(4)),
    realizedPnL: parseFloat(realizedPnL.toFixed(2)),
    dividendIncome: parseFloat(dividendIncome.toFixed(2)),
    currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
    floatingPnL: parseFloat(floatingPnL.toFixed(2)),
    totalPnL: parseFloat((realizedPnL + floatingPnL + dividendIncome).toFixed(2))
  }
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
  
  positions.sort((a, b) => (b.floatingPnL / (b.avgCost * b.quantity) || 0) - (a.floatingPnL / (a.avgCost * a.quantity) || 0))
  
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
    case 'WEEK':
      const dayOfWeek = now.getDay() || 7
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1)
      endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      break
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
    case 'WEEK':
      let weekCount = 0
      let weekStart = new Date(firstDate)
      const dayOfWeek = weekStart.getDay() || 7
      weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - dayOfWeek + 1)
      
      while (weekStart <= now) {
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
        const weekLabel = `${weekStart.getFullYear()}W${Math.ceil((weekStart.getDate() + 6) / 7)}`
        
        const weekTrans = transactions.filter(t => {
          const d = new Date(t.date)
          return d >= weekStart && d <= weekEnd
        })
        const weekDivs = dividends.filter(d => {
          const dd = new Date(d.date)
          return dd >= weekStart && dd <= weekEnd
        })
        
        if (weekTrans.length > 0 || weekDivs.length > 0) {
          let buyAmount = 0, sellAmount = 0, buyFee = 0, sellFee = 0
          weekTrans.forEach(t => {
            const amount = t.price * t.quantity
            if (t.type === TRANSACTION_TYPE.BUY) {
              buyAmount += amount
              buyFee += t.fee
            } else {
              sellAmount += amount
              sellFee += t.fee
            }
          })
          const dividendIncome = weekDivs.reduce((sum, d) => sum + d.totalAmount, 0)
          const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
          
          result.push({
            label: weekLabel,
            startDate: weekStart.toISOString(),
            endDate: weekEnd.toISOString(),
            buyAmount: parseFloat(buyAmount.toFixed(2)),
            sellAmount: parseFloat(sellAmount.toFixed(2)),
            buyFee: parseFloat(buyFee.toFixed(2)),
            sellFee: parseFloat(sellFee.toFixed(2)),
            dividendIncome: parseFloat(dividendIncome.toFixed(2)),
            pnL: parseFloat(pnL.toFixed(2))
          })
        }
        
        weekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
      break
      
    case 'MONTH':
      let monthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
      
      while (monthStart <= now) {
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999)
        const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`
        
        const monthTrans = transactions.filter(t => {
          const d = new Date(t.date)
          return d >= monthStart && d <= monthEnd
        })
        const monthDivs = dividends.filter(d => {
          const dd = new Date(d.date)
          return dd >= monthStart && dd <= monthEnd
        })
        
        if (monthTrans.length > 0 || monthDivs.length > 0) {
          let buyAmount = 0, sellAmount = 0, buyFee = 0, sellFee = 0
          monthTrans.forEach(t => {
            const amount = t.price * t.quantity
            if (t.type === TRANSACTION_TYPE.BUY) {
              buyAmount += amount
              buyFee += t.fee
            } else {
              sellAmount += amount
              sellFee += t.fee
            }
          })
          const dividendIncome = monthDivs.reduce((sum, d) => sum + d.totalAmount, 0)
          const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
          
          result.push({
            label: monthLabel,
            startDate: monthStart.toISOString(),
            endDate: monthEnd.toISOString(),
            buyAmount: parseFloat(buyAmount.toFixed(2)),
            sellAmount: parseFloat(sellAmount.toFixed(2)),
            buyFee: parseFloat(buyFee.toFixed(2)),
            sellFee: parseFloat(sellFee.toFixed(2)),
            dividendIncome: parseFloat(dividendIncome.toFixed(2)),
            pnL: parseFloat(pnL.toFixed(2))
          })
        }
        
        monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
      }
      break
      
    case 'YEAR':
      let yearStart = new Date(firstDate.getFullYear(), 0, 1)
      
      while (yearStart <= now) {
        const yearEnd = new Date(yearStart.getFullYear(), 11, 31, 23, 59, 59, 999)
        const yearLabel = `${yearStart.getFullYear()}`
        
        const yearTrans = transactions.filter(t => {
          const d = new Date(t.date)
          return d >= yearStart && d <= yearEnd
        })
        const yearDivs = dividends.filter(d => {
          const dd = new Date(d.date)
          return dd >= yearStart && dd <= yearEnd
        })
        
        if (yearTrans.length > 0 || yearDivs.length > 0) {
          let buyAmount = 0, sellAmount = 0, buyFee = 0, sellFee = 0
          yearTrans.forEach(t => {
            const amount = t.price * t.quantity
            if (t.type === TRANSACTION_TYPE.BUY) {
              buyAmount += amount
              buyFee += t.fee
            } else {
              sellAmount += amount
              sellFee += t.fee
            }
          })
          const dividendIncome = yearDivs.reduce((sum, d) => sum + d.totalAmount, 0)
          const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
          
          result.push({
            label: yearLabel,
            startDate: yearStart.toISOString(),
            endDate: yearEnd.toISOString(),
            buyAmount: parseFloat(buyAmount.toFixed(2)),
            sellAmount: parseFloat(sellAmount.toFixed(2)),
            buyFee: parseFloat(buyFee.toFixed(2)),
            sellFee: parseFloat(sellFee.toFixed(2)),
            dividendIncome: parseFloat(dividendIncome.toFixed(2)),
            pnL: parseFloat(pnL.toFixed(2))
          })
        }
        
        yearStart = new Date(yearStart.getFullYear() + 1, 0, 1)
      }
      break
      
    default:
      let dayStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate())
      
      while (dayStart <= now) {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
        const dayLabel = `${dayStart.getMonth() + 1}/${dayStart.getDate()}`
        
        const dayTrans = transactions.filter(t => {
          const d = new Date(t.date)
          return d >= dayStart && d <= dayEnd
        })
        const dayDivs = dividends.filter(d => {
          const dd = new Date(d.date)
          return dd >= dayStart && dd <= dayEnd
        })
        
        if (dayTrans.length > 0 || dayDivs.length > 0) {
          let buyAmount = 0, sellAmount = 0, buyFee = 0, sellFee = 0
          dayTrans.forEach(t => {
            const amount = t.price * t.quantity
            if (t.type === TRANSACTION_TYPE.BUY) {
              buyAmount += amount
              buyFee += t.fee
            } else {
              sellAmount += amount
              sellFee += t.fee
            }
          })
          const dividendIncome = dayDivs.reduce((sum, d) => sum + d.totalAmount, 0)
          const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome
          
          result.push({
            label: dayLabel,
            startDate: dayStart.toISOString(),
            endDate: dayEnd.toISOString(),
            buyAmount: parseFloat(buyAmount.toFixed(2)),
            sellAmount: parseFloat(sellAmount.toFixed(2)),
            buyFee: parseFloat(buyFee.toFixed(2)),
            sellFee: parseFloat(sellFee.toFixed(2)),
            dividendIncome: parseFloat(dividendIncome.toFixed(2)),
            pnL: parseFloat(pnL.toFixed(2))
          })
        }
        
        dayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      }
  }
  
  return result
}

function validateStockCode(code, market) {
  switch (market) {
    case MARKETS.A_SHARE:
      return /^\d{6}$/.test(code)
    case MARKETS.HK_SHARE:
      return /^\d{5}$/.test(code)
    case MARKETS.US_SHARE:
      return /^[A-Za-z]{1,5}$/.test(code)
    default:
      return false
  }
}

function formatStockCode(code, market) {
  switch (market) {
    case MARKETS.HK_SHARE:
      return code.padStart(5, '0')
    case MARKETS.US_SHARE:
      return code.toUpperCase()
    default:
      return code
  }
}

function getHeatmapData(year, month) {
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

  return result
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
  getTotalStats,
  getStatsByPeriod,
  getPeriodStatsList,
  getHeatmapData,
  validateStockCode,
  formatStockCode
}
