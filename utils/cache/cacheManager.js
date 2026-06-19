/**
 * 缓存管理器 - 统一管理多个缓存实例
 * 提供统一的缓存清理接口
 * 实现 markDataDirty 功能
 */

const LRUCache = require('./lruCache')

// 缓存实例配置
const caches = {
  position: new LRUCache(100),      // 持仓计算结果缓存
  heatmap: new LRUCache(50),        // 热力图数据缓存
  periodStats: new LRUCache(50),    // 周期统计数据缓存
  mem: new LRUCache(50)            // 内存缓存（避免频繁读取本地存储）
}

var _appStore = null

function _getAppStore() {
  if (!_appStore) {
    _appStore = require('../state/appStore')
  }
  return _appStore
}

/**
 * 标记数据过期并清除缓存
 * @param {string|string[]} [types] - 需要清除的缓存类型。
 *   可选: 'position' | 'heatmap' | 'periodStats' | 'all'
 *   默认 'all'（向后兼容）。
 * @param {number|number[]} [stockId] - 可选的股票 ID，用于按股票粒度清除 position 缓存。
 */
function markDataDirty(types, stockId) {
  try {
    _getAppStore().commit('MARK_DIRTY')
  } catch (e) {
    console.warn('[markDataDirty] appStore error:', e)
  }

  if (!types || types === 'all') {
    caches.position.clear()
    caches.heatmap.clear()
    caches.periodStats.clear()
    return
  }

  var typeList = Array.isArray(types) ? types : [types]
  typeList.forEach(function (type) {
    if (type === 'mem' || !caches[type]) return
    if (type === 'position' && stockId != null) {
      var ids = Array.isArray(stockId) ? stockId : [stockId]
      ids.forEach(function (id) { caches.position.delete(id) })
    } else {
      caches[type].clear()
    }
  })
}

module.exports = {
  markDataDirty,
  caches
}
