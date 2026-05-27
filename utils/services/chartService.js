/**
 * ChartService - 图表数据服务
 */

const Transaction = require('../models/transaction')
const Dividend = require('../models/dividend')
const { getPeriodStatsList } = require('./statsService')
const { caches } = require('../cache/cacheManager')

// 热力图数据缓存



/**
 * 获取混合图表数据（柱状图 + 折线图）
 * @param {string} periodType - 周期类型
 * @param {number} count - 数据点数
 * @returns {Object} 图表数据
 */
function getMixedChartData(periodType, count) {
  count = count || 12
  const list = getPeriodStatsList(periodType, count)
  const barData = []
  const lineData = []
  const labels = []
  let cumulative = 0
  
  list.forEach(function (item) {
    barData.push(item.pnL || 0)
    cumulative += (item.pnL || 0)
    lineData.push(parseFloat(cumulative.toFixed(2)))
    labels.push(item.label)
  })
  
  return { labels: labels, barData: barData, lineData: lineData }
}

/**
 * 获取热力图数据
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @returns {Array} 热力图数据
 */
function getHeatmapData(year, month) {
  const cacheKey = year + '-' + month
  if (caches.heatmap.has(cacheKey)) return caches.heatmap.get(cacheKey)
  
  const transactions = Transaction.getAll()
  const dividends = Dividend.getAll()
  
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  const daysInMonth = new Date(year, month, 0).getDate()

  const dayMap = {}
  for (let d = 1; d <= daysInMonth; d++) {
    dayMap[d] = { count: 0, amount: 0 }
  }
  
  transactions.forEach(t => {
    const date = new Date(t.date)
    if (date >= startDate && date <= endDate) {
      const day = date.getDate()
      if (dayMap[day]) {
        dayMap[day].count++
        dayMap[day].amount += t.price * t.quantity
      }
    }
  })
  
  dividends.forEach(d => {
    const date = new Date(d.date)
    if (date >= startDate && date <= endDate) {
      const day = date.getDate()
      if (dayMap[day]) {
        dayMap[day].count++
        dayMap[day].amount += d.totalAmount
      }
    }
  })
  
  const result = []
  for (let day = 1; day <= daysInMonth; day++) {
    const data = dayMap[day]
    let level = 0
    if (data.count === 1) level = 1
    else if (data.count >= 2 && data.count <= 3) level = 2
    else if (data.count >= 4 && data.count <= 5) level = 3
    else if (data.count > 5) level = 4
    result.push({
      day,
      count: data.count,
      amount: parseFloat(data.amount.toFixed(2)),
      level
    })
  }
  
  caches.heatmap.set(cacheKey, result)
  return result
}

module.exports = {
  getMixedChartData,
  getHeatmapData
}
