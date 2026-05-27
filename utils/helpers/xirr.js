const { getRate, getRates } = require('../services/exchangeRate')
const { Stock } = require('../models/index')
const { caches } = require('../cache/cacheManager')

// XIRR 结果缓存（按日期范围 key）
const xirrCache = caches.periodStats

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
  let oscillating = false

  for (let iter = 0; iter < maxIter; iter++) {
    const fVal = f(rate)
    const dfVal = df(rate)

    if (Math.abs(dfVal) < 1e-12) { oscillating = true; break }

    const newRate = rate - fVal / dfVal

    if (Math.abs(newRate - rate) < tol) {
      return newRate
    }

    rate = newRate

    if (rate < -0.99 || rate > 10) {
      oscillating = true
      break
    }
  }

  if (!oscillating) {
    const finalVal = f(rate)
    if (Math.abs(finalVal) < 1) return rate
  }

  // Bisection fallback for cases Newton-Raphson can't handle
  // (extreme rates, oscillation, divergence)
  let lo = -0.99, hi = 10
  let fLo = f(lo), fHi = f(hi)
  if (fLo * fHi > 0) return null

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2
    const fMid = f(mid)
    if (Math.abs(fMid) < tol || (hi - lo) < tol) return mid
    if (fMid * fLo > 0) { lo = mid; fLo = fMid }
    else { hi = mid }
  }

  const finalVal = f((lo + hi) / 2)
  if (Math.abs(finalVal) < 1) return (lo + hi) / 2
  return null
}

/**
 * 从交易/分红构建现金流 + 期末持仓价值（核心逻辑，供 buildCashFlows 和 calcXIRRForRange 共用）
 * @param {Array} transactions - 交易记录
 * @param {Array} dividends - 分红记录
 * @param {Object} stockMarket - { stockId: market } 映射
 * @param {Object} rates - 汇率
 * @param {Date} terminalDate - 期末日期（用于截取持仓和设置终值时间点）
 * @param {Date} [cashFlowCutoff] - 可选：现金流截止日期（只取此日期前的交易/分红）
 * @returns {{ cashFlows: number[], dates: string[] } | null}
 */
function _buildCashFlowsCore(transactions, dividends, stockMarket, rates, terminalDate, cashFlowCutoff) {
  const PriceCache = require('../models/priceCache')

  const items = []
  transactions.forEach(t => {
    if (cashFlowCutoff && new Date(t.date) > cashFlowCutoff) return
    const r = getRate(stockMarket[t.stockId], rates)
    if (t.type === 'BUY') {
      items.push({ date: t.date, amount: -(t.price * t.quantity + t.fee) * r })
    } else {
      items.push({ date: t.date, amount: (t.price * t.quantity - t.fee) * r })
    }
  })
  dividends.forEach(d => {
    if (cashFlowCutoff && new Date(d.date) > cashFlowCutoff) return
    const r = getRate(stockMarket[d.stockId], rates)
    items.push({ date: d.date, amount: d.totalAmount * r })
  })

  if (items.length < 2) return null
  items.sort((a, b) => a.date.localeCompare(b.date))

  const cashFlows = items.map(i => i.amount)
  const dates = items.map(i => i.date)

  // 计算期末持仓价值
  const lastDate = new Date(terminalDate)
  lastDate.setHours(23, 59, 59, 999)

  const holdingPositions = {}
  transactions.forEach(t => {
    if (lastDate && new Date(t.date) > lastDate) return
    if (!holdingPositions[t.stockId]) holdingPositions[t.stockId] = { quantity: 0, cost: 0 }
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
      const latestPrice = PriceCache.get(stockId)
      if (latestPrice) totalValue += pos.quantity * latestPrice * r
    }
  }

  if (totalValue > 0) {
    cashFlows.push(totalValue)
    dates.push(lastDate.toISOString())
  }

  return { cashFlows, dates }
}

async function buildCashFlows(transactions, dividends, stocks) {
  const stockMarket = {}
  stocks.forEach(s => { stockMarket[s.id] = s.market })
  const rates = await getRates()
  return _buildCashFlowsCore(transactions, dividends, stockMarket, rates, new Date())
}

async function calcXIRRForRange(startDate, endDate) {
  const cacheKey = 'xirr_' + startDate.toISOString() + '_' + endDate.toISOString()
  if (xirrCache.has(cacheKey)) return xirrCache.get(cacheKey)

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

  const result = _buildCashFlowsCore(transactions, dividends, stockMarket, rates, endDate)
  if (!result) { xirrCache.set(cacheKey, null); return null }

  const xirrResult = xirr(result.cashFlows, result.dates)
  const finalResult = xirrResult !== null ? parseFloat((xirrResult * 100).toFixed(2)) : null
  xirrCache.set(cacheKey, finalResult)
  return finalResult
}

async function getTotalXIRR() {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return calcXIRRForRange(new Date(0), today)
}

module.exports = {
  xirr,
  buildCashFlows,
  calcXIRRForRange,
  getTotalXIRR
}
