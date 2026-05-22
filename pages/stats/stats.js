const { getStatsByPeriod, getPeriodStatsList, getStrategyStats } = require('../../utils/services/statsService')
const { getClearedPositions, getPositionSummary } = require('../../utils/services/positionService')
const { Stock, Transaction, Dividend } = require('../../utils/models/index')
const { fmt, fmtDate } = require('../../utils/helpers/format')
const { buildStockMap } = require('../../utils/helpers/stockHelpers')
const { exportMD } = require('../../utils/exporters/markdown')

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
    const appStore = require('../../utils/state/appStore')
    if (appStore.getState('dataDirty')) {
      appStore.commit('MARK_CLEAN')
    }
    this.loadStats()
    this.setData({ loading: false })
  },

  onUnload() {
  },

  switchPeriod: function (e) {
    const period = e.currentTarget.dataset.period
    this.setData({ currentPeriod: period }, () => {
      this.loadStats()
    })
  },

  loadStats: function () {
    const period = this.data.currentPeriod
    const stats = getStatsByPeriod(period)
    const totalInvestment = stats.buyAmount + stats.buyFee
    const totalRecover = stats.sellAmount - stats.sellFee
    const totalPnL = stats.pnL

    const totalReturnRate = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0

    this.setData({
      stats: {
        totalInvestment: totalInvestment,
        totalRecover: totalRecover,
        totalPnL: totalPnL,
        totalInvestmentText: fmt(totalInvestment),
        totalRecoverText: fmt(totalRecover),
        totalPnLText: fmt(totalPnL),
        totalReturnRateText: (totalReturnRate >= 0 ? '+' : '') + totalReturnRate.toFixed(2) + '%',
        dividendIncomeText: fmt(stats.dividendIncome),
        totalBuyFeeText: fmt(stats.buyFee),
        totalSellFeeText: fmt(stats.sellFee)
      }
    })

    const detailItems = [
      { label: '已实现盈亏', value: fmt(totalPnL), prefix: totalPnL >= 0 ? '+' : '', colorClass: totalPnL >= 0 ? 'profit' : 'loss' },
      { label: '分红收益', value: fmt(stats.dividendIncome), prefix: '+', colorClass: 'profit' },
      { label: '买入手续费', value: fmt(stats.buyFee), prefix: '-', colorClass: '' },
      { label: '卖出手续费', value: fmt(stats.sellFee), prefix: '-', colorClass: '' }
    ]
    const stocks = Stock.getAll()
    const stockMap = buildStockMap(stocks)
    
    // 优化：分别构建交易和分红列表，避免大数组 concat + sort
    const txList = Transaction.getAll().map(function (t) {
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
    
    const divList = Dividend.getAll().map(function (d) {
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
    
    // 按日期倒序合并两个已排序数组（O(n) 而非 O(n log n)）
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
    
    const clearedPositions = getClearedPositions().map(function (p) {
      const totalPnL = p.realizedPnL + p.dividendIncome
      return Object.assign({}, p, {
        totalPnL: totalPnL,
        totalPnLText: fmt(totalPnL),
        realizedPnLText: fmt(p.realizedPnL),
        dividendIncomeText: fmt(p.dividendIncome),
        pnlClass: totalPnL >= 0 ? 'profit' : 'loss'
      })
    })
    this.setData({ detailItems: detailItems, completeTrades: completeTrades, clearedPositions: clearedPositions })
  },

  onExportMD: function () {
    exportMD()
  },

  onOpenAnnualReport: function () {
    const year = new Date().getFullYear()
    const yearPrefix = year + '-'

    // 本年交易统计
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    const yearTx = Transaction.getByDateRange(yearStart, yearEnd)
    let buyCount = 0, sellCount = 0
    yearTx.forEach(function (t) {
      if (t.type === 'BUY') buyCount++
      else sellCount++
    })

    // 月度盈亏 — 复用 getPeriodStatsList
    const periodList = getPeriodStatsList('MONTH', 120)
    const monthlyPnL = []
    for (let m = 1; m <= 12; m++) {
      const label = yearPrefix + String(m).padStart(2, '0')
      const found = periodList.find(function (item) { return item.label === label })
      monthlyPnL.push({ month: m, pnL: found ? found.pnL : 0 })
    }

    // 胜率：已清仓持仓中 totalPnL > 0
    const cleared = getClearedPositions()
    const winCount = cleared.filter(function (p) {
      return (p.realizedPnL + p.dividendIncome) > 0
    }).length
    const winRate = cleared.length > 0 ? Math.round(winCount / cleared.length * 100) : 0

    // Top/Bottom 股票
    const allPositions = getPositionSummary().concat(cleared.map(function (p) {
      return Object.assign({}, p, { floatingPnL: 0 })
    }))
    const stockPnL = {}
    allPositions.forEach(function (p) {
      const key = p.code
      if (!stockPnL[key]) {
        stockPnL[key] = { code: p.code, name: p.name, market: p.market, totalPnL: 0 }
      }
      stockPnL[key].totalPnL += (p.realizedPnL || 0) + (p.floatingPnL || 0) + (p.dividendIncome || 0)
    })
    const stockList = Object.values(stockPnL).map(function (s) {
      s.totalPnL = parseFloat(s.totalPnL.toFixed(2))
      s.totalPnLText = fmt(Math.abs(s.totalPnL))
      return s
    }).sort(function (a, b) { return b.totalPnL - a.totalPnL })
    const topStocks = stockList.slice(0, 5)
    const bottomStocks = stockList.slice(-5).reverse()

    // 策略分布 — 复用 getStrategyStats
    let strategyStats = getStrategyStats()
    const maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1
    strategyStats = strategyStats.slice(0, 8).map(function (s) {
      s.percent = Math.round(s.count / maxStrategyCount * 100)
      return s
    })

    const yearPeriodStats = getStatsByPeriod('YEAR')
    const yearInvestment = yearPeriodStats.buyAmount + yearPeriodStats.buyFee
    const yearRecovery = yearPeriodStats.sellAmount - yearPeriodStats.sellFee + yearPeriodStats.dividendIncome
    const yearPnLPercent = yearInvestment > 0 ? parseFloat((yearPeriodStats.pnL / yearInvestment * 100).toFixed(2)) : 0

    this.setData({
      showAnnualReport: true,
      annualReportData: {
        year: year,
        tradeCount: yearTx.length,
        buyCount: buyCount,
        sellCount: sellCount,
        winRate: winRate,
        totalPnL: yearPeriodStats.pnL,
        totalPnLText: fmt(Math.abs(yearPeriodStats.pnL)),
        totalPnLPercent: yearPnLPercent,
        totalInvestmentText: fmt(yearInvestment),
        totalRecoveryText: fmt(yearRecovery),
        dividendIncomeText: fmt(yearPeriodStats.dividendIncome),
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
