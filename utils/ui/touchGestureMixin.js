/**
 * touchGestureMixin.js — 左滑菜单触摸手势 mixin（性能优化版）
 *
 * 优化要点：
 * 1. touchMove 使用 requestAnimationFrame 节流，替代 Date.now 比较
 * 2. touchEnd 只更新变化的卡片，不遍历所有 positions
 * 3. 支持 data-path 方式精确更新
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

// RAF 节流辅助
function rafThrottle(fn) {
	let ticking = false;
	return function(...args) {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(() => {
				ticking = false;
				fn.apply(this, args);
			});
		}
	};
}

module.exports = {
	// ========== 左滑菜单触摸手势（内部实现） ==========
	_swipeOnTouchStart(e) {
		const t = e.touches[0];
		this._touchStartX = t.clientX;
		this._touchStartY = t.clientY;
		this._swiping = null;
		this._rafSwipeMove = this._rafSwipeMove || rafThrottle(this._doSwipeMove);
	},

	_doSwipeMove(e) {
		if (this._swiping === false) return;

		const t = e.touches[0];
		const dx = t.clientX - this._touchStartX;

		if (this._swiping === null) {
			const dy = t.clientY - this._touchStartY;
			if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
			this._swiping = Math.abs(dx) > Math.abs(dy);
			if (!this._swiping) return;
		}

		const index = e.currentTarget.dataset.index;
		const positions = this.data.positions;
		if (!positions || !positions[index]) return;

		const currentOffset = positions[index].swipeOffset || 0;
		if (currentOffset === 0 && dx > 0) return;

		const maxOffset = -260;
		const offset = Math.max(maxOffset, Math.min(0, dx));

		this.setData({
			["positions[" + index + "].swipeOffset"]: offset,
		});
	},

	_swipeOnTouchMove(e) {
		this._rafSwipeMove(e);
	},

	_swipeOnTouchEnd(e) {
		if (this._swiping !== true) return;

		const index = e.currentTarget.dataset.index;
		const positions = this.data.positions;
		if (!positions || !positions[index]) return;

		const p = positions[index];
		const offset = p.swipeOffset || 0;
		const newOffset = offset < -60 ? -260 : 0;
		const newOpen = newOffset === -260;

		const updates = {};
		if ((p.swipeOffset || 0) !== newOffset) {
			updates["positions[" + index + "].swipeOffset"] = newOffset;
		}
		if (p.swipeOpen !== newOpen) {
			updates["positions[" + index + "].swipeOpen"] = newOpen;
		}

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
