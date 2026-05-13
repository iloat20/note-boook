/**
 * 股票行情获取工具
 * 使用腾讯财经 API（支持 HTTPS）
 */

// A股代码前缀映射
function getAsharePrefix(code) {
  const codeNum = parseInt(code)
  if (codeNum >= 600000 && codeNum < 700000) return 'sh'  // 上海（600xxx-699xxx）
  if (codeNum >= 0 && codeNum < 400000) return 'sz'        // 深圳（000xxx-399xxx）
  return 'sh'  // 默认上海
}

// 构建API URL - 使用腾讯财经API（支持HTTPS）
function buildUrl(market, code) {
  switch (market) {
    case 'A_SHARE':
      const prefix = getAsharePrefix(code)
      return `https://qt.gtimg.cn/q=${prefix}${code}`
    case 'HK_SHARE':
      const hkCode = code.padStart(5, '0')
      return `https://qt.gtimg.cn/q=r_hk${hkCode}`
    case 'US_SHARE':
      return `https://qt.gtimg.cn/q=us.${code.toLowerCase()}`
    default:
      return null
  }
}

// 解析腾讯财经API返回的数据
function parseTencentData(data) {
  const match = data.match(/="(.+)"/)
  if (!match) return null

  const fields = match[1].split('~')
  if (fields.length < 35) return null

  return {
    code: fields[2],
    name: fields[1],
    currentPrice: parseFloat(fields[3]) || 0,
    yesterdayClose: parseFloat(fields[4]) || 0,
    todayOpen: parseFloat(fields[5]) || 0,
    volume: parseInt(fields[6]) || 0,
    high: parseFloat(fields[33]) || 0,
    low: parseFloat(fields[34]) || 0,
    amount: parseFloat(fields[37]) || 0
  }
}

// 获取单个股票行情
function fetchStockPrice(market, code) {
  return new Promise((resolve, reject) => {
    const url = buildUrl(market, code)
    if (!url) {
      reject(new Error('不支持的市场类型'))
      return
    }

    wx.request({
      url: url,
      method: 'GET',
      timeout: 10000,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const data = String(res.data || '')
        const result = parseTencentData(data)

        if (result && result.currentPrice > 0) {
          resolve(result)
        } else {
          reject(new Error('解析行情数据失败'))
        }
      },
      fail(err) {
        reject(new Error(`网络请求失败: ${err.errMsg}`))
      }
    })
  })
}

// 批量获取股票行情
function fetchAllPrices(stocks) {
  const promises = stocks.map(stock => 
    fetchStockPrice(stock.market, stock.code)
      .then(price => ({ stockId: stock.id, price: price.currentPrice }))
      .catch(() => ({ stockId: stock.id, price: null }))
  )
  
  return Promise.all(promises)
}

module.exports = {
  fetchStockPrice
}
