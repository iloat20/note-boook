/**
 * 股票行情获取工具
 * 使用新浪财经免费 API
 */

// A股代码前缀映射
function getAsharePrefix(code) {
  const codeNum = parseInt(code)
  if (codeNum >= 600000 && codeNum < 700000) return 'sh'  // 上海（600xxx-699xxx）
  if (codeNum >= 0 && codeNum < 400000) return 'sz'        // 深圳（000xxx-399xxx）
  return 'sh'  // 默认上海
}

// 构建API URL
function buildUrl(market, code) {
  switch (market) {
    case 'A_SHARE':
      return `http://hq.sinajs.cn/list=${getAsharePrefix(code)}${code}`
    case 'HK_SHARE':
      return `http://hq.sinajs.cn/list=hk${code}`
    case 'US_SHARE':
      return `http://hq.sinajs.cn/list=gb_${code.toLowerCase()}`
    default:
      return null
  }
}

// 解析A股行情数据
function parseAshareData(data) {
  const match = data.match(/="(.+)";/)
  if (!match) return null
  
  const fields = match[1].split(',')
  if (fields.length < 32) return null
  
  return {
    code: fields[0],
    name: fields[1],
    currentPrice: parseFloat(fields[3]) || 0,
    yesterdayClose: parseFloat(fields[4]) || 0,
    todayOpen: parseFloat(fields[5]) || 0,
    volume: parseInt(fields[8]) || 0,
    amount: parseFloat(fields[9]) || 0,
    bidPrice: parseFloat(fields[11]) || 0,
    askPrice: parseFloat(fields[21]) || 0,
    timestamp: fields[30] + ' ' + fields[31]
  }
}

// 解析港股行情数据
function parseHkShareData(data) {
  const match = data.match(/="(.+)";/)
  if (!match) return null
  
  const fields = match[1].split(',')
  if (fields.length < 10) return null
  
  return {
    code: fields[0],
    name: fields[1],
    currentPrice: parseFloat(fields[6]) || 0,
    yesterdayClose: parseFloat(fields[3]) || 0,
    todayOpen: parseFloat(fields[5]) || 0,
    high: parseFloat(fields[4]) || 0,
    low: parseFloat(fields[5]) || 0,
    volume: parseInt(fields[12]) || 0,
    timestamp: fields[17] + ' ' + fields[18]
  }
}

// 解析美股行情数据
function parseUsShareData(data) {
  const match = data.match(/="(.+)";/)
  if (!match) return null
  
  const fields = match[1].split(',')
  if (fields.length < 10) return null
  
  return {
    code: fields[0],
    name: fields[0],
    currentPrice: parseFloat(fields[1]) || 0,
    yesterdayClose: parseFloat(fields[26]) || 0,
    todayOpen: parseFloat(fields[5]) || 0,
    high: parseFloat(fields[6]) || 0,
    low: parseFloat(fields[7]) || 0,
    volume: parseInt(fields[10]) || 0,
    timestamp: fields[3] + ' ' + fields[4]
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
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        
        const data = res.data
        let result = null
        
        switch (market) {
          case 'A_SHARE':
            result = parseAshareData(data)
            break
          case 'HK_SHARE':
            result = parseHkShareData(data)
            break
          case 'US_SHARE':
            result = parseUsShareData(data)
            break
        }
        
        if (result) {
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
  fetchStockPrice,
  fetchAllPrices
}
