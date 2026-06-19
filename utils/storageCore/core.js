/**
 * 核心存储函数
 * 封装 wx.getStorageSync/wx.setStorageSync
 * 提供内存缓存以减少 I/O
 */

const { MARKETS, TRANSACTION_TYPE, DEFAULT_STRATEGIES } = require('../constants/index')
const { caches, markDataDirty } = require('../cache/cacheManager')

const STOCK_KEY = 'stock_trade_stocks'
const TRANSACTION_KEY = 'stock_trade_transactions'
const DIVIDEND_KEY = 'stock_trade_dividends'
const PRICE_KEY = 'stock_trade_prices'
const STRATEGY_KEY = 'stock_trade_strategies'

// 内存缓存，避免频繁读取本地存储
// 使用 LRU 策略，防止缓存无限增长
const _memCache = caches.mem

let _lastTimestamp = 0
let _seq = 0

/**
 * 生成唯一 ID
 * 基于时间戳 + 序列号，避免冲突
 * @returns {number} 唯一 ID
 */
function getNextId() {
  const now = Date.now()
  if (now === _lastTimestamp) {
    _seq++
  } else {
    _lastTimestamp = now
    _seq = 0
  }
  const ID_MULTIPLIER = 1000
  return now * ID_MULTIPLIER + _seq
}

/**
 * 保存数据到本地存储和内存缓存
 * @param {string} key - 存储键
 * @param {any} data - 数据
 */
function saveData(key, data) {
  try {
    wx.setStorageSync(key, data)
  } catch (e) {
    console.error('[storageCore] saveData error for key', key, e)
    wx.showToast({ title: '存储空间不足', icon: 'none' })
    return
  }
  _memCache.delete(key)
  _memCache.set(key, data)
}

/**
 * 从内存缓存或本地存储读取数据
 * @param {string} key - 存储键
 * @returns {any} 数据
 */
function getData(key) {
  var data = _memCache.get(key)
  if (data !== undefined) return data
  try {
    data = wx.getStorageSync(key)
  } catch (e) {
    console.error('[storageCore] getData error for key', key, e)
    data = null
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    if (key === PRICE_KEY) {
      data = {}
    } else {
      data = []
    }
  }
  _memCache.set(key, data)
  return data
}

/**
 * 返回数据的浅拷贝，防止外部修改污染缓存
 * @param {string} key - 存储键
 * @returns {any} 数据的浅拷贝
 */
function getDataCopy(key) {
  const data = getData(key)
  if (Array.isArray(data)) return data.slice()
  if (typeof data === 'object' && data !== null) return Object.assign({}, data)
  return data
}

/**
 * 清除内存缓存
 */
function clearMemCache() {
  _memCache.clear()
}

/**
 * 通用 upsert 并保存
 * 封装 findIndex → replace/push → saveData → markDataDirty 模式
 * @param {string} key - 存储键
 * @param {Object} item - 要保存的对象（必须有 id 字段）
 * @param {string|Array} dirtyTags - dirty 标记，传给 markDataDirty
 * @returns {Object} 保存后的对象
 */
function upsertAndSave(key, item, dirtyTags) {
  if (!item || item.id == null) {
    console.error('[upsertAndSave] Invalid item:', item)
    return item
  }
  const list = getData(key)
  const index = list.findIndex(function (x) { return x.id === item.id })
  if (index >= 0) {
    // 保留原对象的其他字段，只更新提供的字段
    list[index] = Object.assign({}, list[index], item)
  } else {
    list.push(item)
  }
  saveData(key, list)
  if (dirtyTags) {
    const stockId = item.stockId != null ? item.stockId : item.id
    markDataDirty(dirtyTags, stockId)
  }
  return index >= 0 ? list[index] : item
}

/**
 * 通用删除并保存
 * @param {string} key - 存储键
 * @param {number} id - 要删除的对象 ID
 * @param {string|Array} dirtyTags - dirty 标记
 * @param {number} [stockId] - 可选的 stockId，用于按股票粒度清除缓存。
 *   不传时自动从被删除项目中检测。
 */
function deleteAndSave(key, id, dirtyTags, stockId) {
  let foundStockId = stockId
  const list = getData(key).filter(function (x) {
    // 检测被删除项目的 stockId（用于按粒度清除缓存）
    if (x.id === id && foundStockId == null) {
      foundStockId = x.stockId != null ? x.stockId : x.id
    }
    return x.id !== id
  })
  saveData(key, list)
  if (dirtyTags) markDataDirty(dirtyTags, foundStockId)
}

module.exports = {
  MARKETS,
  TRANSACTION_TYPE,
  DEFAULT_STRATEGIES,
  STOCK_KEY,
  TRANSACTION_KEY,
  DIVIDEND_KEY,
  PRICE_KEY,
  STRATEGY_KEY,
  getNextId,
  saveData,
  getData,
  getDataCopy,
  clearMemCache,
  markDataDirty,
  upsertAndSave,
  deleteAndSave
}
