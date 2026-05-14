/**
 * Canvas 渲染工具 — 持仓截图卡片（雪球风格）
 */
var { fmt } = require('./format')
var { getMarketLabel } = require('./market')

function roundRect(ctx, x, y, w, h, r) {
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

function renderPortfolioCard(ctx, canvas, data, w, h) {
  var dpr = data.dpr || 2
  var W = w
  var H = h

  // === 背景渐变 ===
  var bgGrad = ctx.createLinearGradient(0, 0, W, H)
  bgGrad.addColorStop(0, '#1A1A2E')
  bgGrad.addColorStop(1, '#0F3460')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)

  // === 装饰圆形 ===
  ctx.globalAlpha = 0.06
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(W * 0.85, H * 0.12, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W * 0.1, H * 0.75, 80, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // === 顶部标题 ===
  var padX = 32
  var y = 60

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '13px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(data.date || '', padX, y)

  y += 28
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 22px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('我的持仓', padX, y)

  // === 总市值 ===
  y += 50
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '13px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('总市值 (¥)', padX, y)

  y += 36
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(fmt(data.totalMarketValue || 0), padX, y)

  // === 总盈亏 ===
  y += 40
  var pnl = data.totalPnL || 0
  var pnlPct = data.totalPnLPercent || 0
  var pnlColor = pnl >= 0 ? '#FF6B6B' : '#51CF66'
  var pnlSign = pnl >= 0 ? '+' : ''

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '13px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('总盈亏', padX, y)

  ctx.fillStyle = pnlColor
  ctx.font = 'bold 24px -apple-system, "PingFang SC", sans-serif'
  var pnlText = pnlSign + fmt(pnl)
  ctx.fillText(pnlText, padX, y + 32)

  var pnlTextW = ctx.measureText(pnlText).width
  ctx.fillStyle = pnlColor
  ctx.font = '16px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(pnlSign + pnlPct.toFixed(2) + '%', padX + pnlTextW + 12, y + 32)

  // === 持仓数量 ===
  y += 65
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('共 ' + (data.positionCount || 0) + ' 只股票', padX, y)

  // === 分隔线 ===
  y += 24
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX, y)
  ctx.lineTo(W - padX, y)
  ctx.stroke()

  // === 持仓明细 ===
  var topPositions = (data.positions || []).slice(0, 5)
  y += 28

  topPositions.forEach(function (pos, i) {
    // 排名徽章
    ctx.globalAlpha = 0.15
    roundRect(ctx, padX, y - 12, 20, 20, 4)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = 'bold 11px -apple-system, "PingFang SC", sans-serif'
    ctx.fillText(String(i + 1), padX + 5, y + 3)

    // 市场标签
    var mktLabel = getMarketLabel(pos.market)
    ctx.font = '10px -apple-system, "PingFang SC", sans-serif'
    var mktW = ctx.measureText(mktLabel).width + 12
    roundRect(ctx, padX + 28, y - 10, mktW, 18, 4)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(mktLabel, padX + 34, y + 3)

    // 名称 + 代码
    ctx.fillStyle = '#fff'
    ctx.font = '14px -apple-system, "PingFang SC", sans-serif'
    ctx.fillText(pos.name, padX + 28 + mktW + 8, y + 2)

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '12px -apple-system, "PingFang SC", sans-serif'
    ctx.fillText(pos.code, padX + 28 + mktW + 8 + ctx.measureText(pos.name).width + 6, y + 2)

    // 盈亏
    var posPnl = pos.floatingPnL || 0
    var posPnlSign = posPnl >= 0 ? '+' : ''
    ctx.fillStyle = posPnl >= 0 ? '#FF6B6B' : '#51CF66'
    ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif'
    var posPnlText = posPnlSign + fmt(posPnl)
    ctx.fillText(posPnlText, W - padX - ctx.measureText(posPnlText).width, y + 2)

    y += 40
  })

  // === 底部品牌 ===
  y = H - 50
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(padX, y)
  ctx.lineTo(W - padX, y)
  ctx.stroke()

  y += 24
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '11px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('股票记账 · 投资备忘录', padX, y)

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif'
  var brandW = ctx.measureText('股票记账 · 投资备忘录').width
  ctx.fillText(data.date || '', padX + brandW + 16, y)
}

module.exports = {
  renderPortfolioCard: renderPortfolioCard
}
