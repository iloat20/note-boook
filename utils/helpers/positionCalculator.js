/**
 * positionCalculator.js — 持仓计算纯函数
 *
 * 无缓存、无副作用、不依赖任何模型或服务。
 * 调用方负责传入完整数据。
 */

/**
 * 计算单只股票的持仓信息
 * @param {number} stockId
 * @param {Array} transactions - 该股票的交易记录
 * @param {Array} dividends - 该股票的分红记录
 * @param {number|null} currentPrice - 当前价格
 * @returns {Object} 持仓信息
 */
function calcPosition(stockId, transactions, dividends, currentPrice) {
	let totalBuyQuantity = 0;
	let totalBuyAmount = 0;
	let totalSellQuantity = 0;
	let totalSellAmount = 0;
	let totalBuyFee = 0;
	let totalSellFee = 0;

	// 统一精度：浮盈公式与展示共用同一份 2 位小数价格，避免"心算对不上"
	const priceForCalc = currentPrice != null ? parseFloat(currentPrice.toFixed(2)) : currentPrice;

	transactions.forEach((t) => {
		if (t.type === "BUY") {
			totalBuyQuantity += t.quantity;
			totalBuyAmount += t.price * t.quantity;
			totalBuyFee += t.fee;
		} else {
			totalSellQuantity += t.quantity;
			totalSellAmount += t.price * t.quantity;
			totalSellFee += t.fee;
		}
	});

	let dividendIncome = 0;
	let shareDividendQty = 0;
	dividends.forEach((d) => {
		if (d.type === "SHARE") {
			shareDividendQty += d.shareQuantity || 0;
		} else {
			dividendIncome += d.totalAmount;
		}
	});

	// 第 1 段：基于 lot 数组 + FIFO 批次匹配计算 realizedPnL。
	// 跨轮次结算（清仓后重新买入）: 前一轮清仓利润不污染新一轮。
	// 验证示例: buy100@10 fee5 → sell100@12 → buy50@11 fee5 → sell50@15
	//   第一轮 lot: costBasis=1005, matchedSell=100, sellAmt=1200, realized=1200-1005=195
	//   第二轮 lot: costBasis=555, matchedSell=50, sellAmt=150, realized=150-555=-405 (待 fee 分摊)
	//   realized 总计 = 195 + (-405) = -210 (再扣除 sellFee 即 total realized)
	const lots = [];
	for (const t of transactions) {
		if (t.type === "BUY") {
			lots.push({ buy: t.quantity, costBasis: t.price * t.quantity + t.fee, matchedSell: 0, sellAmount: 0 });
		} else {
			let qtyToMatch = t.quantity;
			let amtToMatch = t.price * t.quantity;
			for (const lot of lots) {
				if (qtyToMatch <= 0) break;
				if (lot.matchedSell >= lot.buy) continue;
				const avail = lot.buy - lot.matchedSell;
				const matched = Math.min(avail, qtyToMatch);
				const ratio = t.quantity > 0 ? matched / t.quantity : 0;
				const sellAmt = amtToMatch * ratio;
				lot.matchedSell += matched;
				lot.sellAmount += sellAmt;
				qtyToMatch -= matched;
				amtToMatch -= sellAmt;
			}
		}
	}
	const costofMatched = lots.reduce((s, l) => s + (l.costBasis / l.buy) * l.matchedSell, 0);
	const matchedSellAmt = lots.reduce((s, l) => s + l.sellAmount, 0);
	const realizedPnL = totalSellFee > 0
		? matchedSellAmt - costofMatched - (totalSellFee * (matchedSellAmt / totalSellAmount))
		: matchedSellAmt - costofMatched;

	// 第 2 段：累计持仓从未归零"的连续批 + 平均成本计算（不含历史清仓批次）。
	let cumQty = 0;
	let lastResetIdx = 0;
	for (let k = 0; k < transactions.length; k++) {
		const t = transactions[k];
		if (t.type === "BUY") {
			cumQty += t.quantity;
		} else {
			cumQty -= t.quantity;
		}
		if (cumQty <= 0) {
			lastResetIdx = k + 1;
		}
	}
	let liveBuyQty = 0;
	let liveBuyCost = 0;
	let liveSellMatched = 0;
	for (let k = lastResetIdx; k < transactions.length; k++) {
		const t = transactions[k];
		if (t.type === "BUY") {
			liveBuyQty += t.quantity;
			liveBuyCost += t.price * t.quantity + t.fee;
		} else {
			// 同一轮内的卖出匹配数量（不跨 reset）
			const before = liveBuyQty - liveSellMatched;
			const matched = Math.min(before, t.quantity);
			liveSellMatched += matched;
		}
	}
	const liveHoldings = Math.max(0, liveBuyQty - liveSellMatched + (liveBuyQty > 0 ? shareDividendQty : 0));
	const avgCost = liveHoldings > 0 ? liveBuyCost / liveHoldings : 0;

	const positionQuantity = Math.max(0, totalBuyQuantity + shareDividendQty - totalSellQuantity);

	const floatingPnL =
		priceForCalc != null && positionQuantity > 0 ? (priceForCalc - avgCost) * positionQuantity : 0;

	return {
		stockId: stockId,
		quantity: positionQuantity,
		avgCost: avgCost,
		realizedPnL: parseFloat(realizedPnL.toFixed(2)),
		dividendIncome: parseFloat(dividendIncome.toFixed(2)),
		currentPrice: priceForCalc !== null && priceForCalc !== undefined ? priceForCalc : null,
		floatingPnL: parseFloat(floatingPnL.toFixed(2)),
		totalPnL: parseFloat((realizedPnL + floatingPnL + dividendIncome).toFixed(2)),
	};
}

/**
 * 批量计算多个股票的持仓
 * @param {number[]} stockIds - 股票 ID 数组
 * @param {Array} allTransactions - 全部交易记录
 * @param {Array} allDividends - 全部分红记录
 * @param {Function} priceGetter - (stockId) => number|null 获取价格
 * @returns {Object} { stockId: result, ... } 映射
 */
function batchCalcPositions(stockIds, allTransactions, allDividends, priceGetter) {
	// 按 stockId 分组
	const txMap = {};
	const divMap = {};

	allTransactions.forEach((t) => {
		if (!txMap[t.stockId]) txMap[t.stockId] = [];
		txMap[t.stockId].push(t);
	});

	allDividends.forEach((d) => {
		if (!divMap[d.stockId]) divMap[d.stockId] = [];
		divMap[d.stockId].push(d);
	});

	const results = {};
	stockIds.forEach((stockId) => {
		const tx = txMap[stockId] || [];
		const div = divMap[stockId] || [];
		const price = typeof priceGetter === "function" ? priceGetter(stockId) : null;
		results[stockId] = calcPosition(stockId, tx, div, price);
	});

	return results;
}

/**
 * 计算浮动盈亏百分比
 * @param {Object} position - 持仓对象，包含 floatingPnL, avgCost, quantity 字段
 * @returns {string} 百分比字符串，如 "5.23" 或 "0.00"
 */
function calcFloatingPercent(position) {
	if (position.quantity > 0 && position.avgCost > 0) {
		return ((position.floatingPnL / (position.avgCost * position.quantity)) * 100).toFixed(2);
	}
	return "0.00";
}

module.exports = { calcPosition, batchCalcPositions, calcFloatingPercent };
