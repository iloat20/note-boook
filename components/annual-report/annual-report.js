let { fmt } = require('../../utils/helpers/format')

Component({
  properties: {
    data: {
      type: Object,
      value: null
    }
  },

  data: {
    exporting: false
  },

  lifetimes: {
    ready: function () {
      let data = this.properties.data
      if (data && data.monthlyPnL && data.monthlyPnL.length > 0) {
        let that = this
        setTimeout(function () { that._drawMonthlyChart(data.monthlyPnL) }, 200)
      }
    }
  },

  observers: {
    'data.monthlyPnL': function (monthlyPnL) {
      if (monthlyPnL && monthlyPnL.length > 0) {
        let that = this
        setTimeout(function () { that._drawMonthlyChart(monthlyPnL) }, 150)
      }
    }
  },

  methods: {
    onClose: function () {
      this.triggerEvent('close')
    },

    onExportImage: function () {
      if (this.data.exporting) return
      let that = this
      this.setData({ exporting: true })

      wx.showLoading({ title: '生成图片中...' })

      setTimeout(function () {
        that._drawExportCanvas(function (tempFilePath) {
          wx.hideLoading()
          if (!tempFilePath) {
            that.setData({ exporting: false })
            wx.showToast({ title: '生成失败', icon: 'none' })
            return
          }

          // 保存到相册
          wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: function () {
              wx.showToast({ title: '已保存到相册', icon: 'success' })
              that.setData({ exporting: false })
            },
            fail: function (err) {
              if (err.errMsg.indexOf('auth deny') !== -1 || err.errMsg.indexOf('authorize') !== -1) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片到相册',
                  confirmText: '去设置',
                  success: function (res) {
                    if (res.confirm) {
                      wx.openSetting()
                    }
                  }
                })
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' })
              }
              that.setData({ exporting: false })
            }
          })
        })
      }, 100)
    },

    _drawExportCanvas: function (callback) {
      let that = this
      let reportData = this.properties.data
      if (!reportData) {
        callback('')
        return
      }

      let query = this.createSelectorQuery()
      query.select('#exportCanvas').fields({ node: true, size: true }).exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          callback('')
          return
        }

        let canvas = res[0].node
        let ctx = canvas.getContext('2d')
        let dpr = 2
        let W = 750
        let H = 2400
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        // 背景
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, W, H)

        let y = 0

        // === Hero 区域 ===
        y = 60
        // 年份
        ctx.fillStyle = 'rgba(0,0,0,0.04)'
        ctx.font = 'bold 120px -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(reportData.year), W / 2, y)
        y += 80

        // 标题
        ctx.fillStyle = '#999999'
        ctx.font = '15px -apple-system, sans-serif'
        ctx.fillText('年度投资报告', W / 2, y)
        y += 50

        // 总盈亏
        let pnlColor = reportData.totalPnL >= 0 ? '#FF6B6B' : '#34C759'
        ctx.fillStyle = pnlColor
        ctx.font = 'bold 56px -apple-system, sans-serif'
        let pnlText = (reportData.totalPnL >= 0 ? '+' : '') + reportData.totalPnLText
        ctx.fillText(pnlText, W / 2, y)
        y += 40

        // 百分比
        ctx.fillStyle = '#999999'
        ctx.font = '16px -apple-system, sans-serif'
        ctx.fillText((reportData.totalPnL >= 0 ? '+' : '') + reportData.totalPnLPercent + '%', W / 2, y)
        y += 80

        // === 交易概览 ===
        ctx.fillStyle = '#999999'
        ctx.font = '13px -apple-system, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('交易概览', 32, y)
        y += 30

        // 网格背景
        ctx.fillStyle = '#F5F5F5'
        roundRect(ctx, 24, y, W - 48, 100, 12)
        ctx.fill()

        let gridY = y + 20
        let gridItems = [
          { value: String(reportData.tradeCount), label: '交易笔数' },
          { value: reportData.winRate + '%', label: '胜率', color: reportData.winRate >= 50 ? '#FF6B6B' : '#34C759' },
          { value: String(reportData.buyCount), label: '买入次数' },
          { value: String(reportData.sellCount), label: '卖出次数' }
        ]

        let gridW = (W - 48 - 12 * 3) / 4
        gridItems.forEach(function (item, i) {
          let x = 24 + i * (gridW + 12) + gridW / 2
          ctx.textAlign = 'center'
          ctx.fillStyle = item.color || '#1C1C1E'
          ctx.font = 'bold 22px -apple-system, sans-serif'
          ctx.fillText(item.value, x, gridY + 20)
          ctx.fillStyle = '#999999'
          ctx.font = '11px -apple-system, sans-serif'
          ctx.fillText(item.label, x, gridY + 42)
        })

        y += 120

        // === 资金流向 ===
        ctx.textAlign = 'left'
        ctx.fillStyle = '#999999'
        ctx.font = '13px -apple-system, sans-serif'
        ctx.fillText('资金流向', 32, y)
        y += 30

        ctx.fillStyle = '#F5F5F5'
        roundRect(ctx, 24, y, W - 48, 80, 12)
        ctx.fill()

        let flowY = y + 30
        let flowItems = [
          { label: '总投入', value: '¥' + reportData.totalInvestmentText },
          { label: '总回收', value: '¥' + reportData.totalRecoveryText },
          { label: '分红收入', value: '¥' + reportData.dividendIncomeText, color: '#FF6B6B' }
        ]

        let flowW = (W - 48) / 3
        flowItems.forEach(function (item, i) {
          let x = 24 + i * flowW + flowW / 2
          ctx.textAlign = 'center'
          ctx.fillStyle = '#999999'
          ctx.font = '11px -apple-system, sans-serif'
          ctx.fillText(item.label, x, flowY)
          ctx.fillStyle = item.color || '#1C1C1E'
          ctx.font = 'bold 14px -apple-system, sans-serif'
          ctx.fillText(item.value, x, flowY + 22)
        })

        y += 110

        // === 月度盈亏 ===
        ctx.textAlign = 'left'
        ctx.fillStyle = '#999999'
        ctx.font = '13px -apple-system, sans-serif'
        ctx.fillText('月度盈亏', 32, y)
        y += 30

        // 绘制月度盈亏图表
        y = that._drawMonthlyChartOnCanvas(ctx, reportData.monthlyPnL, y, W)

        // === Top5 ===
        if (reportData.topStocks && reportData.topStocks.length > 0) {
          y += 30
          ctx.textAlign = 'left'
          ctx.fillStyle = '#999999'
          ctx.font = '13px -apple-system, sans-serif'
          ctx.fillText('收益最高', 32, y)
          y += 30

          reportData.topStocks.forEach(function (stock, i) {
            let badgeColors = ['#FFD700', '#C0C0C0', '#CD7F32']
            let badgeColor = badgeColors[i] || 'rgba(0,0,0,0.08)'

            // 背景
            ctx.fillStyle = '#F5F5F5'
            roundRect(ctx, 24, y, W - 48, 56, 10)
            ctx.fill()

            // 排名徽章
            ctx.fillStyle = badgeColor
            roundRect(ctx, 34, y + 14, 28, 28, 6)
            ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.font = 'bold 12px -apple-system, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(String(i + 1), 48, y + 33)

            // 股票名称
            ctx.fillStyle = '#1C1C1E'
            ctx.font = '15px -apple-system, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(stock.name, 72, y + 28)

            // 盈亏
            let pnlColor2 = stock.totalPnL >= 0 ? '#FF6B6B' : '#34C759'
            ctx.fillStyle = pnlColor2
            ctx.font = 'bold 16px -apple-system, sans-serif'
            ctx.textAlign = 'right'
            let pnlText2 = (stock.totalPnL >= 0 ? '+' : '') + stock.totalPnLText
            ctx.fillText(pnlText2, W - 32, y + 34)

            y += 66
          })

          y += 10
        }

        // === 策略分布 ===
        if (reportData.strategyStats && reportData.strategyStats.length > 0) {
          y += 20
          ctx.textAlign = 'left'
          ctx.fillStyle = '#999999'
          ctx.font = '13px -apple-system, sans-serif'
          ctx.fillText('策略分布', 32, y)
          y += 30

          reportData.strategyStats.forEach(function (s) {
            ctx.fillStyle = '#1C1C1E'
            ctx.font = '14px -apple-system, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(s.tag, 32, y)
            ctx.textAlign = 'right'
            ctx.fillStyle = '#999999'
            ctx.font = '12px -apple-system, sans-serif'
            ctx.fillText(s.count + '次', W - 32, y)
            y += 24

            // 进度条背景
            ctx.fillStyle = 'rgba(0,0,0,0.04)'
            roundRect(ctx, 32, y, W - 64, 6, 3)
            ctx.fill()

            // 进度条
            ctx.fillStyle = '#FF6B6B'
            roundRect(ctx, 32, y, (W - 64) * s.percent / 100, 6, 3)
            ctx.fill()

            y += 24
          })

          y += 10
        }

        // === Footer ===
        y += 40
        ctx.fillStyle = '#C7C7CC'
        ctx.font = '12px -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('股票记账 · ' + reportData.year + '年度报告', W / 2, y)

        // 导出
        wx.canvasToTempFilePath({
          canvas: canvas,
          fileType: 'png',
          quality: 1,
          success: function (res) {
            callback(res.tempFilePath)
          },
          fail: function () {
            callback('')
          }
        })
      })
    },

    _drawMonthlyChartOnCanvas: function (ctx, monthlyPnL, startY, W) {
      if (!monthlyPnL || monthlyPnL.length === 0) return startY + 180

      let chartH = 180
      let padX = 32
      let padBottom = 28
      let chartW = W - padX * 2
      let chartTop = startY
      let barAreaH = chartH - padBottom

      // 背景
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      roundRect(ctx, padX - 8, chartTop - 12, chartW + 16, chartH + 24, 12)
      ctx.fill()

      _drawMonthlyBars(ctx, monthlyPnL, {
        padX, chartW, barAreaH, chartTop, chartH, W,
        labelY: chartTop + chartH - 8
      })

      ctx.textAlign = 'start'
      return startY + chartH + 24
    },

    _drawMonthlyChart: function (monthlyPnL) {
      let that = this
      let query = this.createSelectorQuery()
      query.select('#monthlyCanvas').fields({ node: true, size: true }).exec(function (res) {
        if (!res || !res[0] || !res[0].node) return

        let canvas = res[0].node
        let ctx = canvas.getContext('2d')
        let dpr = 2
        let W = res[0].width
        let H = res[0].height
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        let padX = 10
        let padY = 20
        let padBottom = 28
        let chartW = W - padX * 2
        let chartH = H - padY - padBottom
        let barAreaH = chartH
        let chartTop = padY

        _drawMonthlyBars(ctx, monthlyPnL, {
          padX, chartW, barAreaH, chartTop, chartH, W,
          labelY: H - 8
        })

        ctx.textAlign = 'start'
      })
    }
  }
})

/**
 * 共享月度盈亏柱状图绘制
 * 被 _drawMonthlyChartOnCanvas 和 _drawMonthlyChart 共用
 */
function _drawMonthlyBars(ctx, monthlyPnL, opts) {
  let { padX, chartW, barAreaH, chartTop, chartH, W, labelY } = opts

  // 计算数据范围
  let maxVal = 0
  monthlyPnL.forEach(function (m) {
    let v = Math.abs(m.pnL)
    if (v > maxVal) maxVal = v
  })
  if (maxVal === 0) maxVal = 1

  let barW = chartW / 12 * 0.6
  let gap = chartW / 12
  let zeroY = chartTop + barAreaH / 2

  // 零线
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(padX, zeroY)
  ctx.lineTo(W - padX, zeroY)
  ctx.stroke()
  ctx.setLineDash([])

  // 柱子
  monthlyPnL.forEach(function (m, i) {
    let x = padX + i * gap + (gap - barW) / 2
    let barH = (Math.abs(m.pnL) / maxVal) * (barAreaH / 2 - 4)
    if (barH < 2 && Math.abs(m.pnL) > 0) barH = 2

    if (m.pnL >= 0) {
      let grad = ctx.createLinearGradient(0, zeroY - barH, 0, zeroY)
      grad.addColorStop(0, '#FF6B6B')
      grad.addColorStop(1, 'rgba(255,107,107,0.3)')
      ctx.fillStyle = grad
      roundRect(ctx, x, zeroY - barH, barW, barH, 3)
      ctx.fill()
    } else {
      let grad2 = ctx.createLinearGradient(0, zeroY, 0, zeroY + barH)
      grad2.addColorStop(0, 'rgba(81,207,102,0.3)')
      grad2.addColorStop(1, '#34C759')
      ctx.fillStyle = grad2
      roundRect(ctx, x, zeroY, barW, barH, 3)
      ctx.fill()
    }

    // 月份标签
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '9px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1) + '月', x + barW / 2, labelY)
  })
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return
  if (r > h / 2) r = h / 2
  if (r > w / 2) r = w / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
