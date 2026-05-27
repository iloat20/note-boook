/**
 * 动画助手 - 页面数字滚动动画
 * 从 index.js 提取，减少页面文件大小
 */

const { fmt } = require('../helpers/format')

/**
 * 批量数字滚动动画
 * @param {Object} page - 页面实例（this）
 * @param {Object} targets - 目标值 { totalMarketValue: 12345, totalPnL: 678, ... }
 * @param {number} duration - 动画时长 ms
 */
function animateAllValues(page, targets, duration) {
  duration = duration || 800
  let startValues = {}
  let keys = Object.keys(targets)

  keys.forEach(function (k) {
    startValues[k] = parseFloat(page.data.displayValues[k]) || 0
  })

  let startTime = Date.now()

  if (page._animTimer) clearTimeout(page._animTimer)

  function animate() {
    let elapsed = Date.now() - startTime
    let progress = Math.min(elapsed / duration, 1)
    let eased = 1 - Math.pow(1 - progress, 3)

    let updates = {}
    keys.forEach(function (k) {
      let current = startValues[k] + (targets[k] - startValues[k]) * eased
      updates['displayValues.' + k] = fmt(parseFloat(current.toFixed(2)))
    })

    page.setData(updates)

    if (progress < 1) {
      page._animTimer = setTimeout(animate, 16)
    } else {
      page._animTimer = null
    }
  }

  animate()
}

module.exports = {
  animateAllValues
}
