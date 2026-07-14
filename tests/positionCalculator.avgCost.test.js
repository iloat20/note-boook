/**
 * calcPosition avgCost 回归测试
 *
 * 场景覆盖：
 *  - 部分卖出后，剩余持仓平均成本应保持买入批次成本（分母用买入批次数量，而非剩余数量）
 *  - 含手续费时成本计入均价
 *  - 送股（share dividend）作为 0 成本股降低均价
 *  - 跨轮次（清仓后重新买入）均价只取当前活批次
 */
const { calcPosition } = require("../utils/helpers/positionCalculator");

function tx(stockId, type, price, quantity, fee, date) {
	return { stockId, type, price, quantity, fee: fee || 0, date };
}

describe("calcPosition avgCost", () => {
	it("部分卖出后 avgCost 应等于买入批次成本（分母=买入批次数量）", () => {
		const transactions = [
			tx(1, "BUY", 10, 100, 0, "2025-01-01"),
			tx(1, "SELL", 12, 30, 0, "2025-02-01"),
		];
		const pos = calcPosition(1, transactions, [], 15);
		expect(pos.quantity).toBe(70);
		expect(pos.avgCost).toBeCloseTo(10, 6);
		// floatingPnL = (15 - 10) * 70 = 350
		expect(pos.floatingPnL).toBeCloseTo(350, 2);
	});

	it("含买入手续费时成本计入均价", () => {
		const transactions = [tx(2, "BUY", 10, 100, 5, "2025-01-01")];
		const pos = calcPosition(2, transactions, [], 12);
		// avgCost = (1000 + 5) / 100 = 10.05
		expect(pos.avgCost).toBeCloseTo(10.05, 6);
		expect(pos.quantity).toBe(100);
	});

	it("送股作为 0 成本股降低均价", () => {
		const transactions = [tx(3, "BUY", 10, 100, 0, "2025-01-01")];
		const dividends = [{ type: "SHARE", shareQuantity: 10, totalAmount: 0, stockId: 3 }];
		const pos = calcPosition(3, transactions, dividends, 12);
		// avgCost = 1000 / (100 + 10) = 9.0909...
		expect(pos.avgCost).toBeCloseTo(1000 / 110, 6);
		expect(pos.quantity).toBe(110);
	});

	it("跨轮次（清仓后重买）均价只取当前活批次", () => {
		const transactions = [
			tx(4, "BUY", 10, 100, 5, "2025-01-01"),
			tx(4, "SELL", 12, 100, 0, "2025-02-01"),
			tx(4, "BUY", 11, 50, 5, "2025-03-01"),
		];
		const pos = calcPosition(4, transactions, [], 13);
		expect(pos.quantity).toBe(50);
		// avgCost = (50*11 + 5) / 50 = 11.1
		expect(pos.avgCost).toBeCloseTo(11.1, 6);
		// 第一轮 realized: sellAmt 1200 - cost 1005 = 195
		expect(pos.realizedPnL).toBeCloseTo(195, 2);
	});

	it("买入后未卖出 avgCost 正确", () => {
		const transactions = [tx(5, "BUY", 20, 200, 0, "2025-01-01")];
		const pos = calcPosition(5, transactions, [], 25);
		expect(pos.quantity).toBe(200);
		expect(pos.avgCost).toBeCloseTo(20, 6);
	});
});
