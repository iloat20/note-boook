// utils/helpers/feeCalculator.js
// Fee calculation with shared constants — getFeeBreakdown is canonical
const { MARKETS, TRANSACTION_TYPE, FEE_CONFIG } = require("../constants/index");

function _calcAShare(type, amount) {
	const config = FEE_CONFIG.A_SHARE;
	let commission = amount * config.commissionRate;
	if (commission < config.commissionMin) commission = config.commissionMin;
	commission = Math.round(commission * 100) / 100;
	let stampDuty = 0;
	if (type === TRANSACTION_TYPE.SELL) {
		stampDuty = amount * config.stampDutyRate;
		stampDuty = Math.round(stampDuty * 100) / 100;
	}
	let transferFee = amount * config.transferFeeRate;
	if (transferFee < config.transferFeeMin) transferFee = config.transferFeeMin;
	transferFee = Math.round(transferFee * 100) / 100;
	return {
		commission: commission,
		stampDuty: stampDuty,
		transferFee: transferFee,
	};
}

function _calcHKShare(type, amount) {
	const config = FEE_CONFIG.HK_SHARE;
	let commission = amount * config.commissionRate;
	if (commission < config.commissionMin) commission = config.commissionMin;
	let stampDuty = amount * config.stampDutyRate;
	stampDuty = Math.ceil(stampDuty);
	const transactionLevy = amount * config.transactionLevyRate;
	let transactionFee = amount * config.transactionFeeRate;
	if (transactionFee < config.transactionFeeMin)
		transactionFee = config.transactionFeeMin;
	let clearingFee = amount * config.clearingFeeRate;
	if (clearingFee < config.clearingFeeMin) clearingFee = config.clearingFeeMin;
	return {
		commission: commission,
		stampDuty: stampDuty,
		transactionLevy: transactionLevy,
		transactionFee: transactionFee,
		clearingFee: clearingFee,
	};
}

function _calcUSShare(type, amount, quantity) {
	const config = FEE_CONFIG.US_SHARE;
	const commission = config.commissionPerTrade;
	let secFee = 0;
	let tafFee = 0;
	if (type === TRANSACTION_TYPE.SELL) {
		secFee = amount * config.secFeeRate;
		if (secFee > 21.84) secFee = 21.84;
		tafFee = quantity * config.tafFeePerShare;
	}
	return { commission: commission, secFee: secFee, tafFee: tafFee };
}

/**
 * 获取费用明细列表
 * @param {string} market - 市场类型（A_SHARE|HK_SHARE|US_SHARE）
 * @param {string} type - 交易类型（BUY|SELL）
 * @param {number|string} price - 价格
 * @param {number|string} quantity - 数量
 * @returns {{ total: number, items: Array<{name:string, value:number}> }}
 */
function getFeeBreakdown(market, type, price, quantity) {
	const p = parseFloat(price) || 0;
	const q = parseInt(quantity, 10) || 0;
	if (p <= 0 || q <= 0) return { total: 0, items: [] };
	const amount = p * q;

	switch (market) {
		case MARKETS.A_SHARE: {
			const config = FEE_CONFIG.A_SHARE;
			const a = _calcAShare(type, amount);
			const total = a.commission + a.stampDuty + a.transferFee;
			return {
				total: parseFloat(total.toFixed(2)),
				items: [
					{
						name: "佣金",
						value: a.commission,
						rate: (config.commissionRate * 100).toFixed(4) + "%",
						min: config.commissionMin,
					},
					{
						name: "印花税",
						value: a.stampDuty,
						rate:
							type === TRANSACTION_TYPE.SELL
								? (config.stampDutyRate * 100).toFixed(2) + "%"
								: "0%",
						note: "仅卖出时收取",
					},
					{
						name: "过户费",
						value: a.transferFee,
						rate: (config.transferFeeRate * 100).toFixed(4) + "%",
					},
				],
			};
		}
		case MARKETS.HK_SHARE: {
			const config = FEE_CONFIG.HK_SHARE;
			const h = _calcHKShare(type, amount);
			const total =
				h.commission +
				h.stampDuty +
				h.transactionLevy +
				h.transactionFee +
				h.clearingFee;
			return {
				total: parseFloat(total.toFixed(2)),
				items: [
					{
						name: "佣金",
						value: h.commission,
						rate: (config.commissionRate * 100).toFixed(3) + "%",
						min: config.commissionMin,
					},
					{
						name: "印花税",
						value: h.stampDuty,
						rate: (config.stampDutyRate * 100).toFixed(2) + "%",
					},
					{
						name: "交易征费",
						value: h.transactionLevy,
						rate: (config.transactionLevyRate * 100).toFixed(4) + "%",
					},
					{
						name: "交易费",
						value: h.transactionFee,
						rate: (config.transactionFeeRate * 100).toFixed(3) + "%",
						min: config.transactionFeeMin,
					},
					{
						name: "中央结算费",
						value: h.clearingFee,
						rate: (config.clearingFeeRate * 100).toFixed(3) + "%",
						min: config.clearingFeeMin,
					},
				],
			};
		}
		case MARKETS.US_SHARE: {
			const config = FEE_CONFIG.US_SHARE;
			const u = _calcUSShare(type, amount, quantity);
			const total = u.commission + u.secFee + u.tafFee;
			return {
				total: parseFloat(total.toFixed(2)),
				items: [
					{ name: "佣金", value: u.commission, note: "每笔固定收费" },
					{
						name: "SEC费",
						value: u.secFee,
						rate: (config.secFeeRate * 100).toFixed(6) + "%",
						note: "仅卖出时收取，上限21.84",
					},
					{
						name: "TAF费",
						value: u.tafFee,
						note: "每股$" + config.tafFeePerShare + "，仅卖出时收取",
					},
				],
			};
		}
		default:
			return { total: 0, items: [] };
	}
}

/**
 * 计算总手续费
 * @param {string} market - 市场类型
 * @param {string} type - 交易类型
 * @param {number|string} price - 价格
 * @param {number|string} quantity - 数量
 * @returns {number}
 */
function calculateFee(market, type, price, quantity) {
	return getFeeBreakdown(market, type, price, quantity).total;
}

module.exports = {
	calculateFee: calculateFee,
	getFeeBreakdown: getFeeBreakdown,
};
