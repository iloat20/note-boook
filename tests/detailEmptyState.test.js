/**
 * 详情页空态回归测试。
 * 锁定 loadData() 的四种分支，确保「资产不存在」这一措辞
 * 只在「资产确实被删除/不存在」时出现，其余失败模式给出准确文案，
 * 不再误导用户（原 bug：任何异常都显示「资产不存在」）。
 *
 * 关键点：detail.js 通过 `const { calculatePosition } = require(...)` 解构，
 * 因此必须用模块级 jest.mock 工厂替换该引用，spyOn 无效。
 */

// 模块级 mock：默认透传真实实现，仅在「处理失败」用例中改为抛错
jest.mock("../utils/services/positionService", () => {
	const actual = jest.requireActual("../utils/services/positionService");
	return {
		...actual,
		calculatePosition: jest.fn(actual.calculatePosition),
	};
});

let _mockStorage = {};
let _pageConfig = null;
let _lastToast = null;

function makeSetData(instance) {
	return function setData(patch) {
		if (Array.isArray(patch)) return;
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

test("正常进入：stockId 字符串 → stock 正确加载，不显示任何空态文案", () => {
	const stock = seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();

	page.onLoad({ stockId: String(stock.id) });

	expect(page.data.stock).toBeTruthy();
	expect(page.data.stock.id).toBe(stock.id);
	expect(_lastToast).toBeNull();
});

test("缺参进入（onLoad 无 stockId，onShow 兜底） → 文案「缺少资产参数」并自动返回", () => {
	seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();

	jest.useFakeTimers();
	try {
		page.onLoad({}); // 没有 stockId
		page.onShow(); // onShow 兜底触发 loadData

		expect(page.data.stock).toBeFalsy();
		expect(page.data.emptyTitle).toBe("缺少资产参数");
		expect(_lastToast).toBeTruthy();
		expect(_lastToast.title).toContain("缺少资产参数");

		// 800ms 后自动 navigateBack，避免卡在空屏
		expect(global.wx.navigateBack).not.toHaveBeenCalled();
		jest.advanceTimersByTime(900);
		expect(global.wx.navigateBack).toHaveBeenCalled();
	} finally {
		jest.useRealTimers();
	}
});

test("确实不存在的 stockId → 文案「资产不存在或已删除」", () => {
	seedStockAndTx();
	require("../packageDetail/pages/detail/detail");
	const page = makePage();

	page.onLoad({ stockId: "999999999999" });

	expect(page.data.stock).toBeFalsy();
		expect(page.data.emptyTitle).toBe("资产不存在或已删除");
		expect(_lastToast).toBeTruthy();
		expect(_lastToast.title).toContain("资产不存在");
});

test("资产存在但数据处理抛错 → 文案「加载失败，请重试」，绝不显示误导性的「资产不存在」", () => {
	const stock = seedStockAndTx();
	const positionService = require("../utils/services/positionService");
	positionService.calculatePosition.mockImplementation(() => {
		throw new Error("模拟数据处理失败");
	});

	require("../packageDetail/pages/detail/detail");
	const page = makePage();

	page.onLoad({ stockId: String(stock.id) });

	expect(page.data.stock).toBeFalsy();
	expect(page.data.emptyTitle).toBe("加载失败，请重试");
	expect(_lastToast).toBeTruthy();
	expect(_lastToast.title).toBe("加载失败，请重试");
	// 回归护栏：绝不能回退到旧的误导性文案
	expect(page.data.emptyTitle).not.toBe("资产不存在");
	expect(page.data.emptyTitle).not.toBe("资产不存在或已删除");
	expect(page.data.emptyTitle).not.toBe("缺少资产参数");
});
