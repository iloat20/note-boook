/**
 * annualReport.js — 年度资产复盘纯函数
 * 持有画像 / 全历史流水 / 组装契约（后两者为后续任务占位）。
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
		const name = (stockMap && stockMap[id] && stockMap[id].name) || id;
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

module.exports = { computeAssetHoldingPortrait, computeAllTimeAssetFlow: () => ({}), assembleAnnualReport: () => ({}) };
