const { getTotalStats, getStatsByPeriod, getPeriodStatsList, getHeatmapData, getClearedPositions, getMixedChartData, getPositionSummary, getStrategyStats, Stock, Transaction, Dividend } = require('../../utils/storage.js')
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
            series: [
              {
                name: '月度盈亏',
                type: 'bar',
                data: mixed.barData,
                itemStyle: {
                  color: function (params) {
                    return params.value >= 0 ? getCachedGradient('barPositive') : getCachedGradient('barNegative')
                  },
                  borderRadius: [3, 3, 0, 0],
                  shadowBlur: 4,
                  shadowColor: 'rgba(0,0,0,0.1)'
                },
                animationDuration: 1000
              },
              {
                name: '累计收益',
                type: 'line',
                yAxisIndex: 1,
                data: mixed.lineData,
                smooth: true,
                lineStyle: { width: 3, shadowBlur: 8, shadowColor: 'rgba(255,107,53,0.3)' },
                itemStyle: { color: '#FF6B35' },
                areaStyle: { color: getCachedGradient('lineArea') },
                animationDuration: 1500,
                animationEasing: 'cubicInOut'
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
    var allTx = Transaction.getAll().concat(
      Dividend.getAll().map(function (d) {
        return { id: d.id, stockId: d.stockId, type: 'DIVIDEND', date: d.date, amount: d.totalAmount, quantity: d.quantity }
      })
    )
    allTx.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.id - a.id) })
    var completeTrades = allTx.map(function (t) {
      var stock = stockMap[t.stockId]
      var typeStr = t.type === 'BUY' ? '买入' : t.type === 'SELL' ? '卖出' : '分红'
      var amount = t.type === 'DIVIDEND' ? (t.amount || 0) : (t.price || 0) * (t.quantity || 0)
      return {
        id: t.id,
        name: stock ? stock.name : '-',
        code: stock ? stock.code : '-',
        market: stock ? stock.market : '',
        type: t.type,
        typeText: typeStr,
        dateText: t.date ? fmtDate(new Date(t.date)) : '-',
        amountText: fmt(amount),
        totalPnLText: (t.type === 'BUY' ? '-' : '+') + fmt(amount)
      }
    })
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
    var year = new Date().getFullYear()
    var transactions = Transaction.getAll()
    var dividends = Dividend.getAll()
    var stocks = Stock.getAll()
    var stockMap = {}
    stocks.forEach(function (s) { stockMap[s.id] = s })

    // 筛选本年交易
    var yearStart = new Date(year, 0, 1)
    var yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    var yearTx = transactions.filter(function (t) {
      var d = new Date(t.date)
      return d >= yearStart && d <= yearEnd
    })
    var yearDivs = dividends.filter(function (d) {
      var dd = new Date(d.date)
      return dd >= yearStart && dd <= yearEnd
    })

    // 交易统计
    var buyCount = 0, sellCount = 0, buyAmount = 0, sellAmount = 0
    yearTx.forEach(function (t) {
      if (t.type === 'BUY') { buyCount++; buyAmount += t.price * t.quantity }
      else { sellCount++; sellAmount += t.price * t.quantity }
    })
    var tradeCount = yearTx.length

    // 月度盈亏
    var monthlyPnL = []
    for (var m = 0; m < 12; m++) {
      var mStart = new Date(year, m, 1)
      var mEnd = new Date(year, m + 1, 0, 23, 59, 59, 999)
      var mTx = transactions.filter(function (t) {
        var d = new Date(t.date)
        return d >= mStart && d <= mEnd
      })
      var mDivs = dividends.filter(function (d) {
        var dd = new Date(d.date)
        return dd >= mStart && dd <= mEnd
      })
      var mBuy = 0, mSell = 0, mBuyFee = 0, mSellFee = 0
      mTx.forEach(function (t) {
        if (t.type === 'BUY') { mBuy += t.price * t.quantity; mBuyFee += t.fee }
        else { mSell += t.price * t.quantity; mSellFee += t.fee }
      })
      var mDiv = mDivs.reduce(function (s, d) { return s + d.totalAmount }, 0)
      var mPnL = mSell - mSellFee - mBuy - mBuyFee + mDiv
      monthlyPnL.push({ month: m + 1, pnL: parseFloat(mPnL.toFixed(2)) })
    }

    // 胜率：本年已清仓且 totalPnL > 0
    var cleared = getClearedPositions()
    var yearCleared = cleared.filter(function (p) {
      return p.quantity === 0
    })
    var winCount = yearCleared.filter(function (p) {
      return (p.realizedPnL + p.dividendIncome) > 0
    }).length
    var winRate = yearCleared.length > 0 ? Math.round(winCount / yearCleared.length * 100) : 0

    // Top/Bottom 股票
    var allPositions = getPositionSummary().concat(cleared.map(function (p) {
      return Object.assign({}, p, { floatingPnL: 0 })
    }))
    var stockPnL = {}
    allPositions.forEach(function (p) {
      var key = p.code
      if (!stockPnL[key]) {
        stockPnL[key] = { code: p.code, name: p.name, market: p.market, totalPnL: 0 }
      }
      stockPnL[key].totalPnL += (p.realizedPnL || 0) + (p.floatingPnL || 0) + (p.dividendIncome || 0)
    })
    var stockList = Object.values(stockPnL).map(function (s) {
      s.totalPnL = parseFloat(s.totalPnL.toFixed(2))
      s.totalPnLText = fmt(Math.abs(s.totalPnL))
      return s
    }).sort(function (a, b) { return b.totalPnL - a.totalPnL })
    var topStocks = stockList.slice(0, 5)
    var bottomStocks = stockList.slice(-5).reverse()

    // 策略分布
    var strategyStats = getStrategyStats()
    var maxStrategyCount = strategyStats.length > 0 ? strategyStats[0].count : 1
    strategyStats = strategyStats.slice(0, 8).map(function (s) {
      s.percent = Math.round(s.count / maxStrategyCount * 100)
      return s
    })

    // 总计
    var totalStats = getTotalStats()
    var dividendIncome = yearDivs.reduce(function (s, d) { return s + d.totalAmount }, 0)

    this.setData({
      showAnnualReport: true,
      annualReportData: {
        year: year,
        tradeCount: tradeCount,
        buyCount: buyCount,
        sellCount: sellCount,
        winRate: winRate,
        totalPnL: totalStats.totalPnL,
        totalPnLText: fmt(Math.abs(totalStats.totalPnL)),
        totalPnLPercent: totalStats.totalPnLPercent,
        totalInvestmentText: fmt(totalStats.totalInvestment),
        totalRecoveryText: fmt(totalStats.totalInvestment + totalStats.totalPnL),
        dividendIncomeText: fmt(dividendIncome),
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
