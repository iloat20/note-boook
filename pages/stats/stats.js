const { getStatsByPeriod, getPeriodStatsList, getStrategyStats, getTotalXIRR, getPeriodStatsWithReturn } = require('../../utils/services/statsService')
const { getClearedPositions, getPositionSummary } = require('../../utils/services/positionService')
const { Stock, Transaction, Dividend } = require('../../utils/models/index')
const { fmt, fmtDate } = require('../../utils/helpers/format')
const { buildStockMap } = require('../../utils/helpers/stockHelpers')
const { exportMD } = require('../../utils/exporters/markdown')
const { getRates, getRate } = require('../../utils/services/exchangeRate')
const pageMixin = require('../../utils/ui/pageMixin')

Page({
  data: {
    ...pageMixin.initPageData(),
    loading: true,
    currentPeriod: 'MONTH',
    periodTabs: [
      { key: 'WEEK', label: '周' },
      { key: 'MONTH', label: '月' },
      { key: 'YEAR', label: '年' }
    ],
    stats: null,
    detailItems: [],
    heatmapData: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonth: new Date().getMonth() + 1,
    heatmapLabel: '',
    completeTrades: [],
    clearedPositions: [],
    showAnnualReport: false,
    annualReportData: null
  },

  onLoad() {
    pageMixin.onLoadMixin(this)
  },

  async onShow() {
    pageMixin.setTabSelected(this, 2)
    const wasDirty = pageMixin.consumeDirtyFlag()
    if (wasDirty || !this.data.stats) {
      await this.loadStats()
    }
  },

  switchPeriod: function (e) {
    const period = e.currentTarget.dataset.period
    this.setData({ currentPeriod: period }, () => {
      this.loadStats().catch(function (err) { console.error('[stats] switchPeriod loadStats error:', err) })
    })
  },

  _getPeriodDateRange(period) {
    const now = new Date()
    let startDate, endDate
    switch (period) {
      case 'DAY':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1)
        break
      case 'WEEK': {
        const dow = now.getDay() || 7
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 1)
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
    return { startDate, endDate }
  },

  async _calcPeriodStats(period) {
    return getPeriodStatsWithReturn(period, this._getPeriodDateRange.bind(this))
  },

  _buildTradeList() {
    const stocks = Stock.getAll()
    const stockMap = buildStockMap(stocks)
    const rawTx = Transaction.getAll()
    
    const txList = rawTx.map(t => {
      const stock = stockMap[t.stockId]
      const price = parseFloat(t.price) || 0
      const quantity = parseInt(t.quantity) || 0
      const fee = parseFloat(t.fee) || 0
      const amount = price * quantity
      const dateObj = new Date(t.date)
      const isBuy = t.type === 'BUY'
      const item = {
        id: t.id,
        stockId: t.stockId,
        type: t.type,
        typeText: isBuy ? '买入' : '卖出',
        typeTagClass: 'tag type-tag ' + (isBuy ? 'tag-buy' : 'tag-sell'),
        amountClass: 'detail-d-amount mono-num ' + (isBuy ? 'xhs-loss' : 'xhs-profit'),
        dateText: t.date ? fmtDate(dateObj) : '-',
        _sortKey: dateObj.getTime(),
        price: price,
        priceText: fmt(price),
        quantity: quantity,
        fee: fee,
        feeText: fmt(fee),
        amountText: fmt(amount),
        totalPnLText: fmt(amount),
        name: stock ? stock.name : '-',
        code: stock ? stock.code : '-',
        market: stock ? stock.market : ''
      }
      return item
    })

    const divList = Dividend.getAll().map(d => {
      const stock = stockMap[d.stockId]
      const dateObj = new Date(d.date)
      return {
        id: d.id,
        stockId: d.stockId,
        type: 'DIVIDEND',
        typeText: '分红',
        typeTagClass: 'tag type-tag tag-dividend',
        amountClass: 'detail-d-amount mono-num xhs-profit',
        dateText: d.date ? fmtDate(dateObj) : '-',
        _sortKey: dateObj.getTime(),
        amountText: fmt(d.totalAmount),
        totalPnLText: fmt(d.totalAmount),
        name: stock ? stock.name : '-',
        code: stock ? stock.code : '-',
        market: stock ? stock.market : ''
      }
    })
    
    let completeTrades = txList.concat(divList)
    completeTrades.sort(function (a, b) { return b._sortKey - a._sortKey })

    return completeTrades
  },

  _formatClearedPositions() {
    return getClearedPositions().map(p => {
      const totalPnL = p.realizedPnL + p.dividendIncome
      return Object.assign({}, p, {
        totalPnL: totalPnL,
        totalPnLText: (totalPnL >= 0 ? '+' : '') + fmt(totalPnL),
        realizedPnLText: fmt(p.realizedPnL),
        dividendIncomeText: fmt(p.dividendIncome),
        pnlClass: totalPnL >= 0 ? 'profit' : 'loss'
      })
    })
  },

  loadStats: async function () {
    const period = this.data.currentPeriod
    
    const { stats, detailItems } = await this._calcPeriodStats(period)
    const completeTrades = this._buildTradeList()
    const clearedPositions = this._formatClearedPositions()
    
    this.setData({
      stats,
      detailItems,
      completeTrades,
      clearedPositions,
      loading: false
    })
  },

  onExportMD: function () {
    exportMD()
  },

  onOpenAnnualReport: async function () {
    const year = new Date().getFullYear()
    const yearPrefix = year + '-'

    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    const yearTx = Transaction.getByDateRange(yearStart, yearEnd)
    let buyCount = 0, sellCount = 0
    yearTx.forEach(function (t) {
      if (t.type === 'BUY') buyCount++
      else sellCount++
    })

    const rates = await getRates()

    const stocks = Stock.getAll()
    const stockMarket = {}
    stocks.forEach(function (s) { stockMarket[s.id] = s.market })

    let yearBuyAmount = 0, yearSellAmount = 0, yearBuyFee = 0, yearSellFee = 0
    yearTx.forEach(function (t) {
      var r = getRate(stockMarket[t.stockId], rates)
      var amt = t.price * t.quantity
      if (t.type === 'BUY') {
        yearBuyAmount += amt * r
        yearBuyFee += t.fee * r
      } else {
        yearSellAmount += amt * r
        yearSellFee += t.fee * r
      }
    })

    var yearDivTotal = 0
    Dividend.getAll().forEach(function (d) {
      var dd = new Date(d.date)
      if (dd >= yearStart && dd <= yearEnd) {
        var r = getRate(stockMarket[d.stockId], rates)
        yearDivTotal += d.totalAmount * r
      }
    })

    var yearInvestment = yearBuyAmount + yearBuyFee
    var yearRecovery = yearSellAmount - yearSellFee + yearDivTotal
    var yearPnL = yearRecovery - yearInvestment
    var yearPnLPercent = yearInvestment > 0 ? parseFloat((yearPnL / yearInvestment * 100).toFixed(2)) : 0

    const periodList = getPeriodStatsList('MONTH', 12)
    const monthlyPnL = []
    for (let m = 1; m <= 12; m++) {
      const label = yearPrefix + String(m).padStart(2, '0')
      const found = periodList.find(function (item) { return item.label === label })
      monthlyPnL.push({ month: m, pnL: found ? found.pnL : 0 })
    }

    const cleared = getClearedPositions()
    const winCount = cleared.filter(function (p) {
      return (p.realizedPnL + p.dividendIncome) > 0
    }).length
    const winRate = cleared.length > 0 ? Math.round(winCount / cleared.length * 100) : 0

    const allPositions = getPositionSummary().concat(cleared.map(function (p) {
      return Object.assign({}, p, { floatingPnL: 0 })
    }))
    const stockPnL = {}
    allPositions.forEach(function (p) {
      var key = p.code
      var r = getRate(p.market, rates)
      if (!stockPnL[key]) {
        stockPnL[key] = { code: p.code, name: p.name, market: p.market, totalPnL: 0 }
      }
      stockPnL[key].totalPnL += ((p.realizedPnL || 0) + (p.floatingPnL || 0) + (p.dividendIncome || 0)) * r
    })
    var stockList = Object.values(stockPnL).map(function (s) {
      s.totalPnL = parseFloat(s.totalPnL.toFixed(2))
      s.totalPnLText = fmt(Math.abs(s.totalPnL))
      return s
    }).sort(function (a, b) { return b.totalPnL - a.totalPnL })
    var topStocks = stockList.slice(0, 5)
    var bottomStocks = stockList.filter(function (s) { return s.totalPnL < 0 })
      .slice(-5).reverse()
      .map(function (s) { s.totalPnLText = fmt(Math.abs(s.totalPnL)); return s })

    let strategyStats = getStrategyStats()
    const maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1
    strategyStats = strategyStats.slice(0, 8).map(function (s) {
      s.percent = Math.round(s.count / maxStrategyCount * 100)
      return s
    })

    let yearXIRR = null
    let totalXIRR = null
    try {
      const { calcXIRRForRange } = require('../../utils/helpers/xirr')
      const [yrXIRR, totXIRR] = await Promise.all([
        calcXIRRForRange(yearStart, yearEnd).catch(function () { return null }),
        getTotalXIRR().catch(function () { return null })
      ])
      yearXIRR = yrXIRR
      totalXIRR = totXIRR
    } catch (e) {
      console.error('XIRR 计算失败:', e)
    }

    this.setData({
      showAnnualReport: true,
      annualReportData: {
        year: year,
        tradeCount: yearTx.length,
        buyCount: buyCount,
        sellCount: sellCount,
        winRate: winRate,
        yearXIRR: yearXIRR,
        yearXIRRText: yearXIRR !== null ? (yearXIRR.toFixed(2) + '%') : '--',
        totalXIRR: totalXIRR,
        totalXIRRText: totalXIRR !== null ? (totalXIRR.toFixed(2) + '%') : '--',
        totalPnL: parseFloat(yearPnL.toFixed(2)),
        totalPnLText: fmt(Math.abs(yearPnL)),
        totalPnLPercent: yearPnLPercent,
        totalInvestmentText: fmt(yearInvestment),
        totalRecoveryText: fmt(yearRecovery),
        dividendIncomeText: fmt(yearDivTotal),
        monthlyPnL: monthlyPnL,
        topStocks: topStocks,
        bottomStocks: bottomStocks,
        strategyStats: strategyStats
      }
    })
  },

  onCloseAnnualReport: function () {
    this.setData({ showAnnualReport: false, annualReportData: null })
  }
})
