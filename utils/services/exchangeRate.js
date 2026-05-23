/**
 * 汇率模块
 * 自动从 exchangerate-api.com 获取 USD/HKD → CNY 汇率
 * 支持本地缓存（当天有效），API 失败时使用兜底值
 */

const { request } = require('../../api/request')
const { TIMING_CONFIG } = require('../../utils/constants/index')

// 汇率 API（免费，无需 key）
const API_URL = 'https://api.exchangerate-api.com/v4/latest/CNY'

// 缓存 key
const CACHE_KEY = 'exchange_rate_cache'

// 兜底默认汇率（2026-05 参考值）
const DEFAULTS = {
  usdToCny: 6.80,
  hkdToCny: 0.87
}

// 汇率缓存有效期（毫秒）- 4小时，支持当天内刷新
const RATE_CACHE_TTL = TIMING_CONFIG.RATE_CACHE_TTL_MS

/**
 * 从 API 获取汇率并缓存
 * @returns {Promise<{usdToCny: number, hkdToCny: number}>}
 */
function fetchAndCacheRates() {
  return new Promise(function (resolve) {
    request.get(API_URL, null, { timeout: 8000 })
      .then(function (data) {
        // API 以 CNY 为 base，需要取反
        // 1 CNY = X USD → 1 USD = 1/X CNY
        // 1 CNY = Y HKD → 1 HKD = 1/Y CNY
        let usdToCny = data.rates && data.rates.USD ? (1 / data.rates.USD) : DEFAULTS.usdToCny
        let hkdToCny = data.rates && data.rates.HKD ? (1 / data.rates.HKD) : DEFAULTS.hkdToCny

        // 保留 4 位小数
        usdToCny = parseFloat(usdToCny.toFixed(4))
        hkdToCny = parseFloat(hkdToCny.toFixed(4))

        const cache = {
          usdToCny: usdToCny,
          hkdToCny: hkdToCny,
          date: _today(),
          timestamp: Date.now()
        }

        try {
          wx.setStorageSync(CACHE_KEY, cache)
        } catch (e) {
          // 缓存写入失败不影响主流程
        }

        resolve({ usdToCny: usdToCny, hkdToCny: hkdToCny })
      })
      .catch(function () {
        // API 失败，使用兜底值
        resolve({
          usdToCny: DEFAULTS.usdToCny,
          hkdToCny: DEFAULTS.hkdToCny
        })
      })
  })
}

/**
 * 获取汇率（优先缓存，缓存过期则重新拉取）
 * @returns {Promise<{usdToCny: number, hkdToCny: number}>}
 */
function getRates() {
  return new Promise(function (resolve) {
    let cached = null
    try {
      cached = wx.getStorageSync(CACHE_KEY)
    } catch (e) {
      // 读取缓存失败
    }

    // 缓存有效（当天且在 TTL 内）
    const now = Date.now()
    const isFresh = cached && 
                    cached.date === _today() && 
                    cached.timestamp && 
                    (now - cached.timestamp < RATE_CACHE_TTL) &&
                    cached.usdToCny && 
                    cached.hkdToCny
    if (isFresh) {
      resolve({ usdToCny: cached.usdToCny, hkdToCny: cached.hkdToCny })
      return
    }

    // 缓存过期或不存在，重新获取
    fetchAndCacheRates().then(resolve)
  })
}

/**
 * 根据市场获取汇率乘数（原币种 → CNY）
 * @param {string} market - A_SHARE / HK_SHARE / US_SHARE
 * @param {Object} rates - {usdToCny, hkdToCny}
 * @returns {number}
 */
function getRate(market, rates) {
  if (!rates) return 1
  switch (market) {
    case 'HK_SHARE':
      return rates.hkdToCny
    case 'US_SHARE':
      return rates.usdToCny
    default:
      return 1 // A股不需要换算
  }
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function _today() {
  const d = new Date()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}

module.exports = { getRates, getRate, DEFAULTS }
