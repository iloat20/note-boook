const { getRate, getRates } = require("./exchangeRate");
const { Stock, Transaction, Dividend } = require("../models/index");
const PriceCache = require("../models/priceCache");
const { caches } = require("../cache/cacheManager");
const { xirr } = require("../helpers/xirr");

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
			const latestPrice = PriceCache.get(stockId);
			if (latestPrice) totalValue += pos.quantity * latestPrice * r;
		}
	}

	if (totalValue > 0) {
		cashFlows.push(totalValue);
		dates.push(lastDate.toISOString());
	}

	return { cashFlows, dates };
}

async function buildCashFlows(transactions, dividends, stocks) {
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

	const transactions = Transaction.getByDateRange(startDate, endDate);
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
	const today = new Date();
	today.setHours(23, 59, 59, 999);
	return calcXIRRForRange(new Date(0), today);
}

module.exports = {
	buildCashFlows,
	calcXIRRForRange,
	getTotalXIRR,
};
