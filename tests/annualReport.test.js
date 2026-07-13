const { computeAssetHoldingPortrait } = require("../utils/helpers/annualReport");

const NOW = new Date("2026-07-13").getTime();

describe("computeAssetHoldingPortrait", () => {
	test("无交易时返回 null", () => {
		expect(computeAssetHoldingPortrait([], {}, NOW)).toEqual({
			longest: null, shortest: null, mostActive: null,
		});
	});
	test("按首记日排最久/最短，按记录数排变动最多", () => {
		const tx = [
			{ stockId: "A", date: "2026-01-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
			{ stockId: "A", date: "2026-03-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
			{ stockId: "B", date: "2026-06-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
		];
		const stockMap = { A: { name: "资产甲" }, B: { name: "资产乙" } };
		const r = computeAssetHoldingPortrait(tx, stockMap, NOW);
		expect(r.longest.name).toBe("资产甲");
		expect(r.longest.days).toBe(193); // 2026-01-01 → 2026-07-13
		expect(r.shortest.name).toBe("资产乙");
		expect(r.shortest.days).toBe(42);  // 2026-06-01 → 2026-07-13
		expect(r.mostActive.name).toBe("资产甲");
		expect(r.mostActive.count).toBe(2);
	});
	test("缺 name 时回退到 id", () => {
		const r = computeAssetHoldingPortrait([{ stockId: "Z", date: "2026-01-01" }], {}, NOW);
		expect(r.longest.name).toBe("Z");
	});
	test("null/undefined 输入不抛错，返回全 null", () => {
		expect(computeAssetHoldingPortrait(null, {}, NOW)).toEqual({
			longest: null, shortest: null, mostActive: null,
		});
		expect(computeAssetHoldingPortrait(undefined, null, NOW)).toEqual({
			longest: null, shortest: null, mostActive: null,
		});
	});
});

const { computeAllTimeAssetFlow } = require("../utils/helpers/annualReport");

describe("computeAllTimeAssetFlow", () => {
	test("买入入流入、卖出入流出、分红入流入", () => {
		const tx = [
			{ stockId: "A", type: "BUY", price: 10, quantity: 100, fee: 5 },
			{ stockId: "A", type: "SELL", price: 12, quantity: 100, fee: 5 },
		];
		const div = [{ stockId: "A", totalAmount: 50 }];
		const r = computeAllTimeAssetFlow(tx, div, () => 1);
		expect(r.allInflow).toBeCloseTo(1055, 5);   // 1000+5+50
		expect(r.allOutflow).toBeCloseTo(1195, 5);  // 1200-5
		expect(r.endingAsset).toBeCloseTo(-140, 5);
	});
	test("rateResolver 按 stock 生效", () => {
		const tx = [{ stockId: "H", type: "BUY", price: 10, quantity: 1, fee: 0 }];
		const r = computeAllTimeAssetFlow(tx, [], (id) => (id === "H" ? 2 : 1));
		expect(r.allInflow).toBeCloseTo(20, 5);
	});
});
