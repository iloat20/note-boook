/**
 * 页面 Mixin 工具
 * 提取 tab 页公共逻辑（NavBar 初始化、TabBar 选中状态）
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
 * 页面 onLoad 通用逻辑：设置导航栏高度
 * @param {Object} page - 页面实例（this）
 */
function onLoadMixin(page) {
  page.setData(getApp().getNavBarInfo())
}

/**
 * Tab 页 onShow 公共逻辑：设置 TabBar 选中态
 * @param {Object} page - 页面实例（this）
 * @param {number} tabIndex - tab 索引
 */
function setTabSelected(page, tabIndex) {
  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setData({ selected: tabIndex })
  }
}

/**
 * 检查并消费 dataDirty 标记
 * @returns {boolean} 数据是否过期
 */
function consumeDirtyFlag() {
  const appStore = require('../state/appStore')
  if (appStore.getState('dataDirty')) {
    appStore.commit('MARK_CLEAN')
    return true
  }
  return false
}

module.exports = {
  initPageData,
  onLoadMixin,
  setTabSelected,
  consumeDirtyFlag
}
