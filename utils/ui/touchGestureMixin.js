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
 * 配套约定（页面需遵循，否则滑动手感会“不完善”）：
 * 1. 卡片主体的 bindtap 需在开头检查 this._swipeInterceptTap —— 水平滑动结束后的
 *    尾随 tap 会被置 true，消费后清零，避免误触进详情/触发卡片点击。
 * 2. scroll-view 可绑定 bindscroll="_onSwipeScroll"，滑动列表时自动收起已展开菜单。
 *
 * 用法：
 *   const touchGestureMixin = require('../../utils/ui/touchGestureMixin')
 *   Page({
 *     ...touchGestureMixin,
 *   })
 */

// RAF 节流辅助（小程序无 requestAnimationFrame，用 setTimeout 兜底）
// 使用 this._rafTicking 存储节流状态，避免多实例共享同一个 ticking 变量。
// 关键修复：每次 touchmove 都刷新 this._rafArgs 为「最新」坐标，tick 时应用
// 最近一次的位置，而不是第一次。否则在 120Hz 等高刷设备上，一个 16ms 窗口内
// 的多次 touchmove 只取首帧坐标，卡片严重滞后、松手时 snap 判定基于过期坐标，
// 导致本应打开的左滑菜单被错误回弹关闭（「左滑看不到按钮」）。
function rafThrottle(fn) {
	return function (...args) {
		// 页面已卸载（_detached 由页面 onUnload 置位，_destroyed 由 _swipeDestroy 置位）
		// 时直接丢弃，避免对死亡实例 setData 触发框架崩溃。
		if (this._destroyed || this._detached) return;
		this._rafArgs = args;
		if (!this._rafTicking) {
			this._rafTicking = true;
			this._rafTimer = setTimeout(() => {
				this._rafTicking = false;
				this._rafTimer = null;
				if (this._destroyed || this._detached) return;
				const a = this._rafArgs;
				this._rafArgs = null;
				if (a) fn.apply(this, a);
			}, 16);
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
		this._swipeInterceptTap = false;
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
		const positions = this._positionsCache;
		if (!positions?.[index]) return;

		const currentOffset = positions[index].swipeOffset || 0;
		if (currentOffset === 0 && dx > 0) return;

		// 菜单实际宽度由页面测量后写入 _swipeActionsWidth，未测量前回退 -260
		const maxOffset = -(this._swipeActionsWidth || 260);
		const offset = Math.max(maxOffset, Math.min(0, dx));

		// 同步回写缓存：displayPositions 与 _positionsCache 共享元素引用，
		// 但 touchmove 只 setData 渲染层，缓存未更新会导致 touchend 读到的
		// swipeOffset 恒为初始值 0，阈值判断失效、菜单打不开。
		positions[index].swipeOffset = offset;
		positions[index].swiping = true;
		this.setData({
			[`displayPositions[${index}].swipeOffset`]: offset,
			[`displayPositions[${index}].swiping`]: true,
		});
	},

	_swipeOnTouchMove(e) {
		this._rafSwipeMove(e);
	},

	_swipeOnTouchEnd(e) {
		if (this._swiping !== true) return;

		// 若 raf 节流还有「未落地」的最后一次 touchmove（松手瞬间 tick 可能尚未触发），
		// 先同步应用，保证下面 snap 判定基于手指最终位置，而非过期坐标。
		// 否则快速滑动松手时，菜单会因读到过期的较小位移而被错误回弹关闭。
		this._flushPendingSwipeMove();

		const index = e.currentTarget.dataset.index;
		const positions = this._positionsCache;
		if (!positions?.[index]) return;

		const p = positions[index];
		// 标记：本次是真实水平滑动，结尾尾随 tap 需被卡片 tap 处理器消费掉
		this._swipeInterceptTap = true;
		const maxOffset = -(this._swipeActionsWidth || 260);
		// 越过 40% 才吸附打开，否则回弹关闭
		const threshold = Math.abs(maxOffset) * 0.4;
		const offset = p.swipeOffset || 0;
		// 修复：阈值应为负值比较。原 `offset < threshold` 因 offset 为负、threshold 为正恒成立，
		// 导致任何左滑都直接全开、拖回也关不上。正确逻辑：拖过 40% 才吸附打开。
		const newOffset = offset < -threshold ? maxOffset : 0;
		const newOpen = newOffset === maxOffset;

		const updates = {
			[`displayPositions[${index}].swiping`]: false,
		};
		// 打开新菜单时，自动收起其它已展开的菜单（避免多个同时张开）
		if (newOpen) {
			positions.forEach((pp, i) => {
				if (i !== index && pp.swipeOpen) {
					updates[`displayPositions[${i}].swipeOpen`] = false;
					updates[`displayPositions[${i}].swipeOffset`] = 0;
					pp.swipeOpen = false;
					pp.swipeOffset = 0;
				}
			});
		}
		// 同步回写缓存，保证后续触摸读取一致
		p.swiping = false;
		if ((p.swipeOffset || 0) !== newOffset) {
			updates[`displayPositions[${index}].swipeOffset`] = newOffset;
			p.swipeOffset = newOffset;
		}
		if (p.swipeOpen !== newOpen) {
			updates[`displayPositions[${index}].swipeOpen`] = newOpen;
			p.swipeOpen = newOpen;
		}

		if (Object.keys(updates).length > 0) this.setData(updates);
	},

	// 同步应用 raf 节流中尚未来得及 tick 的最后一次 touchmove，
	// 供 _swipeOnTouchEnd 在 snap 判定前调用，避免读到过期坐标。
	_flushPendingSwipeMove() {
		if (this._rafTicking && this._rafArgs) {
			const a = this._rafArgs;
			this._rafArgs = null;
			this._rafTicking = false;
			if (this._rafTimer) {
				clearTimeout(this._rafTimer);
				this._rafTimer = null;
			}
			this._doSwipeMove.apply(this, a);
		}
	},

	// 测量菜单实际宽度，使卡片滑动距离与按钮区精确匹配（无露白/无遮挡）
	_measureSwipeActions() {
		// 页面已卸载时禁止再发起节点查询，否则 createSelectorQuery 作用在死亡实例上崩溃
		if (this._destroyed || this._detached) return;
		if (typeof this.createSelectorQuery !== "function") return;
		this.createSelectorQuery()
			.select(".swipe-actions")
			.boundingClientRect((rect) => {
				if (this._destroyed || this._detached) return;
				if (rect && rect.width > 0) this._swipeActionsWidth = rect.width;
			})
			.exec();
	},

	// 数据渲染后延迟测量，规避 setData 异步渲染时序问题
	_scheduleSwipeMeasure() {
		if (this._destroyed || this._detached) return;
		if (this._swipeMeasureTimer) clearTimeout(this._swipeMeasureTimer);
		this._swipeMeasureTimer = setTimeout(() => {
			this._swipeMeasureTimer = null;
			if (this._destroyed || this._detached) return;
			this._measureSwipeActions();
		}, 300);
	},

	// 页面卸载时调用：标记销毁并清掉所有挂起异步任务（raf 节流 tick / 延迟测量），
	// 否则页面销毁后这些回调仍会对死亡实例 setData / createSelectorQuery，
	// 触发微信框架内部 "Cannot read property '__subPageFrameEndTime__' of null"。
	_swipeDestroy() {
		this._destroyed = true;
		this._detached = true;
		if (this._swipeMeasureTimer) {
			clearTimeout(this._swipeMeasureTimer);
			this._swipeMeasureTimer = null;
		}
		if (this._rafTimer) {
			clearTimeout(this._rafTimer);
			this._rafTimer = null;
		}
		this._rafTicking = false;
	},

	// 收起所有已展开的菜单
	_closeAllSwipes() {
		const positions = this._positionsCache;
		if (!positions) return;
		const updates = {};
		positions.forEach((pp, i) => {
			if (pp.swipeOpen || pp.swipeOffset) {
				updates[`displayPositions[${i}].swipeOpen`] = false;
				updates[`displayPositions[${i}].swipeOffset`] = 0;
				updates[`displayPositions[${i}].swiping`] = false;
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

	// 列表滚动时收起所有已展开菜单（避免菜单悬在滚动内容上）。
	// 仅当发生「明显」滚动（>4px）且当前不在滑动手势中时才收起：
	// 水平左滑时手指难免有微小垂直漂移，会触发 scroll 事件，若每次都收起，
	// 刚展开的菜单会被立刻藏掉，表现为「左滑看不到按钮」。
	_onSwipeScroll(e) {
		const top = e?.detail?.scrollTop || 0;
		if (this._lastScrollTop === undefined) this._lastScrollTop = top;
		const delta = Math.abs(top - this._lastScrollTop);
		this._lastScrollTop = top;
		if (delta > 4 && !this._swiping) this._closeAllSwipes();
	},
};
