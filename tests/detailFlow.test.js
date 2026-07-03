let _mockStorage = {};
beforeEach(() => {
    _mockStorage = {};
    jest.clearAllMocks();
    jest.resetModules();
    global.wx = {
        getStorageSync: jest.fn((key) => _mockStorage[key] || null),
        setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value; }),
        getWindowInfo: jest.fn(() => ({ safeArea: { top: 20, bottom: 0 }, statusBarHeight: 20, screenWidth: 375, screenHeight: 667 })),
        getAppBaseInfo: jest.fn(() => ({ platform: "ios", fontSizeSetting: 0 })),
        setNavigationBarTitle: jest.fn(),
        navigateTo: jest.fn(),
        navigateBack: jest.fn(),
    };
});

test("detail loadData scenario: stockId matches stock.id (numbers large)", () => {
    const { Stock, Transaction, Dividend } = require("../utils/models/index");
    const { calculatePosition } = require("../utils/services/positionService");

    // Create stock with large timestamp-based ID
    const stock = Stock.create("000001", "PAB", "A_SHARE");
    Stock.save(stock);
    console.log("stock.id:", stock.id, "type:", typeof stock.id);

    // Create transactions and dividends
    const tx = Transaction.create(stock.id, "BUY", 10.5, 1000, 5, "2026-01-15", "buy", "note", []);
    Transaction.save(tx);
    const div = { id: Date.now() * 1000, stockId: stock.id, perShareAmount: 0.5, quantity: 1000, totalAmount: 500, date: "2026-06-01", note: "" };
    const allDivs = [div];
    _mockStorage["stock_trade_dividends"] = allDivs;

    // Simulate what detail.js does
    const foundStock = Stock.getById(stock.id);
    expect(foundStock).toBeTruthy();
    expect(foundStock.id).toBe(stock.id);

    const position = calculatePosition(stock.id);
    expect(position).toBeTruthy();
    expect(position.quantity).toBe(1000);

    const txs = Transaction.getByStockId(stock.id);
    expect(txs.length).toBe(1);

    const divs = Dividend.getByStockId(stock.id);
    expect(divs.length).toBe(1);

    console.log("ALL DATA VERIFIED OK");
});

test("parseInt on large stockId preserves value", () => {
    const id = 1783000239192000;
    const parsed = parseInt(String(id), 10);
    expect(parsed).toBe(id);
    expect(typeof parsed).toBe("number");
});

test("Stock.getById returns undefined for non-existent id", () => {
    const { Stock } = require("../utils/models/index");
    const result = Stock.getById(999999999999);
    expect(result).toBeUndefined();
});
