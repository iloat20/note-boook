/**
 * 排序辅助函数
 * 提取重复的排序逻辑，提高代码复用性
 */

/**
 * 按总盈亏排序持仓（从高到低）
 * 总盈亏 = 已实现盈亏 + 浮动盈亏 + 分红收益
 * @param {Array} positions - 持仓数组
 * @returns {Array} 排序后的持仓数组
 */
function sortByTotalPnL(positions) {
  return (positions || []).slice().sort((a, b) => {
    const aTotal = (a.realizedPnL || 0) + (a.floatingPnL || 0) + (a.dividendIncome || 0)
    const bTotal = (b.realizedPnL || 0) + (b.floatingPnL || 0) + (b.dividendIncome || 0)
    return bTotal - aTotal
  })
}

/**
 * 按股票代码排序（升序）
 * @param {Array} positions - 持仓数组
 * @returns {Array} 排序后的持仓数组
 */
function sortByCode(positions) {
  return (positions || []).slice().sort((a, b) => {
    return (a.code || '').localeCompare(b.code || '')
  })
}

/**
 * 按买入日期排序（从新到旧）
 * @param {Array} transactions - 交易记录数组
 * @returns {Array} 排序后的交易记录数组（不修改原始数组）
 */
function sortByDateDesc(transactions) {
  return (transactions || []).slice().sort((a, b) => {
    return new Date(b.date || 0) - new Date(a.date || 0)
  })
}

/**
 * 按买入日期排序（从旧到新）
 * @param {Array} transactions - 交易记录数组
 * @returns {Array} 排序后的交易记录数组（不修改原始数组）
 */
function sortByDateAsc(transactions) {
  return (transactions || []).slice().sort((a, b) => {
    return new Date(a.date || 0) - new Date(b.date || 0)
  })
}

module.exports = {
  sortByTotalPnL,
  sortByCode,
  sortByDateDesc,
  sortByDateAsc
}
