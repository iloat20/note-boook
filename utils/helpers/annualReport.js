/**
 * annualReport.js — 年度资产复盘纯函数
 * 持有画像 / 全历史流水 / 组装契约（均已实现，供年度报告重组使用）。
 */

const MS_PER_DAY = 86400000;

/**
 * 计算资产持有画像
 * @param {Array} txList - 交易记录 [{ stockId, date, ... }]
 * @param {Object} stockMap - { [stockId]: { name, ... } }，缺 name 时回退到 id
 * @param {number} now - 基准时间戳（ms），用于推算持有天数
 * @returns {{ longest:{name,days}|null, shortest:{name,days}|null, mostActive:{name,count}|null }}
 *          longest/shortest 按首记日推算的持有天数取极值；mostActive 按记录数取最多。
 */
function computeAssetHoldingPortrait(txList, stockMap, now) {
	const groups = {};
	(txList || []).forEach((t) => {
		const id = t.stockId;
		const ts = new Date(t.date).getTime();
		if (!groups[id]) groups[id] = { firstDate: ts, count: 0 };
		groups[id].count += 1;
		if (ts < groups[id].firstDate) groups[id].firstDate = ts;
	});
	const entries = Object.keys(groups).map((id) => {
		const g = groups[id];
		const days = Math.max(0, Math.floor((now - g.firstDate) / MS_PER_DAY));
		const name = (stockMap?.[id]?.name) || id;
		return { id, name, days, count: g.count };
	});
	if (entries.length === 0) return { longest: null, shortest: null, mostActive: null };
	const byDaysAsc = [...entries].sort((a, b) => a.days - b.days);
	const byCountDesc = [...entries].sort((a, b) => b.count - a.count);
	return {
		longest: { name: byDaysAsc[byDaysAsc.length - 1].name, days: byDaysAsc[byDaysAsc.length - 1].days },
		shortest: { name: byDaysAsc[0].name, days: byDaysAsc[0].days },
		mostActive: { name: byCountDesc[0].name, count: byCountDesc[0].count },
	};
}

/**
 * 计算全历史资产流水（资产持有口径）
 * @param {Array} txList - 交易记录 [{ stockId, type:'BUY'|'SELL', price, quantity, fee }]
 * @param {Array} dividendList - 分红记录 [{ stockId, totalAmount }]
 * @param {Function} [rateResolver] - (stockId) => 汇率，默认 1
 * @returns {{ allInflow:number, allOutflow:number, endingAsset:number }}
 *          allInflow = Σ(BUY 本金+费) + Σ(分红)；allOutflow = Σ(SELL 本金-费)；endingAsset = 差。
 */
function computeAllTimeAssetFlow(txList, dividendList, rateResolver) {
	const rateOf = rateResolver || (() => 1);
	let allInflow = 0;
	let allOutflow = 0;
	(txList || []).forEach((t) => {
		const r = rateOf(t.stockId) || 1;
		const amt = t.price * t.quantity * r;
		if (t.type === "BUY") allInflow += amt + (t.fee || 0) * r;
		else if (t.type === "SELL") allOutflow += amt - (t.fee || 0) * r;
	});
	(dividendList || []).forEach((d) => {
		const r = rateOf(d.stockId) || 1;
		allInflow += (d.totalAmount || 0) * r;
	});
	return { allInflow, allOutflow, endingAsset: allInflow - allOutflow };
}

/**
 * 组装年度复盘报告数据契约
 * @param {Object} opts - 组装入参
 * @param {number} opts.year - 年份
 * @param {number} opts.yearInflow - 本年流入
 * @param {number} opts.yearOutflow - 本年流出
 * @param {number} opts.endingAsset - 年末资产
 * @param {Object} opts.holdingPortrait - 持有画像（computeAssetHoldingPortrait 输出）
 * @param {Function} [opts.fmt] - 金额格式化函数 (n) => string，默认原样转字符串
 * @returns {{ year:number, netChange:number, netChangeSign:string, netChangeText:string,
 *             conclusion:string, inflowText:string, outflowText:string,
 *             endingAssetText:string, holdingPortrait:Object }}
 *          netChange = 流入 - 流出；netChangeSign 视正负取 +/-；conclusion 对应净增/净减。
 */
function assembleAnnualReport(opts) {
	const { year, yearInflow, yearOutflow, endingAsset, holdingPortrait, fmt } = opts || {};
	const f = fmt || ((n) => `${n}`);
	const netChange = yearInflow - yearOutflow;
	// 对比条比例：以 流入/流出 较大者为分母，归一到 0-100（整数）。
	// 边界：双方为 0 时 max 兜底为 1，比例均为 0；仅一方有值时该方为 100。
	const pctMax = Math.max(yearInflow, yearOutflow, 1);
	const toPct = (v) => Math.max(0, Math.min(100, Math.round((v / pctMax) * 100)));
	return {
		year,
		netChange,
		netChangeSign: netChange >= 0 ? "+" : "-",
		netChangeText: f(Math.abs(netChange)),
		conclusion: netChange >= 0 ? "本年资产净增加" : "本年资产净减少",
		inflowText: f(yearInflow),
		outflowText: f(yearOutflow),
		endingAssetText: f(endingAsset),
		holdingPortrait,
		inflowPct: toPct(yearInflow),
		outflowPct: toPct(yearOutflow),
	};
}

module.exports = { computeAssetHoldingPortrait, computeAllTimeAssetFlow, assembleAnnualReport };
