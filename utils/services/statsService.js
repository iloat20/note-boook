/**
 * StatsService - 统计数据服务
 */

const Stock = require("../models/stock");
const Transaction = require("../models/transaction");
const Dividend = require("../models/dividend");
const { getAllPositions, getClearedPositions } = require("./positionService");
const { caches } = require("../cache/cacheManager");
const { calcXIRRForRange, getTotalXIRR } = require("./xirrService");
const { getRate, getRates } = require("./exchangeRate");
const { fmt } = require("../helpers/format");
const { getByPeriod } = require("../helpers/dateRange");

// 统计服务缓存键
const STATS_CACHE_KEYS = {
	TOTAL: "total",
	STRATEGY: "strategy",
};

/**
 * 计算指定范围统计数据
 * @param {Array} transactions - 交易记录列表
 * @param {Array} dividends - 分红记录列表
 * @param {Date} startDate - 开始日期
 * @param {Date} endDate - 结束日期
 * @param {string} label - 标签
 * @returns {Object|null} 统计数据
 */
function calcStatsForRange(transactions, dividends, startDate, endDate, label) {
	const periodTrans = transactions.filter((t) => {
		const d = new Date(t.date);
		return d >= startDate && d <= endDate;
	});
	const periodDivs = dividends.filter((d) => {
		const dd = new Date(d.date);
		return dd >= startDate && dd <= endDate;
	});

	if (periodTrans.length === 0 && periodDivs.length === 0) return null;

	let buyAmount = 0,
		sellAmount = 0,
		buyFee = 0,
		sellFee = 0;
	periodTrans.forEach((t) => {
		const amount = parseFloat((t.price * t.quantity).toFixed(2));
		if (t.type === "BUY") {
			buyAmount += amount;
			buyFee += t.fee;
		} else {
			sellAmount += amount;
			sellFee += t.fee;
		}
	});
	const dividendIncome = periodDivs.reduce((sum, d) => sum + d.totalAmount, 0);
	const pnL = sellAmount - sellFee - buyAmount - buyFee + dividendIncome;

	// NOTE: PnL here is realized-only — it does not include unrealized (floating) gains/losses.
	// This is a design limitation: period stats cannot compute unrealized PnL without historical prices.
	return {
		label,
		startDate: startDate.toISOString(),
		endDate: endDate.toISOString(),
		buyAmount: parseFloat(buyAmount.toFixed(2)),
		sellAmount: parseFloat(sellAmount.toFixed(2)),
		buyFee: parseFloat(buyFee.toFixed(2)),
		sellFee: parseFloat(sellFee.toFixed(2)),
		dividendIncome: parseFloat(dividendIncome.toFixed(2)),
		pnL: parseFloat(pnL.toFixed(2)),
		isRealizedOnly: true,
	};
}

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

function getISOWeek(date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const week1 = new Date(d.getFullYear(), 0, 4);
	return Math.ceil(((d - week1) / 86400000 + 1) / 7);
}

/**
 * 生成指定周期类型的时间区间列表
 * @param {string} periodType - DAY|WEEK|MONTH|YEAR
 * @param {Date} firstDate - 起始日期
 * @param {Date} now - 当前日期
 * @returns {Array<{start: Date, end: Date, label: string}>}
 */
function _generatePeriods(periodType, firstDate, now) {
	const periods = [];

	switch (periodType) {
		case "WEEK": {
			let weekStart = new Date(firstDate);
			const dayOfWeek = weekStart.getDay() || 7;
			weekStart = new Date(
				weekStart.getFullYear(),
				weekStart.getMonth(),
				weekStart.getDate() - dayOfWeek + 1,
			);

			while (weekStart <= now) {
				const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
				const weekLabel = `${weekStart.getFullYear()}W${getISOWeek(weekStart)}`;
				periods.push({ start: weekStart, end: weekEnd, label: weekLabel });
				weekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
			}
			break;
		}
		case "MONTH": {
			let monthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

			while (monthStart <= now) {
				const monthEnd = new Date(
					monthStart.getFullYear(),
					monthStart.getMonth() + 1,
					0,
					23,
					59,
					59,
					999,
				);
				const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
				periods.push({ start: monthStart, end: monthEnd, label: monthLabel });
				monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
			}
			break;
		}
		case "YEAR": {
			let yearStart = new Date(firstDate.getFullYear(), 0, 1);

			while (yearStart <= now) {
				const yearEnd = new Date(yearStart.getFullYear(), 11, 31, 23, 59, 59, 999);
				periods.push({
					start: yearStart,
					end: yearEnd,
					label: String(yearStart.getFullYear()),
				});
				yearStart = new Date(yearStart.getFullYear() + 1, 0, 1);
			}
			break;
		}
		default: {
			let dayStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());

			while (dayStart <= now) {
				const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
				periods.push({
					start: dayStart,
					end: dayEnd,
					label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
				});
				dayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
			}
		}
	}

	return periods;
}

/**
 * 按周期获取统计数据
 * @param {string} period - 周期类型（DAY|WEEK|MONTH|YEAR）
 * @returns {Object} 周期统计数据
 */
function getStatsByPeriod(period) {
	const { startDate, endDate } = getByPeriod(period);

	const allTx = Transaction.getAll();
	const allDiv = Dividend.getAll();

	const stat = calcStatsForRange(allTx, allDiv, startDate, endDate, period);

	return {
		period,
		startDate: startDate.toISOString(),
		endDate: endDate.toISOString(),
		buyAmount: stat ? stat.buyAmount : 0,
		sellAmount: stat ? stat.sellAmount : 0,
		buyFee: stat ? stat.buyFee : 0,
		sellFee: stat ? stat.sellFee : 0,
		dividendIncome: stat ? stat.dividendIncome : 0,
		pnL: stat ? stat.pnL : 0,
		isRealizedOnly: true,
	};
}

/**
 * 获取周期统计数据列表
 * @param {string} periodType - 周期类型（DAY|WEEK|MONTH|YEAR）
 * @param {number} count - 返回数量
 * @returns {Array} 周期统计数据列表
 */
function getPeriodStatsList(periodType, count = 12) {
	// 检查缓存
	const cacheKey = `${periodType}-${count}`;
	if (caches.periodStats.has(cacheKey)) {
		return caches.periodStats.get(cacheKey).slice();
	}

	const transactions = Transaction.getAll();
	const dividends = Dividend.getAll();

	if (transactions.length === 0 && dividends.length === 0) {
		return [];
	}

	let firstDate = null;
	transactions.forEach((t) => {
		const d = new Date(t.date);
		if (!firstDate || d < firstDate) firstDate = d;
	});
	if (!firstDate) {
		dividends.forEach((d) => {
			const dd = new Date(d.date);
			if (!firstDate || dd < firstDate) firstDate = dd;
		});
	}
	const now = new Date();

	const result = [];
	const periods = _generatePeriods(periodType, firstDate, now);

	periods.forEach((p) => {
		const item = calcStatsForRange(transactions, dividends, p.start, p.end, p.label);
		if (item) result.push(item);
	});

	const finalResult = result.slice(-count);
	caches.periodStats.set(cacheKey, finalResult.slice());
	return finalResult;
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

/**
 * 按周期计算统计数据（含收益率/XIRR）
 * 从 stats.js _calcPeriodStats 提取，保持 Page 层轻量
 * @param {string} period - 周期类型
 * @param {Function} getDateRange - (period) => { startDate, endDate }
 * @returns {Promise<{stats: Object, detailItems: Array}>}
 */
async function getPeriodStatsWithReturn(period, getDateRange) {
	const { startDate, endDate } = getDateRange(period);
	const rates = await getRates();
	const stocks = Stock.getAll();

	const stockMarket = {};
	stocks.forEach((s) => {
		stockMarket[s.id] = s.market;
	});

	const periodTx = Transaction.getByDateRange(startDate, endDate);
	const periodDiv = Dividend.getAll().filter((d) => {
		const dd = new Date(d.date);
		return dd >= startDate && dd <= endDate;
	});

	let cnyBuyAmount = 0,
		cnySellAmount = 0,
		cnyBuyFee = 0,
		cnySellFee = 0;
	periodTx.forEach((t) => {
		const r = getRate(stockMarket[t.stockId], rates);
		const a = parseFloat((t.price * t.quantity).toFixed(2));
		if (t.type === "BUY") {
			cnyBuyAmount += a * r;
			cnyBuyFee += t.fee * r;
		} else {
			cnySellAmount += a * r;
			cnySellFee += t.fee * r;
		}
	});

	let cnyDividendIncome = 0;
	periodDiv.forEach((d) => {
		const r = getRate(stockMarket[d.stockId], rates);
		cnyDividendIncome += d.totalAmount * r;
	});

	const totalInvestment = cnyBuyAmount + cnyBuyFee;
	const totalRecovery = cnySellAmount - cnySellFee;
	const totalPnL = totalRecovery - totalInvestment + cnyDividendIncome;
	const totalReturnRate = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

	// 短周期用周期收益率，长周期用 XIRR（年化）
	let returnValue = null;
	let returnText = "--";
	let returnLabel = "XIRR";

	const daysInRange = (endDate - startDate) / (24 * 60 * 60 * 1000);
	const usePeriodRate = daysInRange < 90 || periodTx.length + periodDiv.length < 4;

	if (usePeriodRate) {
		returnLabel = period === "WEEK" ? "周收益率" : period === "MONTH" ? "月收益率" : "收益率";
		if (totalInvestment > 0) {
			returnValue = parseFloat(totalReturnRate.toFixed(2));
			returnText = `${(returnValue >= 0 ? "+" : "") + returnValue.toFixed(2)}%`;
		}
	} else {
		try {
			returnValue = await calcXIRRForRange(startDate, endDate);
			if (returnValue !== null) {
				returnText = `${returnValue.toFixed(2)}%`;
			}
		} catch (e) {
			console.error("XIRR 计算失败:", e);
		}
		if (returnValue === null && totalInvestment > 0) {
			returnLabel = "收益率";
			returnValue = parseFloat(totalReturnRate.toFixed(2));
			returnText = `${(returnValue >= 0 ? "+" : "") + returnValue.toFixed(2)}%`;
		}
	}

	const stats = {
		totalInvestment,
		totalRecovery,
		totalPnL,
		returnValue,
		returnText,
		returnLabel,
		totalInvestmentText: fmt(totalInvestment),
		totalRecoveryText: fmt(totalRecovery),
		totalPnLText: fmt(totalPnL),
		totalReturnRateText: `${(totalReturnRate >= 0 ? "+" : "") + totalReturnRate.toFixed(2)}%`,
		dividendIncomeText: fmt(cnyDividendIncome),
		totalBuyFeeText: fmt(cnyBuyFee),
		totalSellFeeText: fmt(cnySellFee),
	};

	// 计算胜率（基于已清仓股票）
	const cleared = getClearedPositions();
	const winCount = cleared.filter((p) => p.realizedPnL + p.dividendIncome > 0).length;
	const winRate = cleared.length > 0 ? Math.round((winCount / cleared.length) * 100) : null;
	stats.winRate = winRate;
	stats.winRateText = winRate !== null ? `${winRate}%` : "--";

	const detailItems = [
		{
			label: "已实现盈亏",
			value: fmt(totalPnL),
			prefix: "",
			colorClass: totalPnL >= 0 ? "profit" : "loss",
		},
		{
			label: returnLabel,
			value: returnText !== "--" ? returnText.replace("%", "") : "--",
			prefix: "",
			colorClass: returnValue !== null ? (returnValue >= 0 ? "profit" : "loss") : "",
		},
		{
			label: "分红收益",
			value: fmt(cnyDividendIncome),
			prefix: "",
			colorClass: "profit",
		},
		{ label: "买入手续费", value: fmt(cnyBuyFee), prefix: "", colorClass: "" },
		{ label: "卖出手续费", value: fmt(cnySellFee), prefix: "", colorClass: "" },
	];

	return { stats, detailItems };
}

module.exports = {
	calcStatsForRange,
	getTotalStats,
	getStatsByPeriod,
	getPeriodStatsList,
	getStrategyStats,
	calcXIRRForRange,
	getTotalXIRR,
	getPeriodStatsWithReturn,
	invalidateStatsCache,
};

/**
 * 清除统计服务缓存（stats + periodStats）
 * 在数据变更时调用，确保统计结果与数据一致
 */
function invalidateStatsCache() {
	caches.stats.clear();
	caches.periodStats.clear();
}
