/**
 * 股票行情获取工具
 * 使用腾讯财经 API（支持 HTTPS）
 */

// 请求并发控制
const MAX_CONCURRENT_REQUESTS = 5
const REQUEST_DELAY_MS = 100
let _activeRequests = 0
let _requestQueue = []

// A股代码前缀映射
function getAsharePrefix(code) {
  const codeNum = parseInt(code)
  if (codeNum >= 600000 && codeNum < 700000) return 'sh'   // 上海主板（600xxx-699xxx）
  if (codeNum >= 688000 && codeNum < 690000) return 'sh'   // 科创板（688xxx）
  if (codeNum >= 0 && codeNum < 400000) return 'sz'         // 深圳（000xxx-399xxx）
  if (codeNum >= 300000 && codeNum < 400000) return 'sz'    // 创业板（300xxx）
  if (codeNum >= 800000 && codeNum < 900000) return 'bj'    // 北交所（8xxxxx）
  if (codeNum >= 400000 && codeNum < 500000) return 'bj'    // 北交所（4xxxxx）
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

// 构建批量查询 URL（腾讯 API 支持逗号分隔多只股票）
function buildBatchUrl(stocks) {
  const symbols = []
  stocks.forEach(stock => {
    let symbol = null
    if (stock.market === 'A_SHARE') {
      symbol = getAsharePrefix(stock.code) + stock.code
    } else if (stock.market === 'HK_SHARE') {
      symbol = 'r_hk' + stock.code.padStart(5, '0')
    } else if (stock.market === 'US_SHARE') {
      symbol = 'us.' + stock.code.toLowerCase()
    }
    if (symbol) symbols.push(symbol)
  })
  return symbols.length > 0 ? 'https://qt.gtimg.cn/q=' + symbols.join(',') : null
}

// 解析单条腾讯财经 API 数据
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

// 解析批量查询响应（多条 v_xxYY="..." 数据）
function parseBatchData(responseText) {
  const results = {}
  const regex = /v_([^=]+)="([^"]+)"/g
  let match
  while ((match = regex.exec(responseText)) !== null) {
    const fields = match[2].split('~')
    if (fields.length >= 35) {
      const code = fields[2]
      results[code] = {
        code: code,
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
  }
  return results
}

// 带并发控制的请求执行器
function _executeWithThrottle(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _activeRequests++
      fn().then(resolve).catch(reject).finally(() => {
        _activeRequests--
        if (_requestQueue.length > 0) {
          const next = _requestQueue.shift()
          setTimeout(next, REQUEST_DELAY_MS)
        }
      })
    }
    if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
      run()
    } else {
      _requestQueue.push(run)
    }
  })
}

// 获取单个股票行情
function fetchStockPrice(market, code) {
  return _executeWithThrottle(() => new Promise((resolve, reject) => {
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
  }))
}

// 批量获取股票行情（单次 HTTP 请求查询多只股票）
function fetchAllPrices(stocks) {
  if (!stocks || stocks.length === 0) return Promise.resolve([])

  const url = buildBatchUrl(stocks)
  if (!url) return Promise.resolve(stocks.map(s => ({ stockId: s.id, price: null })))

  return new Promise((resolve) => {
    wx.request({
      url: url,
      method: 'GET',
      timeout: 15000,
      success(res) {
        if (res.statusCode !== 200) {
          resolve(stocks.map(s => ({ stockId: s.id, price: null })))
          return
        }
        const parsed = parseBatchData(String(res.data || ''))
        const results = stocks.map(stock => {
          const data = parsed[stock.code]
          return {
            stockId: stock.id,
            price: (data && data.currentPrice > 0) ? data.currentPrice : null
          }
        })
        resolve(results)
      },
      fail() {
        resolve(stocks.map(s => ({ stockId: s.id, price: null })))
      }
    })
  })
}

module.exports = {
  fetchStockPrice,
  fetchAllPrices
}
