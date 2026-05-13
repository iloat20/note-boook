/**
 * Markdown 导出工具
 * 生成 .md 文件并分享
 */
const { Stock, Transaction, Dividend } = require('./storage')
const { fmtDate, fmtTime } = require('./format')
const { getMarketLabel } = require('./market')
const { fmt } = require('./format')

function buildMarkdown() {
  var stocks = Stock.getAll()
  var stockMap = {}
  stocks.forEach(function (s) { stockMap[s.id] = s })

  var lines = []
  lines.push('# 股票记账明细')
  lines.push('')
  lines.push('> 导出时间：' + fmtDate(new Date()) + ' ' + fmtTime(new Date()))
  lines.push('')

  // —— 交易记录 ——
  var transactions = Transaction.getAll()
  transactions.sort(function (a, b) {
    return (b.date || '').localeCompare(a.date || '') || (b.id - a.id)
  })

  lines.push('## 交易记录（' + transactions.length + ' 笔）')
  lines.push('')
  if (transactions.length > 0) {
    lines.push('| 日期 | 类型 | 代码 | 名称 | 市场 | 价格 | 数量 | 手续费 | 金额 | 备注 |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    transactions.forEach(function (t) {
      var stock = stockMap[t.stockId]
      var code = stock ? stock.code : '-'
      var name = stock ? stock.name : '-'
      var market = stock ? getMarketLabel(stock.market) : '-'
      var typeStr = t.type === 'BUY' ? '买入' : '卖出'
      var amount = (t.price || 0) * (t.quantity || 0)
      var dateStr = t.date ? fmtDate(new Date(t.date)) : '-'
      var note = (t.note || '').replace(/\|/g, '\\|')
      lines.push('| ' + dateStr + ' | ' + typeStr + ' | ' + code + ' | ' + name + ' | ' + market + ' | ' + fmt(t.price || 0) + ' | ' + (t.quantity || 0) + ' | ' + fmt(t.fee || 0) + ' | ' + fmt(amount) + ' | ' + note + ' |')
    })
  } else {
    lines.push('暂无交易记录')
  }

  // —— 分红记录 ——
  var dividends = Dividend.getAll()
  dividends.sort(function (a, b) {
    return (b.date || '').localeCompare(a.date || '') || (b.id - a.id)
  })

  lines.push('')
  lines.push('## 分红记录（' + dividends.length + ' 笔）')
  lines.push('')
  if (dividends.length > 0) {
    lines.push('| 日期 | 代码 | 名称 | 市场 | 每股金额 | 数量 | 总金额 | 备注 |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
    dividends.forEach(function (d) {
      var stock = stockMap[d.stockId]
      var code = stock ? stock.code : '-'
      var name = stock ? stock.name : '-'
      var market = stock ? getMarketLabel(stock.market) : '-'
      var dateStr = d.date ? fmtDate(new Date(d.date)) : '-'
      var note = (d.note || '').replace(/\|/g, '\\|')
      lines.push('| ' + dateStr + ' | ' + code + ' | ' + name + ' | ' + market + ' | ' + fmt(d.perShareAmount || 0) + ' | ' + (d.quantity || 0) + ' | ' + fmt(d.totalAmount || 0) + ' | ' + note + ' |')
    })
  } else {
    lines.push('暂无分红记录')
  }

  lines.push('')
  lines.push('---')
  lines.push('*由股票记账小程序自动生成*')

  return lines.join('\n')
}

function exportMD() {
  wx.showLoading({ title: '生成文件中...' })

  try {
    var mdContent = buildMarkdown()
    var fsm = wx.getFileSystemManager()
    var now = new Date()
    var timestamp = now.getFullYear() + '' +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0')
    var filePath = wx.env.USER_DATA_PATH + '/交易记录_' + timestamp + '.md'

    fsm.writeFileSync(filePath, mdContent, 'utf8')

    wx.hideLoading()

    wx.shareFileMessage({
      filePath: filePath,
      fileName: '交易记录_' + timestamp + '.md',
      success: function () {
        wx.showToast({ title: '导出成功', icon: 'success' })
      },
      fail: function () {
        wx.showModal({
          title: '导出提示',
          content: '文件已生成，但无法分享。可前往"文件管理"查看。',
          showCancel: false
        })
      }
    })
  } catch (e) {
    wx.hideLoading()
    wx.showToast({ title: '导出失败: ' + (e.message || ''), icon: 'none' })
    console.error('[exportMD]', e)
  }
}

module.exports = {
  exportMD: exportMD
}
