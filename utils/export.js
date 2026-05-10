/**
 * CSV 导出工具
 * 依赖 storage.js 中的数据，生成CSV文件并分享
 */
const { Stock, Transaction, Dividend, PriceCache } = require('./storage')
const { fmtDate } = require('./format')
const { MARKETS } = require('./constants')

function getMarketLabel(market) {
  var map = {}
  map[MARKETS.A_SHARE] = 'A股'
  map[MARKETS.HK_SHARE] = '港股'
  map[MARKETS.US_SHARE] = '美股'
  return map[market] || market
}

/**
 * 导出全部数据为CSV文本
 * @returns {string} CSV文本内容
 */
function buildFullCSV() {
  var lines = []

  // —— 股票列表 ——
  lines.push('=== 股票列表 ===')
  lines.push('ID,代码,名称,市场,创建时间')
  var stocks = Stock.getAll()
  stocks.forEach(function (s) {
    lines.push([s.id, s.code, s.name, getMarketLabel(s.market), s.createdAt || ''].join(','))
  })

  // —— 交易记录 ——
  lines.push('')
  lines.push('=== 交易记录 ===')
  lines.push('ID,股票ID,代码,名称,类型,价格,数量,手续费,日期,备注')
  var transactions = Transaction.getAll()
  transactions.forEach(function (t) {
    var stock = stocks.find(function (s) { return s.id === t.stockId })
    var code = stock ? stock.code : ''
    var name = stock ? stock.name : ''
    var typeStr = t.type === 'BUY' ? '买入' : '卖出'
    var dateStr = t.date ? fmtDate(new Date(t.date)) : ''
    lines.push([t.id, t.stockId, code, name, typeStr, t.price, t.quantity, t.fee, dateStr, (t.note || '').replace(/,/g, '，')].join(','))
  })

  // —— 分红记录 ——
  lines.push('')
  lines.push('=== 分红记录 ===')
  lines.push('ID,股票ID,代码,名称,每股金额,数量,总金额,日期,备注')
  var dividends = Dividend.getAll()
  dividends.forEach(function (d) {
    var stock = stocks.find(function (s) { return s.id === d.stockId })
    var code = stock ? stock.code : ''
    var name = stock ? stock.name : ''
    var dateStr = d.date ? fmtDate(new Date(d.date)) : ''
    lines.push([d.id, d.stockId, code, name, d.perShareAmount, d.quantity, d.totalAmount, dateStr, (d.note || '').replace(/,/g, '，')].join(','))
  })

  // —— 价格缓存 ——
  lines.push('')
  lines.push('=== 最新价格 ===')
  lines.push('股票ID,代码,名称,最新价格')
  var prices = PriceCache.getAll()
  Object.keys(prices).forEach(function (stockId) {
    var stock = stocks.find(function (s) { return s.id === parseInt(stockId) })
    var code = stock ? stock.code : ''
    var name = stock ? stock.name : ''
    lines.push([stockId, code, name, prices[stockId]].join(','))
  })

  return lines.join('\n')
}

/**
 * 导出CSV文件并分享
 * @param {Page} page - 调用页面的this引用（用于setData提示）
 */
function exportCSV(page) {
  wx.showLoading({ title: '生成文件中...' })

  try {
    var csvContent = buildFullCSV()
    var fsm = wx.getFileSystemManager()
    var timestamp = new Date().getTime()
    var filePath = wx.env.USER_DATA_PATH + '/stock_export_' + timestamp + '.csv'

    // BOM + CSV内容（UTF-8 BOM 让Excel正确识别中文）
    var bom = '\uFEFF'
    fsm.writeFileSync(filePath, bom + csvContent, 'utf8')

    wx.hideLoading()

    wx.shareFileMessage({
      filePath: filePath,
      fileName: '股票记账导出_' + timestamp + '.csv',
      success: function () {
        wx.showToast({ title: '导出成功', icon: 'success' })
      },
      fail: function (err) {
        // 分享失败时尝试保存
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
    console.error('[exportCSV]', e)
  }
}

module.exports = {
  buildFullCSV: buildFullCSV,
  exportCSV: exportCSV
}
