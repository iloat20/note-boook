// tests/transactionService.test.js
let _mockStorage = {};

beforeEach(() => {
	_mockStorage = {};
	jest.clearAllMocks();
	jest.resetModules();
	global.wx = {
		getStorageSync: jest.fn((key) => _mockStorage[key] || null),
		setStorageSync: jest.fn((key, value) => {
			_mockStorage[key] = value;
		}),
		removeStorageSync: jest.fn((key) => {
			delete _mockStorage[key];
		}),
	};
});

describe("transactionService.persistTransaction", () => {
	const setup = () => {
		const persistTransaction = require("../utils/services/transactionService").persistTransaction;
		const Stock = require("../utils/models/stock");
		const Transaction = require("../utils/models/transaction");
		return { persistTransaction, Stock, Transaction };
	};

	test("BUY with new stock auto-creates stock and saves transaction", () => {
		const { persistTransaction, Stock, Transaction } = setup();
		const res = persistTransaction({
			stock: null,
			type: "BUY",
			price: "10",
			quantity: "100",
			fee: 0,
			date: "2026-01-01",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
		});
		expect(res.ok).toBe(true);
		expect(res.transaction.type).toBe("BUY");
		expect(res.transaction.quantity).toBe(100);
		expect(Transaction.getAll().length).toBe(1);
		expect(Stock.getByCode("600000", "A_SHARE")).toBeTruthy();
	});

	test("SELL exceeding holdings returns error without saving", () => {
		const { persistTransaction, Transaction } = setup();
		const Stock = require("../utils/models/stock");
		const stock = Stock.create("600000", "浦发银行", "A_SHARE");
		Stock.save(stock);
		persistTransaction({
			stock,
			type: "BUY",
			price: "10",
			quantity: "100",
			fee: 0,
			date: "2026-01-01",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
		});
		const sell = persistTransaction({
			stock,
			type: "SELL",
			price: "11",
			quantity: "150",
			fee: 0,
			date: "2026-01-02",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
		});
		expect(sell.ok).toBe(false);
		expect(sell.error).toBe("SELL_EXCEEDS");
		// 仅 1 笔 BUY 被保存，SELL 未落库
		expect(Transaction.getAll().length).toBe(1);
	});

	test("SELL within holdings succeeds", () => {
		const { persistTransaction } = setup();
		const Stock = require("../utils/models/stock");
		const stock = Stock.create("600000", "浦发银行", "A_SHARE");
		Stock.save(stock);
		persistTransaction({
			stock,
			type: "BUY",
			price: "10",
			quantity: "100",
			fee: 0,
			date: "2026-01-01",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
		});
		const sell = persistTransaction({
			stock,
			type: "SELL",
			price: "11",
			quantity: "50",
			fee: 0,
			date: "2026-01-02",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
		});
		expect(sell.ok).toBe(true);
		expect(sell.transaction.type).toBe("SELL");
	});

	test("edit reuses editId", () => {
		const { persistTransaction } = setup();
		const Stock = require("../utils/models/stock");
		const stock = Stock.create("600000", "浦发银行", "A_SHARE");
		Stock.save(stock);
		const res = persistTransaction({
			stock,
			type: "BUY",
			price: "10",
			quantity: "100",
			fee: 0,
			date: "2026-01-01",
			time: "09:30",
			code: "600000",
			market: "A_SHARE",
			name: "浦发银行",
			isEdit: true,
			editId: 999,
		});
		expect(res.transaction.id).toBe(999);
	});
});
