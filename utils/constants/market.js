// utils/constants/market.js
// Market label/color/validation helpers — shared across all pages

const { MARKETS } = require("./index");

function getMarketLabel(market) {
	const labels = {
		[MARKETS.A_SHARE]: "境内",
		[MARKETS.HK_SHARE]: "香港",
		[MARKETS.US_SHARE]: "海外",
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

/**
 * 由股票代码格式推断市场（无需用户手动选择）。
 * 历史规则：5 位纯数字归为 A 股，但 validateStockCode 要求 A 股为 6 位，二者存在分歧；
 * 此处保留既有推断行为，分歧统一在此维护，后续如需修订只改这一处。
 * @param {string} code
 * @returns {string|null} MARKETS 枚举值或 null
 */
function inferMarket(code) {
	if (!code) return null;
	const upper = String(code).toUpperCase();
	if (/^\d{6}$/.test(code)) return MARKETS.A_SHARE;
	if (/^(?:hk|HK)\d{1,5}$/.test(upper)) return MARKETS.HK_SHARE;
	if (/^\d{5}$/.test(code)) return MARKETS.A_SHARE;
	if (/^[A-Z]{1,5}$/.test(upper)) return MARKETS.US_SHARE;
	return null;
}

// 境内代码前缀映射（沪/深/北交所）
function getAsharePrefix(code) {
	const codeNum = parseInt(code, 10);
	if (codeNum >= 600000 && codeNum < 700000) return "sh"; // 上海主板 + 科创板（600xxx-688xxx）
	if (codeNum >= 0 && codeNum < 400000) return "sz"; // 深圳主板 + 创业板（000xxx-300xxx）
	if (codeNum >= 800000 && codeNum < 900000) return "bj"; // 北交所（8xxxxx）
	if (codeNum >= 400000 && codeNum < 500000) return "bj"; // 北交所（4xxxxx）
	return "sh"; // 默认上海
}

// 各市场的 API symbol 构造器（OCP：新增市场只在此注册表加一项）
const SYMBOL_BUILDERS = {
	[MARKETS.A_SHARE]: (code) => getAsharePrefix(code) + code,
	[MARKETS.HK_SHARE]: (code) => `r_hk${String(code).padStart(5, "0")}`,
	[MARKETS.US_SHARE]: (code) => `us${String(code).toUpperCase()}`,
};

/**
 * 由市场 + 代码构造 API 请求 symbol（腾讯财经格式）。
 * 单一入口：新增市场只需在 SYMBOL_BUILDERS 注册一项，stockPrice 无需改动。
 * @param {string} market
 * @param {string} code
 * @returns {string|null}
 */
function buildSymbol(market, code) {
	const builder = SYMBOL_BUILDERS[market];
	return builder ? builder(code) : null;
}

module.exports = {
	getMarketLabel,
	getMarketColor,
	getMarketCurrency,
	validateStockCode,
	formatStockCode,
	inferMarket,
	getAsharePrefix,
	buildSymbol,
};
