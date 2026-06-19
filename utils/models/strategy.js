const { STRATEGY_KEY, getData, saveData } = require("../storageCore/core");
const { DEFAULT_STRATEGIES } = require("../constants/index");
const Transaction = require("./transaction");

const Strategy = {
	getAll() {
		const customs = getData(STRATEGY_KEY) || [];
		const merged = DEFAULT_STRATEGIES.slice();
		customs.forEach((tag) => {
			if (merged.indexOf(tag) === -1) merged.push(tag);
		});
		return merged;
	},

	save(list) {
		saveData(STRATEGY_KEY, list);
	},

	add(tag) {
		if (!tag || typeof tag !== "string") return;
		tag = tag.trim();
		if (!tag) return;
		const customs = getData(STRATEGY_KEY) || [];
		if (customs.indexOf(tag) === -1 && DEFAULT_STRATEGIES.indexOf(tag) === -1) {
			customs.push(tag);
			saveData(STRATEGY_KEY, customs);
		}
	},

	remove(tag) {
		const customs = getData(STRATEGY_KEY) || [];
		const idx = customs.indexOf(tag);
		if (idx >= 0) {
			customs.splice(idx, 1);
			saveData(STRATEGY_KEY, customs);
		}
	},

	getUsedStrategies() {
		const transactions = Transaction.getAll();
		const countMap = {};
		transactions.forEach((t) => {
			if (t.strategies && t.strategies.length) {
				t.strategies.forEach((tag) => {
					countMap[tag] = (countMap[tag] || 0) + 1;
				});
			}
		});
		const result = Object.keys(countMap).map((tag) => ({
			tag: tag,
			count: countMap[tag],
		}));
		result.sort((a, b) => b.count - a.count);
		return result;
	},
};

module.exports = Strategy;
