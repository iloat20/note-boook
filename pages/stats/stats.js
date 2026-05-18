const { getStatsByPeriod, getPeriodStatsList, getHeatmapData, getClearedPositions, getMixedChartData, getPositionSummary, getStrategyStats, Stock, Transaction, Dividend } = require('../../utils/storage.js')
const { fmt, fmtDate } = require('../../utils/format.js')
const { exportMD } = require('../../utils/export.js')
const echarts = require('../../components/ec-canvas/echarts')

// 缓存渐变对象，避免重复创建
const gradientCache = {
  barPositive: null,
  barNegative: null,
  lineArea: null
}

function getCachedGradient(type) {
  if (gradientCache[type]) return gradientCache[type]

  const gradients = {
    barPositive: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(255,107,53,0.9)' },
      { offset: 1, color: 'rgba(255,107,53,0.2)' }
    ]),
    barNegative: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(26,160,79,0.9)' },
      { offset: 1, color: 'rgba(26,160,79,0.2)' }
    ]),
    lineArea: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(255,107,53,0.25)' },
      { offset: 1, color: 'rgba(255,107,53,0.02)' }
    ])
  }

  gradientCache[type] = gradients[type]
  return gradients[type]
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    currentPeriod: 'MONTH',
    periodTabs: [
      { key: 'WEEK', label: '周' },
      { key: 'MONTH', label: '月' },
      { key: 'YEAR', label: '年' }
    ],
    chartsLoaded: { trend: false },
    ecTrend: { onInit: null },
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
    var app = getApp()
    if (app.globalData.dataDirty) {
      app.globalData.dataDirty = false
    }
    this.loadStats()
    this.loadHeatmap()
    if (this._charts) {
      this.updateCharts()
    } else {
      this.initCharts()
    }
  },

  onHide() {
    // 页面隐藏时不销毁图表（ec-canvas 事件仍会触发），仅标记状态
    this._chartsHidden = true
  },

  onUnload() {
    if (this._charts) {
      if (this._charts.trend) { this._charts.trend.dispose(); this._charts.trend = null }
      this._charts = null
    }
  },

  initCharts() {
    var that = this

    this.setData({
      ecTrend: {
        onInit: function (canvas, width, height, dpr) {
          var chart = echarts.init(canvas, null, { width: width, height: height, dpr: dpr })
          that._charts = that._charts || {}
          that._charts.trend = chart
          var mixed = getMixedChartData(that.data.currentPeriod, 12)
          var option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            legend: {
              data: ['月度盈亏', '累计收益'],
              top: 0,
              textStyle: { fontSize: 11, color: '#666' }
            },
            grid: { left: 45, right: 45, top: 40, bottom: 35 },
            xAxis: {
              type: 'category',
              data: mixed.labels,
              axisLabel: { color: '#999', fontSize: 10 },
              axisLine: { lineStyle: { color: '#eee' } }
            },
            yAxis: [
              {
                type: 'value',
                axisLabel: { color: '#999', fontSize: 10 },
                splitLine: { lineStyle: { color: '#f0f0f0' } }
              },
              {
                type: 'value',
                axisLabel: { color: '#999', fontSize: 10 }
              }
            ],
            progressive: 200,
            progressiveThreshold: 10,
            series: [
              {
                name: '月度盈亏',
                type: 'bar',
                data: mixed.barData,
                large: mixed.barData.length > 20,
                itemStyle: {
                  color: function (params) {
                    return params.value >= 0 ? getCachedGradient('barPositive') : getCachedGradient('barNegative')
                  },
                  borderRadius: [3, 3, 0, 0],
                  shadowBlur: 4,
                  shadowColor: 'rgba(0,0,0,0.1)'
                },
                animationDuration: 600,
                animationEasing: 'cubicOut'
              },
              {
                name: '累计收益',
                type: 'line',
                yAxisIndex: 1,
                data: mixed.lineData,
                smooth: true,
                sampling: 'lttb',  // 120Hz 下降采样，减少绘制压力
                large: mixed.lineData.length > 20,
                lineStyle: { width: 3, shadowBlur: 8, shadowColor: 'rgba(255,107,53,0.3)' },
                itemStyle: { color: '#FF6B35' },
                areaStyle: { color: getCachedGradient('lineArea') },
                animationDuration: 800,
                animationEasing: 'cubicOut'
              }
            ]
          }
          chart.setOption(option)
          that.setData({ 'chartsLoaded.trend': true })
          return chart
        }
      }
    })
  },

  updateCharts: function () {
    var period = this.data.currentPeriod
    if (this._charts && this._charts.trend) {
      var mixed = getMixedChartData(period, 12)
      this._charts.trend.setOption({
        xAxis: { data: mixed.labels },
        series: [{ data: mixed.barData }, { data: mixed.lineData }]
      })
    }
  },

  switchPeriod: function (e) {
    this.setData({ currentPeriod: e.currentTarget.dataset.period }, () => {
      this.loadStats()
      if (this._charts) {
        this.updateCharts()
      } else {
        this.initCharts()
      }
    })
  },

  loadStats: function () {
    var period = this.data.currentPeriod
    var stats = getStatsByPeriod(period)
    var totalInvestment = stats.buyAmount + stats.buyFee
    var totalRecover = stats.sellAmount - stats.sellFee
    var totalPnL = stats.pnL

    this.setData({
      stats: {
        totalInvestment: totalInvestment,
        totalRecover: totalRecover,
        totalPnL: totalPnL,
        totalInvestmentText: fmt(totalInvestment),
        totalRecoverText: fmt(totalRecover),
        totalPnLText: fmt(totalPnL),
        dividendIncomeText: fmt(stats.dividendIncome),
        totalBuyFeeText: fmt(stats.buyFee),
        totalSellFeeText: fmt(stats.sellFee)
      }
    })

    var detailItems = [
      { label: '已实现盈亏', value: fmt(totalPnL), prefix: totalPnL >= 0 ? '+' : '', colorClass: totalPnL >= 0 ? 'profit' : 'loss' },
      { label: '分红收益', value: fmt(stats.dividendIncome), prefix: '+', colorClass: 'profit' },
      { label: '买入手续费', value: fmt(stats.buyFee), prefix: '-', colorClass: '' },
      { label: '卖出手续费', value: fmt(stats.sellFee), prefix: '-', colorClass: '' }
    ]
    var stocks = Stock.getAll()
    var stockMap = {}
    stocks.forEach(function (s) { stockMap[s.id] = s })
    
    // 优化：分别构建交易和分红列表，避免大数组 concat + sort
    var txList = Transaction.getAll().map(function (t) {
      var stock = stockMap[t.stockId]
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
    
    var divList = Dividend.getAll().map(function (d) {
      var stock = stockMap[d.stockId]
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
    var completeTrades = []
    var i = 0, j = 0
    while (i < txList.length && j < divList.length) {
      if ((txList[i].dateText || '') >= (divList[j].dateText || '')) {
        completeTrades.push(txList[i]); i++
      } else {
        completeTrades.push(divList[j]); j++
      }
    }
    while (i < txList.length) { completeTrades.push(txList[i]); i++ }
    while (j < divList.length) { completeTrades.push(divList[j]); j++ }
    
    var clearedPositions = getClearedPositions().map(function (p) {
      var totalPnL = p.realizedPnL + p.dividendIncome
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

  loadHeatmap: function () {
    var raw = getHeatmapData(this.data.heatmapYear, this.data.heatmapMonth)
    var dayMap = {}
    raw.forEach(function (item) { dayMap[item.day] = item })

    var firstDay = new Date(this.data.heatmapYear, this.data.heatmapMonth - 1, 1)
    var lastDay = new Date(this.data.heatmapYear, this.data.heatmapMonth, 0)
    var daysInMonth = lastDay.getDate()
    var startDow = firstDay.getDay()

    var grid = []
    for (var i = 0; i < startDow; i++) {
      grid.push({ day: 0, count: 0, amount: 0, level: 0 })
    }
    for (var d = 1; d <= daysInMonth; d++) {
      grid.push(dayMap[d] || { day: d, count: 0, amount: 0, level: 0 })
    }

    var label = this.data.heatmapYear + '年' + this.data.heatmapMonth + '月'
    this.setData({ heatmapData: grid, heatmapLabel: label })
  },

  prevMonth: function () {
    var heatmapYear = this.data.heatmapYear
    var heatmapMonth = this.data.heatmapMonth
    heatmapMonth--
    if (heatmapMonth === 0) { heatmapMonth = 12; heatmapYear-- }
    this.setData({ heatmapYear: heatmapYear, heatmapMonth: heatmapMonth }, () => {
      this.loadHeatmap()
    })
  },

  nextMonth: function () {
    var heatmapYear = this.data.heatmapYear
    var heatmapMonth = this.data.heatmapMonth
    heatmapMonth++
    if (heatmapMonth === 13) { heatmapMonth = 1; heatmapYear++ }
    this.setData({ heatmapYear: heatmapYear, heatmapMonth: heatmapMonth }, () => {
      this.loadHeatmap()
    })
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
