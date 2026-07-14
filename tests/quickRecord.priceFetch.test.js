// quick-record 价格探测性能回归测试
//
// 复现 bug：onQrCodeInput 在每次形成有效代码时，会同时触发
//   - _scheduleAutoFetch（防抖 500ms 后调用 fetchStockPrice）
//   - _probeStockPrice（立即调用 fetchStockPrice）
// 两条路径对同一代码各自发一次网络请求；且 probe 在每个中间有效代码
// （如 "60000" 然后 "600000"）都会立即发请求。
// 后果：输入一只 6 位代码会产生 2~3 次重复网络请求，弱网下易触发
// 行情 API 限流 / 价格探测不稳定，浪费带宽。
//
// 期望：输入一个完整代码（含中间态）应最多只发 1 次 fetchStockPrice。
//
// 注意：手动 mock 全局 setTimeout/clearTimeout，避免污染同 worker 中
// 其它测试（如 memory.test.js 的 runOnlyPendingTimers）。

const mockFetchStockPrice = jest.fn(() => Promise.resolve({ name: "测试股", currentPrice: 12.34 }));

jest.mock("../utils/services/stockPrice", () => ({ fetchStockPrice: mockFetchStockPrice }));
jest.mock("../utils/data/stockDatabase", () => ({ searchStocks: jest.fn(() => []) }));
jest.mock("../utils/models/index", () => ({ Stock: { getByCode: () => null }, Transaction: {} }));
jest.mock("../utils/services/positionService", () => ({ getSellableQuantity: () => 0 }));

// 捕获 Component 定义（quick-record 在 require 时调用 Component({...})）
let capturedDef = null;
global.Component = (def) => {
	capturedDef = def;
};
global.wx = { showToast() {}, vibrateShort() {} };

const qr = require("../components/quick-record/quick-record");
void qr; // 模块副作用：注册 Component

const { onQrCodeInput } = capturedDef.methods;

// ---- 本地定时器 mock（手动 flush）----
let _pending = new Map();
let _seq = 0;
let _origST = null;
let _origCT = null;

beforeEach(() => {
	_pending = new Map();
	_seq = 0;
	_origST = global.setTimeout;
	_origCT = global.clearTimeout;
	global.setTimeout = (fn) => {
		const id = ++_seq;
		_pending.set(id, fn);
		return id;
	};
	global.clearTimeout = (id) => {
		_pending.delete(id);
	};
	mockFetchStockPrice.mockClear();
});

afterEach(() => {
	global.setTimeout = _origST;
	global.clearTimeout = _origCT;
	_origST = null;
	_origCT = null;
});

// 运行当前挂起的定时器一次（快照后清空再执行）
function flushTimers() {
	const snapshot = [..._pending.values()];
	_pending.clear();
	snapshot.forEach((fn) => fn());
}

async function flushMicrotasks() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

function makeCtx() {
	const ctx = {
		data: { qrMarket: "A_SHARE", qrCode: "", qrName: "", qrPrice: "", qrFetching: false },
		_marketLocked: false,
		_detached: false,
		_afTimer: null,
		_afFetching: null,
		_afProbe: null,
		_blurTimer: null,
		_feeTimer: null,
		_stockValidCache: {},
		setData(updates) {
			Object.assign(this.data, updates);
		},
	};
	// 真实 Component 实例 this 上挂有全部 methods，这里一并合并，
	// 否则 onQrCodeInput 内 this._detectMarket / this._scheduleAutoFetch 等会找不到。
	Object.assign(ctx, capturedDef.methods);
	return ctx;
}

describe("quick-record 价格探测不应重复发网络请求", () => {
	test("输入 600000 只应触发 1 次 fetchStockPrice", async () => {
		const ctx = makeCtx();
		const code = "600000";

		// 逐字符模拟输入（input 事件 value 为完整当前串）
		let acc = "";
		for (const ch of code) {
			acc += ch;
			onQrCodeInput.call(ctx, { detail: { value: acc } });
		}

		// 触发防抖后的 autoFetch（_scheduleAutoFetch 的 500ms 定时器）
		flushTimers();
		await flushMicrotasks();

		// 期望：无论中间态 "60000" 是否触发 probe，最终对同一只股票仅 1 次请求
		expect(mockFetchStockPrice.mock.calls.length).toBe(1);
	});

	test("输入中途不应为中间态代码重复发请求（确认 bug 量级）", async () => {
		const ctx = makeCtx();
		const code = "600000";

		let acc = "";
		for (const ch of code) {
			acc += ch;
			onQrCodeInput.call(ctx, { detail: { value: acc } });
		}

		// 此时（flush 前）probe 已为每个中间有效代码同步发请求
		const probesBeforeFlush = mockFetchStockPrice.mock.calls.length;
		flushTimers();
		await flushMicrotasks();
		const total = mockFetchStockPrice.mock.calls.length;

		// 至少：中间态 1 次（60000）+ 终态 1 次（600000）+ 防抖 autoFetch 1 次 = 3
		// 修复后应整体降到 1
		expect(total).toBeLessThanOrEqual(1);
		void probesBeforeFlush;
	});
});
