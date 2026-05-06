const { getTotalStats, getPeriodStatsList, getPositionSummary, PriceCache, getHeatmapData } = require('../../utils/storage.js')

Page({
  data: {
    currentPeriod: 'MONTH',
    periodTabs: [
      { key: 'WEEK', label: '周' },
      { key: 'MONTH', label: '月' },
      { key: 'YEAR', label: '年' }
    ],
    stats: {
      totalInvestment: 0, totalRecover: 0, totalPnL: 0, totalPnLPercent: 0,
      totalInvestmentText: '0', totalRecoverText: '0', totalPnLText: '0',
      realizedPnL: 0, realizedPnLText: '0',
      floatingPnL: 0, floatingPnLText: '0',
      dividendIncome: 0, dividendIncomeText: '0',
      totalBuyFee: 0, totalBuyFeeText: '0',
      totalSellFee: 0, totalSellFeeText: '0'
    },
    chartData: [], yAxisLabels: [],
    cumChartData: [], cumYAxisLabels: [],
    detailItems: [],
    heatmapData: [], heatmapYear: 2026, heatmapMonth: 5, heatmapLabel: '2026年5月'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadStats()
  },

  loadStats() {
    const stats = getTotalStats()
    const positions = getPositionSummary()
    let mv = 0, tc = 0
    positions.forEach(p => {
      if (p.currentPrice && p.quantity > 0) mv += p.currentPrice * p.quantity
      tc += p.avgCost * p.quantity
    })
    const fpnl = mv - tc
    const tpnl = stats.realizedPnL + fpnl + stats.dividendIncome
    const ti = tc + stats.totalBuyFee

    this.setData({
      stats: {
        ...stats,
        floatingPnL: fpnl, totalPnL: tpnl,
        totalPnLPercent: ti > 0 ? (tpnl / ti * 100) : 0,
        totalInvestmentText: this.f(stats.totalInvestment + stats.totalBuyFee),
        totalRecoverText: this.f(stats.totalRecover),
        realizedPnLText: this.f(stats.realizedPnL),
        floatingPnLText: this.f(fpnl),
        dividendIncomeText: this.f(stats.dividendIncome),
        totalBuyFeeText: this.f(stats.totalBuyFee),
        totalSellFeeText: this.f(stats.totalSellFee),
        totalPnLText: this.f(tpnl)
      }
    })

    const detailItems = [
      { label: '已实现盈亏', value: this.f(stats.realizedPnL), prefix: stats.realizedPnL >= 0 ? '+' : '', colorClass: stats.realizedPnL >= 0 ? 'profit' : 'loss' },
      { label: '浮动盈亏', value: this.f(fpnl), prefix: fpnl >= 0 ? '+' : '', colorClass: fpnl >= 0 ? 'profit' : 'loss' },
      { label: '分红收益', value: this.f(stats.dividendIncome), prefix: '+', colorClass: 'profit' },
      { label: '买入手续费', value: this.f(stats.totalBuyFee), prefix: '-', colorClass: '' },
      { label: '卖出手续费', value: this.f(stats.totalSellFee), prefix: '-', colorClass: '' }
    ]
    this.setData({ detailItems })
    this.loadChart()
    this.loadHeatmap()
  },

  loadChart() {
    const ps = getPeriodStatsList(this.data.currentPeriod, 12)
    if (ps.length === 0) return

    let mx = 0, mn = 0
    ps.forEach(s => { if (s.pnL > mx) mx = s.pnL; if (s.pnL < mn) mn = s.pnL })
    const r = Math.max(Math.abs(mx), Math.abs(mn)) || 1
    mx = Math.ceil(r / 100) * 100
    mn = -mx

    const yAxisLabels = [this.f(mx), this.f(Math.round(mx * 0.5)), '0', this.f(Math.round(mn * 0.5)), this.f(mn)]
    const chartData = ps.map(s => {
      const h = ((s.pnL - mn) / (mx - mn)) * 100
      return { label: s.label, pnL: s.pnL, pnLText: this.f(s.pnL), height: Math.max(5, Math.min(95, h)), showValue: Math.abs(s.pnL) > 10 }
    })

    let cum = 0
    const tmp = ps.map(s => { cum += s.pnL; return { label: s.label, cumulative: parseFloat(cum.toFixed(2)) } })
    let cmx = tmp.reduce((max, d) => Math.max(max, d.cumulative), 0)
    let cmn = tmp.reduce((min, d) => Math.min(min, d.cumulative), 0)
    const cr = Math.max(Math.abs(cmx), Math.abs(cmn), 1)
    cmx = Math.ceil(cr / 100) * 100
    cmn = cmn < 0 ? -cmx : 0

    const cumYAxisLabels = [this.f(cmx), this.f(Math.round(cmx * 0.5)), '0', cmn < 0 ? this.f(Math.round(cmn * 0.5)) : '', cmn < 0 ? this.f(cmn) : ''].filter(l => l !== '')
    const cumChartData = tmp.map((d, i) => {
      const pct = ((d.cumulative - cmn) / (cmx - cmn)) * 100
      return { label: d.label, cumulative: d.cumulative, cumulativeText: this.f(d.cumulative), x: (i / (ps.length - 1)) * 100, y: Math.max(5, Math.min(95, pct)) }
    })

    let cumMaxIdx = 0, cumMinIdx = 0
    tmp.forEach((d, i) => {
      if (d.cumulative > tmp[cumMaxIdx].cumulative) cumMaxIdx = i
      if (d.cumulative < tmp[cumMinIdx].cumulative) cumMinIdx = i
    })
    cumChartData[cumMaxIdx].isMax = true
    cumChartData[cumMinIdx].isMin = true

    this.setData({ yAxisLabels, chartData, cumYAxisLabels, cumChartData })
  },

  loadHeatmap() {
    const raw = getHeatmapData(this.data.heatmapYear, this.data.heatmapMonth)
    const dayMap = {}
    raw.forEach(item => { dayMap[item.day] = item })

    const firstDay = new Date(this.data.heatmapYear, this.data.heatmapMonth - 1, 1)
    const lastDay = new Date(this.data.heatmapYear, this.data.heatmapMonth, 0)
    const daysInMonth = lastDay.getDate()
    const startDow = firstDay.getDay()

    const grid = []
    for (let i = 0; i < startDow; i++) {
      grid.push({ day: 0, count: 0, amount: 0, level: 0 })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push(dayMap[d] || { day: d, count: 0, amount: 0, level: 0 })
    }

    const label = `${this.data.heatmapYear}年${this.data.heatmapMonth}月`
    this.setData({ heatmapData: grid, heatmapLabel: label })
  },

  prevMonth() {
    let year = this.data.heatmapYear
    let month = this.data.heatmapMonth - 1
    if (month === 0) { month = 12; year-- }
    this.setData({ heatmapYear: year, heatmapMonth: month })
    this.loadHeatmap()
  },

  nextMonth() {
    let year = this.data.heatmapYear
    let month = this.data.heatmapMonth + 1
    if (month === 13) { month = 1; year++ }
    this.setData({ heatmapYear: year, heatmapMonth: month })
    this.loadHeatmap()
  },

  switchPeriod(e) { this.setData({ currentPeriod: e.currentTarget.dataset.period }); this.loadChart() },

  f(num) { if (isNaN(num)) return '0.00'; return parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
})
