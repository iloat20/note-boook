const { getStatsByPeriod, getPeriodStatsList, getStrategyStats } = require('../../utils/services/statsService')
const { getClearedPositions, getPositionSummary } = require('../../utils/services/positionService')
const { Stock, Transaction, Dividend } = require('../../utils/models/index')
const { fmt, fmtDate } = require('../../utils/helpers/format')
const { buildStockMap } = require('../../utils/helpers/stockHelpers')
const { exportMD } = require('../../utils/exporters/markdown')
const { getRates, getRate } = require('../../utils/services/exchangeRate')
const appStore = require('../../utils/state/appStore')

Page({
  data: {
    loading: true,
    statusBarHeight: 0,
    navBarHeight: 44,
    currentPeriod: 'MONTH',
    periodTabs: [
      { key: 'WEEK', label: '周' },
      { key: 'MONTH', label: '月' },
      { key: 'YEAR', label: '年' }
    ],
    stats: {},
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
    this.setData(getApp().getNavBarInfo())
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (appStore.getState('dataDirty')) {
      appStore.commit('MARK_CLEAN')
    }
    this.loadStats()
    this.setData({ loading: false })
  },

  switchPeriod: function (e) {
    const period = e.currentTarget.dataset.period
    this.setData({ currentPeriod: period }, () => {
      this.loadStats()
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
    const { startDate, endDate } = this._getPeriodDateRange(period)
    const rates = await getRates()
    const stocks = Stock.getAll()
    
    const stockMarket = {}
    stocks.forEach(s => { stockMarket[s.id] = s.market })

    const periodTx = Transaction.getByDateRange(startDate, endDate)
    const periodDiv = Dividend.getAll().filter(d => {
      const dd = new Date(d.date)
      return dd >= startDate && dd <= endDate
    })

    let cnyBuyAmount = 0, cnySellAmount = 0, cnyBuyFee = 0, cnySellFee = 0
    periodTx.forEach(t => {
      const r = getRate(stockMarket[t.stockId], rates)
      const a = t.price * t.quantity
      if (t.type === 'BUY') { cnyBuyAmount += a * r; cnyBuyFee += t.fee * r }
      else { cnySellAmount += a * r; cnySellFee += t.fee * r }
    })
    
    let cnyDividendIncome = 0
    periodDiv.forEach(d => {
      const r = getRate(stockMarket[d.stockId], rates)
      cnyDividendIncome += d.totalAmount * r
    })

    const totalInvestment = cnyBuyAmount + cnyBuyFee
    const totalRecovery = cnySellAmount - cnySellFee
    const totalPnL = totalRecovery - totalInvestment + cnyDividendIncome
    const totalReturnRate = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0

    const stats = {
      totalInvestment: totalInvestment,
      totalRecovery: totalRecovery,
      totalPnL: totalPnL,
      totalInvestmentText: fmt(totalInvestment),
      totalRecoveryText: fmt(totalRecovery),
      totalPnLText: fmt(totalPnL),
      totalReturnRateText: (totalReturnRate >= 0 ? '+' : '') + totalReturnRate.toFixed(2) + '%',
      dividendIncomeText: fmt(cnyDividendIncome),
      totalBuyFeeText: fmt(cnyBuyFee),
      totalSellFeeText: fmt(cnySellFee)
    }

    const detailItems = [
      { label: '已实现盈亏', value: fmt(totalPnL), prefix: totalPnL >= 0 ? '+' : '', colorClass: totalPnL >= 0 ? 'profit' : 'loss' },
      { label: '分红收益', value: fmt(cnyDividendIncome), prefix: '+', colorClass: 'profit' },
      { label: '买入手续费', value: fmt(cnyBuyFee), prefix: '-', colorClass: '' },
      { label: '卖出手续费', value: fmt(cnySellFee), prefix: '-', colorClass: '' }
    ]

    return { stats, detailItems }
  },

  _buildTradeList() {
    const stocks = Stock.getAll()
    const stockMap = buildStockMap(stocks)
    
    const txList = Transaction.getAll().map(t => {
      const stock = stockMap[t.stockId]
      return {
        id: t.id,
        stockId: t.stockId,
        type: t.type,
        typeText: t.type === 'BUY' ? '买入' : '卖出',
        dateText: t.date ? fmtDate(new Date(t.date)) : '-',
        amountText: fmt((t.price || 0) * (t.quantity || 0)),
        totalPnLText: (t.type === 'BUY' ? '-' : '+') + fmt((t.price || 0) * (t.quantity || 0)),
        name: stock ? stock.name : '-',
        code: stock ? stock.code : '-',
        market: stock ? stock.market : ''
      }
    })
    
    const divList = Dividend.getAll().map(d => {
      const stock = stockMap[d.stockId]
      return {
        id: d.id,
        stockId: d.stockId,
        type: 'DIVIDEND',
        typeText: '分红',
        dateText: d.date ? fmtDate(new Date(d.date)) : '-',
        amountText: fmt(d.totalAmount),
        totalPnLText: '+' + fmt(d.totalAmount),
        name: stock ? stock.name : '-',
        code: stock ? stock.code : '-',
        market: stock ? stock.market : ''
      }
    })
    
    let completeTrades = []
    let i = 0, j = 0
    while (i < txList.length && j < divList.length) {
      if ((txList[i].dateText || '') >= (divList[j].dateText || '')) {
        completeTrades.push(txList[i]); i++
      } else {
        completeTrades.push(divList[j]); j++
      }
    }
    while (i < txList.length) { completeTrades.push(txList[i]); i++ }
    while (j < divList.length) { completeTrades.push(divList[j]); j++ }
    
    return completeTrades
  },

  _formatClearedPositions() {
    return getClearedPositions().map(p => {
      const totalPnL = p.realizedPnL + p.dividendIncome
      return Object.assign({}, p, {
        totalPnL: totalPnL,
        totalPnLText: fmt(totalPnL),
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
      clearedPositions
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

    const periodList = getPeriodStatsList('MONTH', 120)
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

    let strategyStats = getStrategyStats()
    const maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1
    strategyStats = strategyStats.slice(0, 8).map(function (s) {
      s.percent = Math.round(s.count / maxStrategyCount * 100)
      return s
    })

    this.setData({
      showAnnualReport: true,
      annualReportData: {
        year: year,
        tradeCount: yearTx.length,
        buyCount: buyCount,
        sellCount: sellCount,
        winRate: winRate,
        totalPnL: parseFloat(yearPnL.toFixed(2)),
        totalPnLText: fmt(Math.abs(yearPnL)),
        totalPnLPercent: yearPnLPercent,
        totalInvestmentText: fmt(yearInvestment),
        totalRecoveryText: fmt(yearRecovery),
        dividendIncomeText: fmt(yearDivTotal),
        monthlyPnL: monthlyPnL,
        topStocks: topStocks,
        bottomStocks: [],
        strategyStats: strategyStats
      }
    })
  },

  onCloseAnnualReport: function () {
    this.setData({ showAnnualReport: false, annualReportData: null })
  }
})
