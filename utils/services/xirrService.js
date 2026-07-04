const { getRate, getRates } = require("./exchangeRate");
const { Stock, Dividend } = require("../models/index");
const { caches } = require("../cache/cacheManager");
const { xirr } = require("../helpers/xirr");
const DateIndex = require("../models/dateIndex");
const { getCached, setCached } = require("../cache/computedCache");

function _buildCashFlowsCore(
	transactions,
	dividends,
	stockMarket,
	rates,
	terminalDate,
	cashFlowCutoff,
) {
	const items = [];
	transactions.forEach((t) => {
		if (cashFlowCutoff && new Date(t.date) > cashFlowCutoff) return;
		const r = getRate(stockMarket[t.stockId], rates);
		if (t.type === "BUY") {
			items.push({ date: t.date, amount: -(t.price * t.quantity + t.fee) * r });
		} else {
			items.push({ date: t.date, amount: (t.price * t.quantity - t.fee) * r });
		}
	});
	dividends.forEach((d) => {
		if (cashFlowCutoff && new Date(d.date) > cashFlowCutoff) return;
		const r = getRate(stockMarket[d.stockId], rates);
		items.push({ date: d.date, amount: d.totalAmount * r });
	});

	if (items.length < 2) return null;
	items.sort((a, b) => a.date.localeCompare(b.date));

	const cashFlows = items.map((i) => i.amount);
	const dates = items.map((i) => i.date);

	const lastDate = new Date(terminalDate);
	lastDate.setHours(23, 59, 59, 999);

	const holdingPositions = {};
	transactions.forEach((t) => {
		if (lastDate && new Date(t.date) > lastDate) return;
		if (!holdingPositions[t.stockId]) holdingPositions[t.stockId] = { quantity: 0, cost: 0 };
		if (t.type === "BUY") {
			holdingPositions[t.stockId].quantity += t.quantity;
			holdingPositions[t.stockId].cost += t.price * t.quantity + t.fee;
		} else {
			holdingPositions[t.stockId].quantity -= t.quantity;
		}
	});

	let totalValue = 0;
	for (const stockId in holdingPositions) {
		const pos = holdingPositions[stockId];
		if (pos.quantity > 0) {
			const r = getRate(stockMarket[stockId], rates);
			// Terminal value uses cost basis (avg cost = pos.cost / pos.quantity),
			// not market price. Using market price inflated XIRR and made it
			// jump on every price refresh. This also eliminates the dividend
			// double-counting (#11): with a cost-basis terminal, dividends
			// are no longer embedded in the terminal value.
			totalValue += pos.cost * r;
		}
	}

	if (totalValue > 0) {
		cashFlows.push(totalValue);
		dates.push(lastDate.toISOString());
	}

	return { cashFlows, dates };
}

async function _buildCashFlows(transactions, dividends, stocks) {
	const stockMarket = {};
	stocks.forEach((s) => {
		stockMarket[s.id] = s.market;
	});
	const rates = await getRates();
	return _buildCashFlowsCore(transactions, dividends, stockMarket, rates, new Date());
}

async function calcXIRRForRange(startDate, endDate) {
	const cacheKey = `xirr_${startDate.toISOString()}_${endDate.toISOString()}`;
	if (caches.periodStats.has(cacheKey)) return caches.periodStats.get(cacheKey);

	const stocks = Stock.getAll();
	const stockMarket = {};
	stocks.forEach((s) => {
		stockMarket[s.id] = s.market;
	});
	const rates = await getRates();

	const transactions = DateIndex.getByDateRange(startDate, endDate);
	const dividends = Dividend.getAll().filter((d) => {
		const dd = new Date(d.date);
		return dd >= startDate && dd <= endDate;
	});

	const result = _buildCashFlowsCore(transactions, dividends, stockMarket, rates, endDate);
	if (!result) {
		caches.periodStats.set(cacheKey, null);
		return null;
	}

	const xirrResult = xirr(result.cashFlows, result.dates);
	const finalResult = xirrResult !== null ? parseFloat((xirrResult * 100).toFixed(2)) : null;
	caches.periodStats.set(cacheKey, finalResult);
	return finalResult;
}

async function getTotalXIRR() {
	const cacheKey = "total_xirr";

	const memHit = caches.periodStats.get(cacheKey);
	if (memHit !== undefined) return memHit;

	const diskHit = getCached(cacheKey);
	if (diskHit !== null && diskHit !== undefined) {
		caches.periodStats.set(cacheKey, diskHit);
		return diskHit;
	}

	const today = new Date();
	today.setHours(23, 59, 59, 999);
	const result = await calcXIRRForRange(new Date(0), today);

	caches.periodStats.set(cacheKey, result);
	setCached(cacheKey, result);
	return result;
}

module.exports = {
	calcXIRRForRange,
	getTotalXIRR,
};
