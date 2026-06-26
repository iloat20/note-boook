function dateToNumber(date) {
	const d = new Date(date);
	return d.getTime();
}

function xirr(cashFlows, dates, guess = 0.1) {
	const n = cashFlows.length;
	if (n !== dates.length || n < 2) return null;

	const d0 = dateToNumber(dates[0]);
	const t = dates.map((d) => (dateToNumber(d) - d0) / (365.25 * 24 * 60 * 60 * 1000));

	const f = (rate) => {
		let sum = 0;
		for (let i = 0; i < n; i++) {
			sum += cashFlows[i] / (1 + rate) ** t[i];
		}
		return sum;
	};

	const df = (rate) => {
		let sum = 0;
		for (let i = 0; i < n; i++) {
			sum -= (t[i] * cashFlows[i]) / (1 + rate) ** (t[i] + 1);
		}
		return sum;
	};

	let rate = guess;
	const maxIter = 100;
	const tol = 1e-8;

	for (let iter = 0; iter < maxIter; iter++) {
		const fVal = f(rate);
		const dfVal = df(rate);

		if (Math.abs(dfVal) < 1e-12) break;

		const newRate = rate - fVal / dfVal;

		if (!Number.isFinite(newRate)) break;

		if (Math.abs(newRate - rate) < tol) {
			return newRate;
		}

		rate = newRate;

		if (rate < -0.99 || rate > 10) break;
	}

	let lo = -0.99,
		hi = 10;
	let fLo = f(lo),
		fHi = f(hi);
	if (fLo * fHi > 0) return null;

	for (let i = 0; i < maxIter; i++) {
		const mid = (lo + hi) / 2;
		const fMid = f(mid);
		if (Math.abs(fMid) < tol || hi - lo < tol) {
			if (!Number.isFinite(mid)) return null;
			return mid;
		}
		if (fMid * fLo > 0) {
			lo = mid;
			fLo = fMid;
		} else {
			hi = mid;
		}
	}

	const result = (lo + hi) / 2;
	if (!Number.isFinite(result)) return null;
	return result;
}

module.exports = {
	dateToNumber,
	xirr,
};
