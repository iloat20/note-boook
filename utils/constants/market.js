// utils/constants/market.js
// Market label/color/validation helpers — shared across all pages

const { MARKETS } = require("./index");

function getMarketLabel(market) {
	const labels = {
		[MARKETS.A_SHARE]: "A股",
		[MARKETS.HK_SHARE]: "港股",
		[MARKETS.US_SHARE]: "美股",
	};
	return labels[market] || "";
}

function getMarketColor(market) {
	const colors = {
		[MARKETS.A_SHARE]: "#007AFF",
		[MARKETS.HK_SHARE]: "#FF9500",
		[MARKETS.US_SHARE]: "#AF52DE",
	};
	return colors[market] || "#64748B";
}

function validateStockCode(code, market) {
	switch (market) {
		case MARKETS.A_SHARE:
			return /^\d{6}$/.test(code);
		case MARKETS.HK_SHARE:
			return /^(hk|HK)?\d{1,5}$/.test(code);
		case MARKETS.US_SHARE:
			return /^[A-Za-z]{1,5}$/.test(code);
		default:
			return false;
	}
}

function formatStockCode(code, market) {
	switch (market) {
		case MARKETS.HK_SHARE: {
			const num = code.replace(/^(hk|HK)/, "");
			return num.padStart(5, "0");
		}
		case MARKETS.US_SHARE:
			return code.toUpperCase();
		default:
			return code;
	}
}

function getMarketCurrency(market) {
	const symbols = {
		[MARKETS.A_SHARE]: "¥",
		[MARKETS.HK_SHARE]: "HK$",
		[MARKETS.US_SHARE]: "$",
	};
	return symbols[market] || "¥";
}

module.exports = {
	getMarketLabel,
	getMarketColor,
	getMarketCurrency,
	validateStockCode,
	formatStockCode,
};
