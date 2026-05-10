const { getTotalStats, getStatsByPeriod, getPeriodStatsList, getHeatmapData, getAllPositionsWithRealizedPnL } = require('../../utils/storage.js')
const { fmt } = require('../../utils/format.js')
const { exportCSV } = require('../../utils/export.js')

Page({
  data: {
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
    monthlyPnL: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadStats()
    this.loadMonthlyPnL()
  },

  loadStats() {
    const period = this.data.currentPeriod
    const stats = getStatsByPeriod(period)

    const totalInvestment = stats.buyAmount + stats.buyFee
    const totalRecover = stats.sellAmount - stats.sellFee
    const totalPnL = stats.pnL

    this.setData({
      stats: {
        totalInvestment,
        totalRecover,
        totalPnL,
        totalInvestmentText: fmt(totalInvestment),
        totalRecoverText: fmt(totalRecover),
        totalPnLText: fmt(totalPnL),
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
    const completeTrades = getAllPositionsWithRealizedPnL().map(p => ({
      ...p,
      totalPnLText: fmt(p.totalPnL)
    }))
    this.setData({ detailItems, completeTrades })
    this.loadHeatmap()
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
    let { heatmapYear, heatmapMonth } = this.data
    heatmapMonth--
    if (heatmapMonth === 0) { heatmapMonth = 12; heatmapYear-- }
    this.setData({ heatmapYear, heatmapMonth }, () => this.loadHeatmap())
  },

  nextMonth() {
    let { heatmapYear, heatmapMonth } = this.data
    heatmapMonth++
    if (heatmapMonth === 13) { heatmapMonth = 1; heatmapYear++ }
    this.setData({ heatmapYear, heatmapMonth }, () => this.loadHeatmap())
  },

  switchPeriod(e) {
    this.setData({ currentPeriod: e.currentTarget.dataset.period }, () => {
      this.loadStats()
    })
  },

  onExportCSV() {
    exportCSV(this)
  },

  loadMonthlyPnL() {
    var list = getPeriodStatsList('MONTH', 12)
    var monthly = list.map(function (item) {
      return {
        label: item.label,
        pnL: item.pnL || 0
      }
    })
    this.setData({ monthlyPnL: monthly })
    // 等setData渲染完再绘图
    var that = this
    setTimeout(function () { that.drawPnlChart() }, 300)
  },

  drawPnlChart() {
    var that = this
    try {
      var query = wx.createSelectorQuery().in(this)
      query.select('#pnlChart')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            console.warn('[drawPnlChart] canvas not ready')
            return
          }
          var canvas = res[0].node
          var ctx = canvas.getContext('2d')
          var dpr = wx.getSystemInfoSync().pixelRatio || 2
          canvas.width = res[0].width * dpr
          canvas.height = res[0].height * dpr
          ctx.scale(dpr, dpr)

          var data = that.data.monthlyPnL
          if (!data || data.length === 0) return

          var W = res[0].width
          var H = res[0].height
          var padL = 50, padR = 20, padT = 30, padB = 40
          var plotW = W - padL - padR
          var plotH = H - padT - padB

          // 清空
          ctx.clearRect(0, 0, W, H)

          // 计算最大绝对值
          var maxVal = 1
          data.forEach(function (d) {
            var abs = Math.abs(d.pnL)
            if (abs > maxVal) maxVal = abs
          })

          var barW = Math.max(8, (plotW / data.length) * 0.6)
          var gap = (plotW - barW * data.length) / (data.length + 1)

          // 画横线（零线）
          ctx.beginPath()
          var zeroY = padT + plotH / 2
          ctx.moveTo(padL, zeroY)
          ctx.lineTo(padL + plotW, zeroY)
          ctx.strokeStyle = '#CCCCCC'
          ctx.lineWidth = 1
          ctx.stroke()

          // 画柱
          data.forEach(function (d, i) {
            var x = padL + gap + i * (barW + gap)
            var barH = (Math.abs(d.pnL) / maxVal) * (plotH / 2)
            var y = d.pnL >= 0 ? zeroY - barH : zeroY
            ctx.fillStyle = d.pnL >= 0 ? '#E04040' : '#1AA04F'
            ctx.fillRect(x, y, barW, barH)

            // 标签
            ctx.fillStyle = '#555555'
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(d.pnL >= 0 ? '+' + d.pnL.toFixed(0) : d.pnL.toFixed(0), x + barW / 2, y - 4)

            // X轴标签
            ctx.fillStyle = '#888888'
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'
            var label = d.label.length > 5 ? d.label.slice(2) : d.label
            ctx.fillText(label, x + barW / 2, H - padB + 15)
          })
        })
    } catch (e) {
      console.warn('[drawPnlChart]', e)
    }
  }
})
