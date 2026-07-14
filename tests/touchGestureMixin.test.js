// touchGestureMixin 回归测试
//
// 覆盖两类问题：
// 1. 左滑手势核心逻辑（阈值吸附、缓存回写）—— 防止历史 bug 回归
// 2. 页面/组件销毁后的异步 setData 泄漏 —— 即线上崩溃
//    "Cannot read property '__subPageFrameEndTime__' of null"
//    根因：onUnload 后仍有 pending 的 setTimeout（raf 节流 tick / 延迟测量）
//    对死亡实例 setData，触发微信框架级崩溃。
//
// 注意：本文件用「直接重赋值 global.setTimeout/clearTimeout」做手动 flush，
// 不经过 jest.spyOn / jest.useFakeTimers，以免改动 Jest 内部 fake-timer 标记、
// 污染同 worker 中其它测试文件（如 memory.test.js 的 afterEach runOnlyPendingTimers）。

const touchGestureMixin = require("../utils/ui/touchGestureMixin");

// ---- 本地定时器 mock（手动 flush，互不污染）----
let _timerSeq = 0;
let _pendingTimers = new Map();
let _origSetTimeout = null;
let _origClearTimeout = null;

beforeEach(() => {
	_timerSeq = 0;
	_pendingTimers = new Map();
	_origSetTimeout = global.setTimeout;
	_origClearTimeout = global.clearTimeout;
	global.setTimeout = (fn) => {
		const id = ++_timerSeq;
		_pendingTimers.set(id, fn);
		return id;
	};
	global.clearTimeout = (id) => {
		_pendingTimers.delete(id);
	};
});

afterEach(() => {
	global.setTimeout = _origSetTimeout;
	global.clearTimeout = _origClearTimeout;
	_origSetTimeout = null;
	_origClearTimeout = null;
});

function flushTimers() {
	const fns = Array.from(_pendingTimers.values());
	_pendingTimers.clear();
	fns.forEach((fn) => fn());
}

// ---- 测试上下文 ----
function makeCtx() {
	const ctx = {
		_destroyed: false,
		_detached: false,
		_positionsCache: [],
		_swipeActionsWidth: 260,
		_selectorCalled: false,
		setDataCalls: [],
		setData(patch) {
			this.setDataCalls.push(patch);
		},
		createSelectorQuery() {
			const self = this;
			this._selectorCalled = true;
			return {
				select() {
					return this;
				},
				boundingClientRect(cb) {
					this._cb = cb;
					return this;
				},
				exec() {
					if (this._cb) this._cb.call(self, { width: 200 });
				},
			};
		},
	};
	Object.assign(ctx, touchGestureMixin);
	return ctx;
}

const startSwipe = (ctx, fromX, toX, index) => {
	ctx._swipeOnTouchStart({ touches: [{ clientX: fromX, clientY: 100 }] });
	ctx._swipeOnTouchMove({
		touches: [{ clientX: toX, clientY: 100 }],
		currentTarget: { dataset: { index: index || 0 } },
	});
};

describe("touchGestureMixin - 跟手拖动 (raf 节流)", () => {
	test("未销毁时：touchmove 经 raf tick 触发 setData 且位移为负", () => {
		const ctx = makeCtx();
		ctx._positionsCache = [{ swipeOffset: 0, swiping: false, swipeOpen: false }];

		startSwipe(ctx, 300, 250, 0);
		// raf tick 尚未 flush，setData 不应立即发生
		expect(ctx.setDataCalls.length).toBe(0);

		flushTimers();

		expect(ctx.setDataCalls.length).toBe(1);
		const patch = ctx.setDataCalls[0];
		expect(patch["displayPositions[0].swipeOffset"]).toBeLessThan(0);
		expect(patch["displayPositions[0].swiping"]).toBe(true);
		// 缓存同步回写
		expect(ctx._positionsCache[0].swipeOffset).toBeLessThan(0);
	});
});

describe("touchGestureMixin - 销毁后异步泄漏防护 (崩溃回归)", () => {
	test("_swipeDestroy 后：pending raf tick 不再对死亡实例 setData", () => {
		const ctx = makeCtx();
		ctx._positionsCache = [{ swipeOffset: 0, swiping: false, swipeOpen: false }];

		startSwipe(ctx, 300, 250, 0);
		// 模拟页面 onUnload
		ctx._swipeDestroy();

		// 即使 raf tick 触发，也应被 _destroyed/_detached 守卫丢弃（且定时器已被清）
		flushTimers();

		expect(ctx.setDataCalls.length).toBe(0);
		expect(ctx._destroyed).toBe(true);
		expect(ctx._detached).toBe(true);
	});

	test("_swipeDestroy 后：延迟测量不再发起节点查询", () => {
		const ctx = makeCtx();

		ctx._scheduleSwipeMeasure();
		ctx._swipeDestroy();

		flushTimers();

		expect(ctx._selectorCalled).toBe(false);
	});

	test("未销毁时：延迟测量正常发起并写回菜单宽度", () => {
		const ctx = makeCtx();

		ctx._scheduleSwipeMeasure();
		flushTimers();

		expect(ctx._selectorCalled).toBe(true);
		expect(ctx._swipeActionsWidth).toBe(200);
	});

	test("_swipeDestroy 后：_measureSwipeActions 直接跳过（守卫）", () => {
		const ctx = makeCtx();
		ctx._swipeDestroy();
		ctx._measureSwipeActions();
		expect(ctx._selectorCalled).toBe(false);
	});
});

describe("touchGestureMixin - 阈值吸附逻辑", () => {
	// 不依赖定时器，直接验证 touchend 的吸附判断
	// 注：_swipeOnTouchEnd 要求 this._swiping === true（即已发生水平滑动），
	// 故此处显式置位以模拟「先有 touchmove 判定为水平滑动」的前置状态。
	test("拖过 40% 吸附全开", () => {
		const ctx = makeCtx();
		const maxOffset = -260;
		ctx._swiping = true;
		ctx._positionsCache = [
			{ swipeOffset: maxOffset * 0.6, swiping: true, swipeOpen: false },
		];
		ctx._swipeOnTouchEnd({
			currentTarget: { dataset: { index: 0 } },
		});
		expect(ctx._positionsCache[0].swipeOpen).toBe(true);
		expect(ctx._positionsCache[0].swipeOffset).toBe(maxOffset);
	});

	test("未拖过 40% 回弹关闭", () => {
		const ctx = makeCtx();
		const maxOffset = -260;
		ctx._swiping = true;
		ctx._positionsCache = [
			{ swipeOffset: maxOffset * 0.2, swiping: true, swipeOpen: false },
		];
		ctx._swipeOnTouchEnd({
			currentTarget: { dataset: { index: 0 } },
		});
		expect(ctx._positionsCache[0].swipeOpen).toBe(false);
	});
});

describe("touchGestureMixin - 快速滑动 snap 判定 (raf 节流修复回归)", () => {
	// 复现「左滑看不到按钮」：同一 raf 窗口内多次 touchmove（高刷设备常见），
	// 松手瞬间 tick 尚未触发。修复前会基于过期坐标（首帧/上一窗口）判定，
	// 导致本应打开的菜单被回弹关闭。
	test("同一 raf 窗口内多次 move + 立即松手：使用最终坐标，应能吸附打开", () => {
		const ctx = makeCtx();
		ctx._positionsCache = [{ swipeOffset: 0, swiping: false, swipeOpen: false }];

		// 起始触摸
		ctx._swipeOnTouchStart({ touches: [{ clientX: 300, clientY: 100 }] });
		// 第一窗口：移动一格并 flush，使 _swiping 置 true、p.swipeOffset 记录 -100
		ctx._swipeOnTouchMove({
			touches: [{ clientX: 200, clientY: 100 }],
			currentTarget: { dataset: { index: 0 } },
		});
		flushTimers(); // 应用窗口1的 move
		expect(ctx._positionsCache[0].swiping).toBe(true);
		expect(ctx._positionsCache[0].swipeOffset).toBe(-100);

		// 第二窗口：连续两次 move（同一 16ms 窗口内，未 flush），
		// 最后一次已越过 40% 阈值（位移 -250）
		ctx._swipeOnTouchMove({
			touches: [{ clientX: 100, clientY: 100 }],
			currentTarget: { dataset: { index: 0 } },
		});
		ctx._swipeOnTouchMove({
			touches: [{ clientX: 50, clientY: 100 }],
			currentTarget: { dataset: { index: 0 } },
		});
		// 模拟「松手瞬间 raf tick 尚未触发」：不 flush，直接 touchend
		ctx._swipeOnTouchEnd({ currentTarget: { dataset: { index: 0 } } });

		// 修复后：pending 的最后一次坐标被同步应用，位移 -250 超过阈值 → 打开
		expect(ctx._positionsCache[0].swipeOpen).toBe(true);
		expect(ctx._positionsCache[0].swipeOffset).toBe(-260);
	});
});
