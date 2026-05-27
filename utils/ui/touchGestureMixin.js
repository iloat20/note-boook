/**
 * touchGestureMixin.js — 左滑菜单触摸手势 mixin
 *
 * 用法：
 *   const touchGestureMixin = require('../../utils/ui/touchGestureMixin')
 *   Page({
 *     ...touchGestureMixin,
 *     // 其他页面方法
 *   })
 */

module.exports = {
  // ========== 左滑菜单触摸手势 ==========
  onTouchStart(e) {
    const t = e.touches[0]
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    this._swiping = null
    this._lastSwipeTime = 0
  },

  onTouchMove(e) {
    if (this._swiping === false) return

    const t = e.touches[0]
    const dx = t.clientX - this._touchStartX
    const dy = t.clientY - this._touchStartY

    // 判断是否为横向滑动
    if (this._swiping === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      this._swiping = Math.abs(dx) > Math.abs(dy)
      if (!this._swiping) return
    }

    // 节流：每帧最多更新一次（~16ms）
    const now = Date.now()
    if (now - this._lastSwipeTime < 16) return
    this._lastSwipeTime = now

    const index = e.currentTarget.dataset.index
    const positions = this.data.positions
    if (!positions[index]) return

    const currentOffset = positions[index].swipeOffset || 0

    // 未展开时只允许左滑；已展开时允许右滑关闭
    if (currentOffset === 0 && dx > 0) return

    // 按钮总宽度 ≈ 240px (含按钮间间距和与卡片的间隔)
    const maxOffset = -260
    const offset = Math.max(maxOffset, Math.min(0, dx))

    this.setData({
      ['positions[' + index + '].swipeOffset']: offset
    })
  },

  onTouchEnd(e) {
    if (this._swiping !== true) return

    const index = e.currentTarget.dataset.index
    const positions = this.data.positions
    if (!positions[index]) return

    const offset = positions[index].swipeOffset || 0
    const newOffset = offset < -60 ? -260 : 0
    const newOpen = newOffset === -260

    // 单次 setData 更新所有变化的 swipeOffset 和 swipeOpen
    const updates = {}
    positions.forEach((p, i) => {
      const targetOffset = i === index ? newOffset : 0
      if ((p.swipeOffset || 0) !== targetOffset) {
        updates['positions[' + i + '].swipeOffset'] = targetOffset
      }
      const targetOpen = i === index ? newOpen : false
      if (p.swipeOpen !== targetOpen) {
        updates['positions[' + i + '].swipeOpen'] = targetOpen
      }
    })

    if (Object.keys(updates).length > 0) this.setData(updates)
  }
}
