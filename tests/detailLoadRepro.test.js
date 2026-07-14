/**
 * 复现详情页「资产不存在」：直接挂载真实 detail.js 页面，
 * 模拟微信运行时 onLoad → loadData → onShow，验证 stock 是否被正确设置。
 */

let _mockStorage = {};
let _pageConfig = null;
let _lastToast = null;

function makeSetData(instance) {
	return function setData(patch) {
		if (Array.isArray(patch)) {
			// setData(arrayOfUpdates) 形式不在本页使用，忽略
			return;
		}
		Object.keys(patch).forEach((key) => {
			instance.data[key] = patch[key];
		});
	};
}

function makePage() {
	const instance = Object.assign({}, _pageConfig);
	instance.data = JSON.parse(JSON.stringify(_pageConfig.data || {}));
	instance.setData = makeSetData(instance);
	return instance;
}

beforeEach(() => {
	_mockStorage = {};
	_lastToast = null;
	_pageConfig = null;
	jest.clearAllMocks();
	jest.resetModules();

	global.Page = (config) => {
		_pageConfig = config;
	};

	global.getApp = () => ({
		globalData: { systemInfo: {} },
		getNavBarInfo: () => ({ statusBarHeight: 20, navBarHeight: 44 }),
	});

	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => {
			_mockStorage[key] = value;
		}),
		getWindowInfo: jest.fn(() => ({ statusBarHeight: 20, screenWidth: 375, screenHeight: 667 })),
		getAppBaseInfo: jest.fn(() => ({ platform: "ios", fontSizeSetting: 0 })),
		setNavigationBarTitle: jest.fn(),
		showToast: jest.fn((o) => {
			_lastToast = o;
		}),
		navigateTo: jest.fn(),
		navigateBack: jest.fn(),
		showActionSheet: jest.fn(),
	};
});

function seedStockAndTx() {
	const { Stock, Transaction } = require("../utils/models/index");
	const stock = Stock.create("600519", "贵州茅台", "A_SHARE");
	Stock.save(stock);
	const tx = Transaction.create(stock.id, "BUY", 1800, 100, 5, "2026-01-15", "buy", "note", ["价值"]);
	Transaction.save(tx);
	return stock;
}

test("【复现】从 index 进入详情：URL 传 stockId=数字字符串 → stock 被正确设置（不显示资产不存在）", () => {
	seedStockAndTx();
	const detail = require("../packageDetail/pages/detail/detail");
	const page = makePage();

	const stock = require("../utils/models/index").Stock.getAll()[0];
	// 模拟微信：query 参数永远是字符串
	page.onLoad({ stockId: String(stock.id) });

	expect(_lastToast).toBeNull();
	expect(page.data.stock).toBeTruthy();
	expect(page.data.stock.id).toBe(stock.id);
	expect(page.data.stockName).toBe("贵州茅台");
});

test("【复现】onShow 重入（从 record 返回）也能找到资产", () => {
	const stock = seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();
	page.onLoad({ stockId: String(stock.id) });
	expect(page.data.stock).toBeTruthy();

	// 模拟从 record 返回：dirty 标记被置位
	const appStore = require("../utils/state/appStore");
	appStore.commit("MARK_DIRTY");
	page.onShow();

	expect(page.data.stock).toBeTruthy();
	expect(_lastToast).toBeNull();
});

test("【复现】确实不存在的 stockId → 应显示「资产不存在或已删除」toast（行为符合预期）", () => {
	seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();
	page.onLoad({ stockId: "999999999999" });

	expect(page.data.stock).toBeFalsy();
	expect(_lastToast).toBeTruthy();
	expect(_lastToast.title).toContain("资产不存在");
});

test("【复现】onLoad 缺少 stockId（无参进入详情）→ 当前行为是什么？", () => {
	seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();
	page.onLoad({}); // 没有 stockId

	// 没有 stockId 时，_stockId 为 undefined，loadData 不会运行；
	// onShow 会用 this.data.stockId（null）再查一次 → 仍找不到 → 永久「资产不存在」
	page.onShow();

	expect(page.data.stock).toBeFalsy();
	// 记录真实行为，用于判断是否需要加固
	console.log("[repro] 缺参进入详情 onShow 后 toast =", JSON.stringify(_lastToast));
});
