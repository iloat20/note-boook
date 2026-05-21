/**
 * 页面 Mixin 工具
 * 提取页面公共逻辑（NavBar 初始化、dataDirty 检查等）
 */

/**
 * 初始化页面数据（合并通用数据）
 * @param {Object} pageData - 页面自定义数据
 * @returns {Object} 合并后的数据
 */
function initPageData(pageData = {}) {
  return {
    statusBarHeight: 0,
    navBarHeight: 44,
    ...pageData
  }
}

/**
 * 页面 onLoad 通用逻辑
 * @param {Object} page - 页面实例（this）
 */
function onLoadMixin(page) {
  page.setData(getApp().getNavBarInfo())
}

/**
 * 页面 onShow 通用逻辑
 * @param {Object} page - 页面实例（this）
 * @param {number} selectedTab - 选中的 tab 索引
 * @param {Function} loadDataFn - 加载数据的函数
 */
function onShowMixin(page, selectedTab, loadDataFn) {
  // 设置 tabBar 选中状态
  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setData({ selected: selectedTab })
  }
  
  // 通过 appStore 检查数据是否过期
  const appStore = require('../state/appStore')
  if (appStore.getState('dataDirty')) {
    if (typeof loadDataFn === 'function') {
      loadDataFn.call(page)
    }
    appStore.commit('MARK_CLEAN')
  }
}

module.exports = {
  initPageData,
  onLoadMixin,
  onShowMixin
}
