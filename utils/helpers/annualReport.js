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
		const days = Math.max(0, Math.floor((now - g.firstDate) / 86400000));
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
