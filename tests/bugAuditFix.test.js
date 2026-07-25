/**
 * 2026-07-25 Bug Audit 回归测试
 *  - #1 calcPosition 对交易顺序不应敏感（FIFO 批次匹配 / 跨轮次均价依赖时间序）
 *  - #2 getStrategyStats 多标签交易按比例分摊，跨标签求和不双计
 */
const { calcPosition } = require("../utils/helpers/positionCalculator");
const { getStrategyStats } = require("../utils/services/statsService");

function tx(stockId, type, price, quantity, fee, date) {
	return { stockId, type, price, quantity, fee: fee || 0, date, _sortKey: Date.parse(date) };
}

describe("bug-audit #1: calcPosition 对交易顺序不敏感（FIFO）", () => {
	it("降序输入下已实现盈亏与升序一致：buy100@10 fee5 → sell100@12 应得 195", () => {
		const asc = [
			tx(1, "BUY", 10, 100, 5, "2025-01-01"),
			tx(1, "SELL", 12, 100, 0, "2025-02-01"),
		];
		const desc = [...asc].reverse(); // 模拟 transactionIndex.getByStockId 的降序输出
		const posAsc = calcPosition(1, asc, [], null);
		const posDesc = calcPosition(1, desc, [], null);
		expect(posAsc.realizedPnL).toBeCloseTo(195, 2);
		expect(posDesc.realizedPnL).toBeCloseTo(195, 2);
	});

	it("跨轮次买回再卖，降序下不污染新一轮利润（应为 390）", () => {
		const asc = [
			tx(2, "BUY", 10, 100, 5, "2025-01-01"),
			tx(2, "SELL", 12, 100, 0, "2025-02-01"),
			tx(2, "BUY", 11, 50, 5, "2025-03-01"),
			tx(2, "SELL", 15, 50, 0, "2025-04-01"),
		];
		const desc = [...asc].reverse();
		const posDesc = calcPosition(2, desc, [], null);
		expect(posDesc.realizedPnL).toBeCloseTo(390, 2);
	});
});

describe("bug-audit #2: getStrategyStats 多标签交易按比例分摊", () => {
	it("单标签交易行为与修复前一致（不回归）", () => {
		const txs = [{ stockId: 1, type: "BUY", price: 10, quantity: 100, fee: 1, strategies: ["A"] }];
		const r = getStrategyStats(txs);
		expect(r).toHaveLength(1);
		expect(r[0].buyAmount).toBeCloseTo(1000, 2);
		expect(r[0].count).toBe(1);
	});

	it("多标签交易金额与费用按 1/n 分摊，跨标签求和等于真实总额", () => {
		const txs = [{ stockId: 1, type: "BUY", price: 10, quantity: 100, fee: 2, strategies: ["A", "B"] }];
		const r = getStrategyStats(txs);
		expect(r).toHaveLength(2);
		const a = r.find((x) => x.tag === "A");
		const b = r.find((x) => x.tag === "B");
		expect(a.buyAmount).toBeCloseTo(500, 2);
		expect(b.buyAmount).toBeCloseTo(500, 2);
		expect(a.buyFee).toBeCloseTo(1, 2);
		expect(b.buyFee).toBeCloseTo(1, 2);
		// 跨标签求和 == 真实总额，不再双计
		expect(a.buyAmount + b.buyAmount).toBeCloseTo(1000, 2);
		expect(a.buyFee + b.buyFee).toBeCloseTo(2, 2);
	});
});
