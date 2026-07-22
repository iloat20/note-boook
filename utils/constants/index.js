// utils/constants/index.js
// Centralized constants for the asset tracking app

const MARKETS = {
	A_SHARE: "A_SHARE",
	HK_SHARE: "HK_SHARE",
	US_SHARE: "US_SHARE",
};

const TRANSACTION_TYPE = {
	BUY: "BUY",
	SELL: "SELL",
};

const DEFAULT_STRATEGIES = [
	"长期",
	"短期",
	"观察",
	"重点",
	"备忘",
	"待定",
];

const TIMING_CONFIG = {
	PRICE_FLASH_CLEAR_DELAY: 650,
	ENTER_ANIM_DELAY: 500,
	TAB_SWITCH_ANIM_DELAY: 300,
	TAB_CONTENT_EXIT_MS: 300,
	SEARCH_DEBOUNCE_MS: 300,
	AUTO_FETCH_DELAY_MS: 600,
	NAVIGATE_BACK_DELAY: 800,
	PAGE_LOAD_COUNT: 10,
	PRICE_TTL_MS: 30 * 60 * 1000,
	// 负结果（停牌/非交易日/无效代码）缓存 TTL：远短于正常价，避免反复打网络又不会永久屏蔽
	NEGATIVE_TTL_MS: 5 * 60 * 1000,
	RATE_CACHE_TTL_MS: 4 * 60 * 60 * 1000,
	SEARCH_HISTORY_MAX: 20,
	SEARCH_SUGGESTIONS_MAX: 8,
};

module.exports = {
	MARKETS,
	TRANSACTION_TYPE,
	DEFAULT_STRATEGIES,
	TIMING_CONFIG,
};
