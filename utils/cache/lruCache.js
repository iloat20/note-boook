/**
 * LRU Cache 统一实现
 * 支持 maxSize 配置，自动淘汰最久未使用的条目
 */
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  /**
   * 获取缓存值，如果存在则移到末尾（最近使用）
   * @param {string} key - 缓存键
   * @returns {any} 缓存值，不存在返回 undefined
   */
  get(key) {
    if (!this.cache.has(key)) return undefined
    
    const value = this.cache.get(key)
    // LRU: 删除后重新插入，保证最近使用的在末尾
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  /**
   * 设置缓存值，如果超过最大大小则淘汰最久未使用的
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  set(key, value) {
    if (this.cache.has(key)) {
      // 已存在，删除后重新插入
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // 淘汰最久未使用的（Map 的第一个键）
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
    this.cache.set(key, value)
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在
   */
  has(key) {
    return this.cache.has(key)
  }

  /**
   * 删除指定缓存
   * @param {string} key - 缓存键
   * @returns {boolean} 是否删除成功
   */
  delete(key) {
    return this.cache.delete(key)
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear()
  }

  /**
   * 获取当前缓存大小
   * @returns {number} 缓存条目数
   */
  size() {
    return this.cache.size
  }

  /**
   * 获取所有缓存键
   * @returns {Iterator} 键迭代器
   */
  keys() {
    return this.cache.keys()
  }

  /**
   * 获取所有缓存值
   * @returns {Iterator} 值迭代器
   */
  values() {
    return this.cache.values()
  }
}

module.exports = LRUCache
