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

/**
 * 标记数据过期并清除缓存
 * @param {string|string[]} [types] - 需要清除的缓存类型。
 *   可选: 'position' | 'heatmap' | 'periodStats' | 'all'
 *   默认 'all'（向后兼容）。
 */
function markDataDirty(types) {
  try {
    const appStore = require('../state/appStore')
    appStore.commit('MARK_DIRTY')
  } catch (e) {
    console.warn('[markDataDirty]', e)
  }
  
  if (!types || types === 'all') {
    // 默认：清除所有缓存（向后兼容）
    Object.values(caches).forEach(cache => cache.clear())
    return
  }
  
  const typeList = Array.isArray(types) ? types : [types]
  typeList.forEach(function (type) {
    if (caches[type]) {
      caches[type].clear()
    }
  })
}

module.exports = {
  markDataDirty,
  caches
}
