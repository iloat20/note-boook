/**
 * transactionIndex.js — lazy-rebuilt index for Transaction queries.
 *
 * getByStockId(stockId) returns transactions for a stock, sorted by date desc.
 * Rebuilds lazily on first query after invalidate().
 * Invalidate after every write (Transaction.save/delete/deleteByStockId).
 */

const _byStockId = new Map();
let _built = false;

function _ensureBuilt() {
	if (_built) return;
	const txList = require("./transaction");
	const all = txList.getAll();
	const byStockId = new Map();
	all.forEach((t) => {
		if (!byStockId.has(t.stockId)) byStockId.set(t.stockId, []);
		byStockId.get(t.stockId).push(t);
	});
	// Sort each stockId's list by date descending
	byStockId.forEach((list) => {
		list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
	});
	// Replace contents
	_byStockId.clear();
	for (const [k, v] of byStockId) _byStockId.set(k, v);
	_built = true;
}

/**
 * Get transactions for a stock, sorted by date descending.
 * @param {number} stockId
 * @returns {Array} copy of the indexed array (safe to mutate by caller)
 */
function getByStockId(stockId) {
	_ensureBuilt();
	const list = _byStockId.get(stockId);
	return list ? list.slice() : [];
}

/**
 * Invalidate the index. Call after any write to the transaction store.
 */
function invalidate() {
	_built = false;
	_byStockId.clear();
}

module.exports = { getByStockId, invalidate };
