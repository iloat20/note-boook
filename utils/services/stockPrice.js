/**
 * 股票行情获取工具
 * 使用腾讯财经 API（支持 HTTPS）
 */

const { request } = require('../../api/request')

// 调试开关（生产环境设为 false）
const DEBUG = false
const log = DEBUG ? console.log.bind(console) : function () {}
const warn = DEBUG ? console.warn.bind(console) : function () {}
const errLog = console.error.bind(console) // 保留错误日志

// 请求并发控制
const MAX_CONCURRENT_REQUESTS = 5
const REQUEST_DELAY_MS = 100
const BATCH_SIZE = 40
let _activeRequests = 0
let _requestQueue = []

// 将腾讯 API 返回的 GBK ArrayBuffer 解码为 UTF-8 字符串
function decodeGBK(arrayBuffer) {
  if (!arrayBuffer) return ''
  // 优先使用 TextDecoder（基础库 2.9.0+ 支持，gb18030 是 GBK 的超集）
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('gb18030').decode(arrayBuffer)
    } catch (e) {
      // 不支持 gb18030，fallthrough
    }
  }
  // 降级：按字节转 latin-1 字符串（中文会乱，但不会崩溃）
  var bytes = new Uint8Array(arrayBuffer)
  var str = ''
  for (var i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return str
}

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

// 获取股票符号（用于API请求）
function getSymbol(market, code) {
  switch (market) {
    case 'A_SHARE':
      return getAsharePrefix(code) + code
    case 'HK_SHARE':
      return 'r_hk' + String(code).padStart(5, '0')
    case 'US_SHARE':
      return 'us.' + String(code).toLowerCase()
    default:
      return null
  }
}

// 构建API URL - 使用腾讯财经API（支持HTTPS）
function buildUrl(market, code) {
  const symbol = getSymbol(market, code)
  return symbol ? `https://qt.gtimg.cn/q=${symbol}` : null
}

// 构建批量查询 URL（腾讯 API 支持逗号分隔多只股票）
function buildBatchUrl(stocks) {
  const symbols = stocks.map(stock => getSymbol(stock.market, stock.code)).filter(Boolean)
  return symbols.length > 0 ? 'https://qt.gtimg.cn/q=' + symbols.join(',') : null
}

// 解析单条腾讯财经 API 数据
function parseTencentData(data) {
  log('[parseTencentData] 原始数据:', data.substring(0, 200))
  const match = data.match(/="([^"]*)"/)
  if (!match) {
    warn('[parseTencentData] 未匹配到数据，原始:', data.substring(0, 100))
    return null
  }

  const fields = match[1].split('~')
  log('[parseTencentData] 字段数:', fields.length, '前5个:', fields.slice(0, 5))
  if (fields.length < 35) {
    warn('[parseTencentData] 字段数不足35:', fields.length)
    return null
  }

  const result = {
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
  log('[parseTencentData] 解析成功:', result)
  return result
}

// 解析批量查询响应（多条 v_xxYY="..." 数据）
function parseBatchData(responseText) {
  log('[parseBatchData] 原始响应:', responseText.substring(0, 300))
  const results = {}
  const regex = /v_([^=]+)="([^"]+)"/g
  let match
  let count = 0
  while ((match = regex.exec(responseText)) !== null) {
    count++
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
  log('[parseBatchData] 解析到', count, '条数据，有效:', Object.keys(results).length)
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

    log('[fetchStockPrice] 请求行情', { market, code, url })

    request.get(url, null, { timeout: 10000, responseType: 'arraybuffer' })
      .then(data => {
        const responseData = decodeGBK(data)
        log('[fetchStockPrice] 解析数据:', responseData.substring(0, 200))
        const result = parseTencentData(responseData)
        log('[fetchStockPrice] 解析结果:', result)

        if (result && result.currentPrice > 0) {
          resolve(result)
        } else {
          reject(new Error('解析行情数据失败，原始响应: ' + responseData.substring(0, 100)))
        }
      })
      .catch(err => {
        errLog('[fetchStockPrice] 请求失败', err)
        reject(new Error(`网络请求失败: ${err.message || err.errMsg}`))
      })
  }))
}

function fetchPriceBatch(stocks) {
  const url = buildBatchUrl(stocks)
  if (!url) return Promise.resolve(stocks.map(s => ({ stockId: s.id, price: null })))

  return _executeWithThrottle(() => new Promise((resolve) => {
    request.get(url, null, { timeout: 15000, responseType: 'arraybuffer' })
      .then(data => {
        const responseText = decodeGBK(data)
        const parsed = parseBatchData(responseText)
        const results = stocks.map(stock => {
          const data = parsed[stock.code]
          return {
            stockId: stock.id,
            price: (data && data.currentPrice > 0) ? data.currentPrice : null
          }
        })
        resolve(results)
      })
      .catch(() => {
        resolve(stocks.map(s => ({ stockId: s.id, price: null })))
      })
  }))
}

// 批量获取股票行情，按固定数量分片，避免 URL 过长导致整批失败
function fetchAllPrices(stocks) {
  if (!stocks || stocks.length === 0) return Promise.resolve([])

  const chunks = []
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    chunks.push(stocks.slice(i, i + BATCH_SIZE))
  }

  return Promise.all(chunks.map(fetchPriceBatch)).then(function (chunkResults) {
    return chunkResults.reduce(function (all, current) {
      return all.concat(current)
    }, [])
  })
}

module.exports = {
  fetchStockPrice,
  fetchAllPrices
}
