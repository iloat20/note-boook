/**
 * feedback.js — 统一用户反馈
 *
 * 封装 wx.showToast / wx.showLoading / wx.hideLoading，
 * 避免 try-catch 中散弹式的 wx 调用。
 */

/**
 * 显示提示（默认 icon: 'none'）
 */
function toast(title, icon) {
  wx.showToast({ title: title, icon: icon || 'none' })
}

/**
 * 成功提示（绿色勾）
 */
function success(title) {
  wx.showToast({ title: title, icon: 'success' })
}

/**
 * 显示加载中
 */
function loading(title) {
  wx.showLoading({ title: title || '加载中...' })
}

/**
 * 隐藏加载中
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 统一的 catch 处理器
 * 用法：catchError(err) 或 catchError(err, '加载失败')
 */
function catchError(err, defaultMsg) {
  let msg = defaultMsg || '操作失败'
  if (err) {
    if (err.code && err.message) {
      msg = '[' + err.code + '] ' + err.message
    } else if (err.message) {
      msg = err.message
    }
    if (msg.length > 50) msg = msg.substring(0, 50)
  }
  wx.showToast({ title: msg, icon: 'none' })
}

module.exports = { toast, success, loading, hideLoading, catchError }
