/**
 * dateIndex.js — lazy-rebuilt date-sorted index for Transaction range queries.
 *
 * getByDateRange(startDate, endDate) returns transactions within range using binary search.
 * Rebuilds lazily on first query after invalidate().
 * Invalidate after every write (Transaction.save/delete/deleteByStockId).
 */

const _sortedByDate = [];
let _built = false;

function _ensureBuilt() {
	if (_built) return;
	const txList = require("./transaction");
	const all = txList.getAll();
	const sorted = all.map((t) => ({
		_sortKey: t._sortKey != null ? t._sortKey : new Date(t.date).getTime(),
		ref: t,
	}));
	sorted.sort((a, b) => a._sortKey - b._sortKey);
	_sortedByDate.length = 0;
	_sortedByDate.push(...sorted);
	_built = true;
}

// First index where _sortKey >= targetKey
function _lowerBound(targetKey) {
	let lo = 0;
	let hi = _sortedByDate.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (_sortedByDate[mid]._sortKey < targetKey) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

// First index where _sortKey > targetKey
function _upperBound(targetKey) {
	let lo = 0;
	let hi = _sortedByDate.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (_sortedByDate[mid]._sortKey <= targetKey) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * Get transactions within date range (inclusive on both ends), sorted ascending by date.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array} transaction references
 */
function getByDateRange(startDate, endDate) {
	_ensureBuilt();
	const startKey = startDate.getTime();
	const endKey = endDate.getTime();
	const lo = _lowerBound(startKey);
	const hi = _upperBound(endKey);
	const result = [];
	for (let i = lo; i < hi; i++) {
		result.push(_sortedByDate[i].ref);
	}
	return result;
}

/**
 * Invalidate the index. Call after any write to the transaction store.
 */
function invalidate() {
	_built = false;
	_sortedByDate.length = 0;
}

module.exports = { getByDateRange, invalidate };
