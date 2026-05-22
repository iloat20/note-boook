/**
 * PriceCache 模型 - 股票价格缓存操作
 *
 * 价格缓存带有 TTL（生存时间），过期后返回 null
 * 以触发重新获取行情。
 */

const { PRICE_KEY, getData, saveData, markDataDirty } = require('../storageCore/core')

// 价格缓存 TTL：30 分钟（毫秒）
const PRICE_TTL = 30 * 60 * 1000

const PriceCache = {
  /**
   * 设置股票价格缓存
   * @param {number} stockId - 股票 ID
   * @param {number} price - 股票价格
   */
  set(stockId, price) {
    const prices = this.getAll()
    prices[stockId] = {
      price: parseFloat(price),
      timestamp: Date.now()
    }
    saveData(PRICE_KEY, prices)
    markDataDirty(['position'])
  },

  /**
   * 批量设置股票价格缓存（只写一次 storage）
   * @param {Array<{stockId: number, price: number}>} entries
   */
  setBatch(entries) {
    if (!entries || entries.length === 0) return
    const prices = this.getAll()
    const now = Date.now()
    const updatedIds = []
    entries.forEach(function (item) {
      prices[item.stockId] = {
        price: parseFloat(item.price),
        timestamp: now
      }
      updatedIds.push(item.stockId)
    })
    saveData(PRICE_KEY, prices)
    // 批量传递所有更新的股票 ID，按粒度清除
    markDataDirty(['position'], updatedIds)
  },

  /**
   * 获取股票价格缓存
   * @param {number} stockId - 股票 ID
   * @returns {number|null} 股票价格，过期返回 null
   */
  get(stockId) {
    const prices = this.getAll()
    const entry = prices[stockId]
    if (!entry) return null
    // 兼容旧格式（纯数字，没有 TTL 信息）
    if (typeof entry === 'number') return entry
    // 检查 TTL
    if (Date.now() - entry.timestamp > PRICE_TTL) {
      delete prices[stockId]
      saveData(PRICE_KEY, prices)
      return null
    }
    return entry.price || null
  },

  /**
   * 获取所有股票价格缓存
   * @returns {Object} 股票价格缓存对象
   */
  getAll() {
    return getData(PRICE_KEY) || {}
  },

  /**
   * 检查价格缓存是否有效
   * @param {number} stockId - 股票 ID
   * @returns {boolean} 是否存在且未过期
   */
  has(stockId) {
    return this.get(stockId) !== null
  }
}

module.exports = PriceCache
