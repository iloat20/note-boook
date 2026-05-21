/**
 * Strategy 模型 - 策略标签数据操作
 */

const { STRATEGY_KEY, getData, saveData } = require('../storageCore/core')
const { DEFAULT_STRATEGIES } = require('../storageCore/constants')
const Transaction = require('./transaction')

const Strategy = {
  /**
   * 获取所有策略标签（默认 + 自定义）
   * @returns {Array} 策略标签列表
   */
  getAll() {
    const customs = getData(STRATEGY_KEY) || []
    const merged = DEFAULT_STRATEGIES.slice()
    customs.forEach(function (tag) {
      if (merged.indexOf(tag) === -1) merged.push(tag)
    })
    return merged
  },

  /**
   * 保存策略标签列表
   * @param {Array} list - 策略标签列表
   */
  save(list) {
    saveData(STRATEGY_KEY, list)
  },

  /**
   * 添加自定义策略标签
   * @param {string} tag - 策略标签
   */
  add(tag) {
    if (!tag || typeof tag !== 'string') return
    tag = tag.trim()
    if (!tag) return
    const customs = getData(STRATEGY_KEY) || []
    if (customs.indexOf(tag) === -1 && DEFAULT_STRATEGIES.indexOf(tag) === -1) {
      customs.push(tag)
      saveData(STRATEGY_KEY, customs)
    }
  },

  /**
   * 删除自定义策略标签
   * @param {string} tag - 策略标签
   */
  remove(tag) {
    const customs = getData(STRATEGY_KEY) || []
    const idx = customs.indexOf(tag)
    if (idx >= 0) {
      customs.splice(idx, 1)
      saveData(STRATEGY_KEY, customs)
    }
  },

  /**
   * 获取已使用的策略标签及其使用次数
   * @returns {Array} 策略使用统计列表
   */
  getUsedStrategies() {
    const transactions = Transaction.getAll()
    const countMap = {}
    transactions.forEach(function (t) {
      if (t.strategies && t.strategies.length) {
        t.strategies.forEach(function (tag) {
          countMap[tag] = (countMap[tag] || 0) + 1
        })
      }
    })
    const result = Object.keys(countMap).map(function (tag) {
      return { tag: tag, count: countMap[tag] }
    })
    result.sort(function (a, b) { return b.count - a.count })
    return result
  }
}

module.exports = Strategy
