const { getRate, getRates } = require('../services/exchangeRate')
const { Stock } = require('../models/index')

function dateToNumber(date) {
  const d = new Date(date)
  return d.getTime()
}

function xirr(cashFlows, dates, guess = 0.1) {
  const n = cashFlows.length
  if (n !== dates.length || n < 2) return null
  
  const d0 = dateToNumber(dates[0])
  const t = dates.map(d => (dateToNumber(d) - d0) / (365.25 * 24 * 60 * 60 * 1000))
  
  const f = (rate) => {
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += cashFlows[i] / Math.pow(1 + rate, t[i])
    }
    return sum
  }
  
  const df = (rate) => {
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum -= (t[i] * cashFlows[i]) / Math.pow(1 + rate, t[i] + 1)
    }
    return sum
  }
  
  let rate = guess
  const maxIter = 100
  const tol = 1e-8
  
  for (let iter = 0; iter < maxIter; iter++) {
    const fVal = f(rate)
    const dfVal = df(rate)
    
    if (Math.abs(dfVal) < 1e-12) break
    
    const newRate = rate - fVal / dfVal
    
    if (Math.abs(newRate - rate) < tol) {
      return newRate
    }
    
    rate = newRate
    
    if (rate < -0.99) rate = -0.5
    if (rate > 10) rate = 5
  }
  
  const finalVal = f(rate)
  if (Math.abs(finalVal) < 1) {
    return rate
  }
  
  return null
}

async function buildCashFlows(transactions, dividends, stocks) {
  const stockMarket = {}
  stocks.forEach(s => { stockMarket[s.id] = s.market })
  
  const rates = await getRates()
  
  const items = []
  
  transactions.forEach(t => {
    const r = getRate(stockMarket[t.stockId], rates)
    const amount = t.price * t.quantity + t.fee
    if (t.type === 'BUY') {
      items.push({ date: t.date, amount: -amount })
    } else {
      items.push({ date: t.date, amount: amount - t.fee })
    }
  })
  
  dividends.forEach(d => {
    const r = getRate(stockMarket[d.stockId], rates)
    items.push({ date: d.date, amount: d.totalAmount * r })
  })
  
  items.sort((a, b) => a.date.localeCompare(b.date))
  
  if (items.length === 0) return null
  
  const cashFlows = items.map(i => i.amount)
  const dates = items.map(i => i.date)
  
  const lastDate = new Date()
  lastDate.setHours(23, 59, 59, 999)
  const lastPrice = require('./positionCalculator').getLastPrice || null
  
  const holdingPositions = {}
  transactions.forEach(t => {
    if (!holdingPositions[t.stockId]) {
      holdingPositions[t.stockId] = { quantity: 0, cost: 0 }
    }
    if (t.type === 'BUY') {
      holdingPositions[t.stockId].quantity += t.quantity
      holdingPositions[t.stockId].cost += t.price * t.quantity + t.fee
    } else {
      holdingPositions[t.stockId].quantity -= t.quantity
    }
  })
  
  let totalValue = 0
  for (const stockId in holdingPositions) {
    const pos = holdingPositions[stockId]
    if (pos.quantity > 0) {
      const r = getRate(stockMarket[stockId], rates)
      const latestPrice = require('../models/priceCache').get(stockId)
      if (latestPrice) {
        totalValue += pos.quantity * latestPrice * r
      }
    }
  }
  
  if (totalValue > 0) {
    cashFlows.push(totalValue)
    dates.push(lastDate.toISOString())
  }
  
  return { cashFlows, dates }
}

async function calcXIRRForRange(startDate, endDate) {
  const { Transaction, Dividend, Stock } = require('../models/index')
  
  const stocks = Stock.getAll()
  const stockMarket = {}
  stocks.forEach(s => { stockMarket[s.id] = s.market })
  
  const rates = await getRates()
  
  const transactions = Transaction.getByDateRange(startDate, endDate)
  const dividends = Dividend.getAll().filter(d => {
    const dd = new Date(d.date)
    return dd >= startDate && dd <= endDate
  })
  
  const items = []
  
  transactions.forEach(t => {
    const r = getRate(stockMarket[t.stockId], rates)
    if (t.type === 'BUY') {
      items.push({ date: t.date, amount: -(t.price * t.quantity + t.fee) * r })
    } else {
      items.push({ date: t.date, amount: (t.price * t.quantity - t.fee) * r })
    }
  })
  
  dividends.forEach(d => {
    const r = getRate(stockMarket[d.stockId], rates)
    items.push({ date: d.date, amount: d.totalAmount * r })
  })
  
  if (items.length < 2) return null
  
  items.sort((a, b) => a.date.localeCompare(b.date))
  
  const cashFlows = items.map(i => i.amount)
  const dates = items.map(i => i.date)
  
  const lastDate = new Date(endDate)
  lastDate.setHours(23, 59, 59, 999)
  
  let totalHoldingValue = 0
  const holdingPositions = {}
  
  Transaction.getAll().forEach(t => {
    if (new Date(t.date) <= lastDate) {
      if (!holdingPositions[t.stockId]) {
        holdingPositions[t.stockId] = { quantity: 0, cost: 0 }
      }
      if (t.type === 'BUY') {
        holdingPositions[t.stockId].quantity += t.quantity
        holdingPositions[t.stockId].cost += t.price * t.quantity + t.fee
      } else {
        holdingPositions[t.stockId].quantity -= t.quantity
        holdingPositions[t.stockId].cost -= t.price * t.quantity - t.fee
      }
    }
  })
  
  for (const stockId in holdingPositions) {
    const pos = holdingPositions[stockId]
    if (pos.quantity > 0) {
      const r = getRate(stockMarket[stockId], rates)
      const latestPrice = require('../models/priceCache').get(stockId)
      if (latestPrice) {
        totalHoldingValue += pos.quantity * latestPrice * r
      }
    }
  }
  
  if (totalHoldingValue > 0) {
    cashFlows.push(totalHoldingValue)
    dates.push(lastDate.toISOString())
  }
  
  const result = xirr(cashFlows, dates)
  if (result !== null) {
    return parseFloat((result * 100).toFixed(2))
  }
  return null
}

async function getTotalXIRR() {
  return calcXIRRForRange(new Date(0), new Date())
}

module.exports = {
  xirr,
  buildCashFlows,
  calcXIRRForRange,
  getTotalXIRR
}
