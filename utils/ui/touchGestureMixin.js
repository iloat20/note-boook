/**
 * touchGestureMixin.js — 左滑菜单触摸手势 mixin
 *
 * 内部实现以 _swipe 前缀命名，避免与页面自定义方法冲突。
 * 页面可通过覆盖 onTouchStart/onTouchMove/onTouchEnd 拦截事件，
 * 然后调用 this._swipeOnTouchStart(e) 等访问 mixin 逻辑。
 *
 * 用法：
 *   const touchGestureMixin = require('../../utils/ui/touchGestureMixin')
 *   Page({
 *     ...touchGestureMixin,
 *   })
 */

module.exports = {
	// ========== 左滑菜单触摸手势（内部实现） ==========
	_swipeOnTouchStart(e) {
		const t = e.touches[0];
		this._touchStartX = t.clientX;
		this._touchStartY = t.clientY;
		this._swiping = null;
		this._lastSwipeTime = 0;
	},

	_swipeOnTouchMove(e) {
		if (this._swiping === false) return;

		const t = e.touches[0];
		const dx = t.clientX - this._touchStartX;
		const dy = t.clientY - this._touchStartY;

		if (this._swiping === null) {
			if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
			this._swiping = Math.abs(dx) > Math.abs(dy);
			if (!this._swiping) return;
		}

		const now = Date.now();
		if (now - this._lastSwipeTime < 16) return;
		this._lastSwipeTime = now;

		const index = e.currentTarget.dataset.index;
		const positions = this.data.positions;
		if (!positions[index]) return;

		const currentOffset = positions[index].swipeOffset || 0;

		if (currentOffset === 0 && dx > 0) return;

		const maxOffset = -260;
		const offset = Math.max(maxOffset, Math.min(0, dx));

		this.setData({
			["positions[" + index + "].swipeOffset"]: offset,
		});
	},

	_swipeOnTouchEnd(e) {
		if (this._swiping !== true) return;

		const index = e.currentTarget.dataset.index;
		const positions = this.data.positions;
		if (!positions[index]) return;

		const offset = positions[index].swipeOffset || 0;
		const newOffset = offset < -60 ? -260 : 0;
		const newOpen = newOffset === -260;

		const updates = {};
		positions.forEach((p, i) => {
			const targetOffset = i === index ? newOffset : 0;
			if ((p.swipeOffset || 0) !== targetOffset) {
				updates["positions[" + i + "].swipeOffset"] = targetOffset;
			}
			const targetOpen = i === index ? newOpen : false;
			if (p.swipeOpen !== targetOpen) {
				updates["positions[" + i + "].swipeOpen"] = targetOpen;
			}
		});

		if (Object.keys(updates).length > 0) this.setData(updates);
	},

	// ========== 公开事件绑定（WXML 中绑定这些方法） ==========
	onTouchStart(e) {
		return this._swipeOnTouchStart(e);
	},
	onTouchMove(e) {
		return this._swipeOnTouchMove(e);
	},
	onTouchEnd(e) {
		return this._swipeOnTouchEnd(e);
	},
};
