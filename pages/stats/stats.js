const { getTotalStats, getStatsByPeriod, getPeriodStatsList, getHeatmapData, getAllPositionsWithRealizedPnL, getPositionDistribution, getPieChartData, getScatterData, getMixedChartData } = require('../../utils/storage.js')
const { fmt } = require('../../utils/format.js')
const { exportCSV } = require('../../utils/export.js')
const echarts = require('../../components/ec-canvas/echarts')

Page({
  data: {
    currentPeriod: 'MONTH',
    periodTabs: [
      { key: 'WEEK', label: '周' },
      { key: 'MONTH', label: '月' },
      { key: 'YEAR', label: '年' }
    ],
    chartTypes: [
      { key: 'all', label: '全部' },
      { key: 'bar', label: '柱状' },
      { key: 'mixed', label: '混合' },
      { key: 'pie', label: '饼图' },
      { key: 'scatter', label: '散点' }
    ],
    currentChartType: 'all',
    ecPosition: { onInit: null },
    ecTrend: { onInit: null },
    ecPie: { onInit: null },
    ecScatter: { onInit: null },
    stats: {},
    detailItems: [],
    heatmapData: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonth: new Date().getMonth() + 1,
    heatmapLabel: '',
    completeTrades: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadStats()
    this.loadHeatmap()
    if (this._charts) {
      this.updateCharts()
    } else {
      this.initCharts()
    }
  },

  initCharts() {
    var that = this

    // === 图表1：持仓分布 3D柱状图 ===
    this.setData({
      ecPosition: {
        onInit: function (canvas, width, height, dpr) {
          var chart = echarts.init(canvas, null, { width: width, height: height, dpr: dpr })
          that._charts = that._charts || {}
          that._charts.position = chart
          var data = getPositionDistribution()
          var option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            grid: { left: 40, right: 20, top: 30, bottom: 40 },
            xAxis: {
              type: 'category',
              data: data.map(function (d) { return d.name }),
              axisLabel: { color: '#999', fontSize: 10 },
              axisLine: { lineStyle: { color: '#eee' } }
            },
            yAxis: {
              type: 'value',
              axisLabel: { color: '#999', fontSize: 10 },
              splitLine: { lineStyle: { color: '#f0f0f0' } }
            },
            series: [{
              type: 'bar',
              data: data.map(function (d) { return d.value }),
              barWidth: '50%',
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(255,107,53,0.9)' },
                  { offset: 1, color: 'rgba(255,107,53,0.3)' }
                ]),
                shadowBlur: 8,
                shadowColor: 'rgba(255,107,53,0.4)',
                shadowOffsetY: 3,
                borderRadius: [4, 4, 0, 0]
              },
              emphasis: {
                itemStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(255,140,90,0.95)' },
                    { offset: 1, color: 'rgba(255,140,90,0.5)' }
                  ])
                }
              },
              animationDuration: 1200,
              animationEasing: 'cubicOut'
            }]
          }
          chart.setOption(option)
          return chart
        }
      }
    })

    // === 图表2：盈亏趋势 混合图表 ===
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
            grid: { left: 50, right: 20, top: 40, bottom: 40 },
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
                    return params.value >= 0
                      ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                          { offset: 0, color: 'rgba(255,107,53,0.9)' },
                          { offset: 1, color: 'rgba(255,107,53,0.2)' }
                        ])
                      : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                          { offset: 0, color: 'rgba(26,160,79,0.9)' },
                          { offset: 1, color: 'rgba(26,160,79,0.2)' }
                        ])
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
                areaStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(255,107,53,0.25)' },
                    { offset: 1, color: 'rgba(255,107,53,0.02)' }
                  ])
                },
                animationDuration: 1500,
                animationEasing: 'cubicInOut'
              }
            ]
          }
          chart.setOption(option)
          return chart
        }
      }
    })

    // === 图表3：资金流向 饼图 ===
    this.setData({
      ecPie: {
        onInit: function (canvas, width, height, dpr) {
          var chart = echarts.init(canvas, null, { width: width, height: height, dpr: dpr })
          that._charts = that._charts || {}
          that._charts.pie = chart
          var pieData = getPieChartData(that.data.currentPeriod)
          var option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
            legend: {
              orient: 'vertical',
              right: 10,
              top: 'center',
              textStyle: { fontSize: 11, color: '#666' }
            },
            series: [{
              type: 'pie',
              radius: ['35%', '65%'],
              center: ['35%', '50%'],
              roseType: 'area',
              itemStyle: {
                shadowBlur: 8,
                shadowOffsetX: 2,
                shadowColor: 'rgba(0,0,0,0.1)',
                borderRadius: 6
              },
              label: { show: false },
              emphasis: {
                label: { show: true, fontSize: 12, fontWeight: 'bold' },
                itemStyle: { shadowBlur: 12 }
              },
              data: pieData.map(function (d, i) {
                var colors = ['#FF6B35', '#1AA04F', '#FFB74D', '#4FC3F7', '#BA68C8']
                return {
                  name: d.name,
                  value: d.value,
                  itemStyle: {
                    color: colors[i % colors.length],
                    shadowColor: colors[i % colors.length]
                  }
                }
              }),
              animationType: 'scale',
              animationDuration: 1200,
              animationEasing: 'elasticOut'
            }]
          }
          chart.setOption(option)
          return chart
        }
      }
    })

    // === 图表4：收益分布 散点图 ===
    this.setData({
      ecScatter: {
        onInit: function (canvas, width, height, dpr) {
          var chart = echarts.init(canvas, null, { width: width, height: height, dpr: dpr })
          that._charts = that._charts || {}
          that._charts.scatter = chart
          var scatterData = getScatterData()
          var option = {
            backgroundColor: 'transparent',
            tooltip: {
              trigger: 'item',
              formatter: function (p) {
                return p.data.name + '<br/>成本:' + p.data.value[0].toFixed(2) + '<br/>现价:' + p.data.value[1].toFixed(2) + '<br/>盈亏:' + p.data.value[2].toFixed(2)
              }
            },
            grid: { left: 50, right: 20, top: 30, bottom: 40 },
            xAxis: {
              type: 'value',
              name: '成本价',
              axisLabel: { color: '#999', fontSize: 10 },
              splitLine: { lineStyle: { color: '#f0f0f0' } }
            },
            yAxis: {
              type: 'value',
              name: '当前价',
              axisLabel: { color: '#999', fontSize: 10 },
              splitLine: { lineStyle: { color: '#f0f0f0' } }
            },
            series: [{
              type: 'scatter',
              data: scatterData,
              symbolSize: function (val) {
                return Math.max(8, Math.min(30, Math.abs(val[2]) / 100 + 8))
              },
              itemStyle: {
                color: function (params) {
                  return params.data.returnRate >= 0 ? 'rgba(255,107,53,0.8)' : 'rgba(26,160,79,0.8)'
                },
                shadowBlur: 10,
                shadowColor: 'rgba(0,0,0,0.15)'
              },
              emphasis: {
                itemStyle: {
                  shadowBlur: 16,
                  shadowColor: 'rgba(0,0,0,0.3)'
                }
              },
              animationDuration: 1200,
              animationEasing: 'cubicOut'
            }]
          }
          chart.setOption(option)
          return chart
        }
      }
    })
  },

  updateCharts: function () {
    var period = this.data.currentPeriod
    if (this._charts && this._charts.position) {
      var data = getPositionDistribution()
      this._charts.position.setOption({
        xAxis: { data: data.map(function (d) { return d.name }) },
        series: [{ data: data.map(function (d) { return d.value }) }]
      })
    }
    if (this._charts && this._charts.trend) {
      var mixed = getMixedChartData(period, 12)
      this._charts.trend.setOption({
        xAxis: { data: mixed.labels },
        series: [{ data: mixed.barData }, { data: mixed.lineData }]
      })
    }
    if (this._charts && this._charts.pie) {
      var pieData = getPieChartData(period)
      this._charts.pie.setOption({
        series: [{
          data: pieData.map(function (d, i) {
            var colors = ['#FF6B35', '#1AA04F', '#FFB74D', '#4FC3F7', '#BA68C8']
            return { name: d.name, value: d.value,
              itemStyle: { color: colors[i % colors.length], shadowColor: colors[i % colors.length] }
            }
          })
        }]
      })
    }
    if (this._charts && this._charts.scatter) {
      this._charts.scatter.setOption({
        series: [{ data: getScatterData() }]
      })
    }
  },

  switchChartType: function (e) {
    this.setData({ currentChartType: e.currentTarget.dataset.key })
  },

  switchPeriod: function (e) {
    this.setData({ currentPeriod: e.currentTarget.dataset.period }, function () {
      this.loadStats()
      if (this._charts) {
        this.updateCharts()
      } else {
        this.initCharts()
      }
    }.bind(this))
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
    var completeTrades = getAllPositionsWithRealizedPnL().map(function (p) {
      return Object.assign({}, p, { totalPnLText: fmt(p.totalPnL) })
    })
    this.setData({ detailItems: detailItems, completeTrades: completeTrades })
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
    this.setData({ heatmapYear: heatmapYear, heatmapMonth: heatmapMonth }, function () {
      this.loadHeatmap()
    }.bind(this))
  },

  nextMonth: function () {
    var heatmapYear = this.data.heatmapYear
    var heatmapMonth = this.data.heatmapMonth
    heatmapMonth++
    if (heatmapMonth === 13) { heatmapMonth = 1; heatmapYear++ }
    this.setData({ heatmapYear: heatmapYear, heatmapMonth: heatmapMonth }, function () {
      this.loadHeatmap()
    }.bind(this))
  },

  onExportCSV: function () {
    exportCSV(this)
  }
})
