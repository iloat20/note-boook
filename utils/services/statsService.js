/**
 * StatsService - 统计数据服务
 */

const Transaction = require("../models/transaction");
const { getAllPositions } = require("./positionService");
const { caches } = require("../cache/cacheManager");

// 统计服务缓存键
const STATS_CACHE_KEYS = {
	TOTAL: "total",
	STRATEGY: "strategy",
};

/**
 * 获取总统计数据
 * @returns {Object} 总统计数据
 */
function getTotalStats() {
	if (caches.stats.has(STATS_CACHE_KEYS.TOTAL)) {
		return caches.stats.get(STATS_CACHE_KEYS.TOTAL);
	}

	let _totalInvestment = 0;
	let totalBuyFee = 0;
	let totalSellFee = 0;
	let totalHistoricalBuy = 0;

	// 从交易记录计算投入和手续费
	const transactions = Transaction.getAll();
	transactions.forEach((t) => {
		const amount = parseFloat((t.price * t.quantity).toFixed(2));
		if (t.type === "BUY") {
			_totalInvestment += amount + t.fee;
			totalBuyFee += t.fee;
			totalHistoricalBuy += amount;
		} else {
			totalSellFee += t.fee;
		}
	});

	// 通过 positionService 缓存获取所有持仓，避免重复计算
	const positions = getAllPositions();

	let totalRealizedPnL = 0;
	let totalFloatingPnL = 0;
	let totalDividendIncome = 0;
	let totalCostBasis = 0;

	positions.forEach((pos) => {
		totalRealizedPnL += pos.realizedPnL;
		totalDividendIncome += pos.dividendIncome;
		if (pos.quantity > 0) {
			totalFloatingPnL += pos.floatingPnL;
			totalCostBasis += pos.avgCost * pos.quantity;
		}
	});

	const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome;
	// 使用实际持仓成本（而非累计买入总额）计算收益率，避免反复买卖膨胀分母
	// When all positions are closed (totalCostBasis == 0), fall back to total historical buy amount
	const costBasisForPercent = totalCostBasis > 0 ? totalCostBasis : totalHistoricalBuy;
	const totalPnLPercent = costBasisForPercent > 0 ? (totalPnL / costBasisForPercent) * 100 : 0;

	const result = {
		totalInvestment: parseFloat(totalHistoricalBuy.toFixed(2)),
		totalCapitalDeployed: parseFloat((totalHistoricalBuy + totalBuyFee).toFixed(2)),
		totalBuyFee: parseFloat(totalBuyFee.toFixed(2)),
		totalSellFee: parseFloat(totalSellFee.toFixed(2)),
		dividendIncome: parseFloat(totalDividendIncome.toFixed(2)),
		realizedPnL: parseFloat(totalRealizedPnL.toFixed(2)),
		floatingPnL: parseFloat(totalFloatingPnL.toFixed(2)),
		totalPnL: parseFloat(totalPnL.toFixed(2)),
		totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2)),
	};

	caches.stats.set(STATS_CACHE_KEYS.TOTAL, result);
	return result;
}

/**
 * 获取策略统计数据
 * @param {Array} [transactions] - 可选：指定的交易记录列表，默认使用全部交易
 * @returns {Array} 策略统计数据列表
 */
function getStrategyStats(transactions) {
	// 传入 transactions 时不缓存，每次返回新对象
	if (!transactions && caches.stats.has(STATS_CACHE_KEYS.STRATEGY)) {
		return caches.stats.get(STATS_CACHE_KEYS.STRATEGY);
	}

	const txList = transactions || Transaction.getAll();
	const stats = {};
	txList.forEach((t) => {
		if (!t.strategies?.length) return;
		const amount = parseFloat((t.price * t.quantity).toFixed(2));
		t.strategies.forEach((tag) => {
			if (!stats[tag])
				stats[tag] = { tag: tag, count: 0, buyAmount: 0, sellAmount: 0, buyFee: 0, sellFee: 0 };
			stats[tag].count++;
			if (t.type === "BUY") {
				stats[tag].buyAmount += amount;
				stats[tag].buyFee += t.fee || 0;
			} else {
				stats[tag].sellAmount += amount;
				stats[tag].sellFee += t.fee || 0;
			}
		});
	});
	const result = Object.values(stats)
		.map((s) => {
			s.netPnL = parseFloat((s.sellAmount - s.sellFee - s.buyAmount - s.buyFee).toFixed(2));
			s.buyAmount = parseFloat(s.buyAmount.toFixed(2));
			s.sellAmount = parseFloat(s.sellAmount.toFixed(2));
			s.buyFee = parseFloat(s.buyFee.toFixed(2));
			s.sellFee = parseFloat(s.sellFee.toFixed(2));
			return s;
		})
		.sort((a, b) => b.count - a.count);

	if (!transactions) {
		caches.stats.set(STATS_CACHE_KEYS.STRATEGY, result);
	}
	return result;
}

module.exports = {
	getTotalStats,
	getStrategyStats,
};
