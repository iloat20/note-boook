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

	const positionQuantity = totalBuyQuantity + shareDividendQty - totalSellQuantity;
	const avgCost =
		totalBuyQuantity + shareDividendQty > 0
			? (totalBuyAmount + totalBuyFee) / (totalBuyQuantity + shareDividendQty)
			: 0;

	const realizedPnL =
		totalBuyQuantity + shareDividendQty > 0
			? totalSellAmount - totalSellFee - avgCost * totalSellQuantity
			: totalSellAmount - totalSellFee;

	const floatingPnL =
		currentPrice != null && positionQuantity > 0 ? (currentPrice - avgCost) * positionQuantity : 0;

	return {
		stockId: stockId,
		quantity: positionQuantity,
		avgCost: avgCost,
		realizedPnL: parseFloat(realizedPnL.toFixed(2)),
		dividendIncome: parseFloat(dividendIncome.toFixed(2)),
		currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
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
