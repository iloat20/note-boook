/**
 * Canvas 渲染：持仓卡片截图
 */

const { fmt } = require('../helpers/format')
const { getMarketLabel } = require('../constants/market')

function renderPortfolioCard(ctx, canvas, data, width, height) {
  let dpr = data.dpr || 2

  // ====== 背景 ======
  let bgGradient = ctx.createLinearGradient(0, 0, 0, height)
  bgGradient.addColorStop(0, '#1A1A2E')
  bgGradient.addColorStop(0.5, '#16213E')
  bgGradient.addColorStop(1, '#0F3460')
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  // ====== 标题 ======
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('我的股票持仓', width / 2, 50)

  // ====== 日期 ======
  ctx.font = '12px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(data.date || '', width / 2, 75)

  // ====== 总市值 ======
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('¥' + data.totalMarketValueText || '0.00', width / 2, 140)

  // ====== 总盈亏 ======
  let pnlColor = data.totalPnL >= 0 ? '#FF6B6B' : '#34C759'
  ctx.fillStyle = pnlColor
  ctx.font = '16px sans-serif'
  let pnlText = (data.totalPnL >= 0 ? '+' : '') + (data.totalPnLText || '0.00')
  let percentText = (data.totalPnLPercent >= 0 ? '+' : '') + (data.totalPnLPercent || '0') + '%'
  ctx.fillText(pnlText + ' (' + percentText + ')', width / 2, 170)

  // ====== 分割线 ======
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(30, 200)
  ctx.lineTo(width - 30, 200)
  ctx.stroke()

  // ====== 持仓数量 ======
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('持仓 ' + data.positionCount + ' 只', 30, 225)

  // ====== 持仓列表（最多 5 只）=====
  let positions = data.positions || []
  let startY = 250

  positions.forEach(function (p, i) {
    let y = startY + i * 55

    // 市场标签
    let marketLabel = getMarketLabel(p.market) || ''
    ctx.fillStyle = p.market === 'A_SHARE' ? '#007AFF' : p.market === 'HK_SHARE' ? '#FF9500' : '#AF52DE'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(marketLabel, 50, y + 15)

    // 股票名称 + 代码
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(p.name || '', 75, y + 15)

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '11px sans-serif'
    ctx.fillText(p.code || '', 75, y + 32)

    // 盈亏
    let pnl = p.floatingPnL || 0
    ctx.fillStyle = pnl >= 0 ? '#FF6B6B' : '#34C759'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText((pnl >= 0 ? '+' : '') + fmt(pnl), width - 30, y + 20)
  })

  // ====== 底部 ======
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('由「股票记账」生成', width / 2, height - 20)
}

module.exports = { renderPortfolioCard }
