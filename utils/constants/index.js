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

const FEE_CONFIG = {
	A_SHARE: {
		commissionRate: 0.00025,
		commissionMin: 5,
		stampDutyRate: 0.001,
		transferFeeRate: 0.00001,
		transferFeeMin: 0,
	},
	HK_SHARE: {
		commissionRate: 0.0003,
		commissionMin: 3,
		stampDutyRate: 0.0013,
		transactionLevyRate: 0.0000278,
		transactionFeeRate: 0.00005,
		transactionFeeMin: 2,
		clearingFeeRate: 0.00002,
		clearingFeeMin: 2,
	},
	US_SHARE: {
		commissionPerTrade: 0.99,
		secFeeRate: 0.0000278,
		tafFeePerShare: 0.000166,
	},
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
	RATE_CACHE_TTL_MS: 4 * 60 * 60 * 1000,
	SEARCH_HISTORY_MAX: 20,
	SEARCH_SUGGESTIONS_MAX: 8,
};

module.exports = {
	MARKETS,
	TRANSACTION_TYPE,
	FEE_CONFIG,
	DEFAULT_STRATEGIES,
	TIMING_CONFIG,
};
