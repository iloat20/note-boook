var { fmt } = require('../../utils/format')

Component({
  properties: {
    data: {
      type: Object,
      value: null
    }
  },

  observers: {
    'data.monthlyPnL': function (monthlyPnL) {
      if (monthlyPnL && monthlyPnL.length > 0) {
        var that = this
        setTimeout(function () { that._drawMonthlyChart(monthlyPnL) }, 150)
      }
    }
  },

  methods: {
    onClose: function () {
      this.triggerEvent('close')
    },

    _drawMonthlyChart: function (monthlyPnL) {
      var that = this
      var query = this.createSelectorQuery()
      query.select('#monthlyCanvas').fields({ node: true, size: true }).exec(function (res) {
        if (!res || !res[0] || !res[0].node) return

        var canvas = res[0].node
        var ctx = canvas.getContext('2d')
        var dpr = 2
        var W = res[0].width
        var H = res[0].height
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        // 计算数据范围
        var maxVal = 0
        monthlyPnL.forEach(function (m) {
          var v = Math.abs(m.pnL)
          if (v > maxVal) maxVal = v
        })
        if (maxVal === 0) maxVal = 1

        var padX = 10
        var padY = 20
        var padBottom = 28
        var chartW = W - padX * 2
        var chartH = H - padY - padBottom
        var barW = chartW / 12 * 0.6
        var gap = chartW / 12

        // 零线
        var zeroY = padY + chartH / 2
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
          var x = padX + i * gap + (gap - barW) / 2
          var barH = (Math.abs(m.pnL) / maxVal) * (chartH / 2 - 4)
          if (barH < 2 && Math.abs(m.pnL) > 0) barH = 2

          if (m.pnL >= 0) {
            var grad = ctx.createLinearGradient(0, zeroY - barH, 0, zeroY)
            grad.addColorStop(0, '#FF6B6B')
            grad.addColorStop(1, 'rgba(255,107,107,0.3)')
            ctx.fillStyle = grad
            roundRectPath(ctx, x, zeroY - barH, barW, barH, 3)
            ctx.fill()
          } else {
            var grad2 = ctx.createLinearGradient(0, zeroY, 0, zeroY + barH)
            grad2.addColorStop(0, 'rgba(81,207,102,0.3)')
            grad2.addColorStop(1, '#51CF66')
            ctx.fillStyle = grad2
            roundRectPath(ctx, x, zeroY, barW, barH, 3)
            ctx.fill()
          }

          // 月份标签
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.font = '9px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(String(i + 1) + '月', x + barW / 2, H - 8)
        })

        ctx.textAlign = 'start'
      })
    }
  }
})

function roundRectPath(ctx, x, y, w, h, r) {
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
