// utils/services/colorRhythm.js
// 动态金色节奏调度器
// 详见 docs/superpowers/specs/2026-06-21-dynamic-gold-color-rhythm-design.md

const { TIME_PHASES, PROFIT_PHASES, TIME_RANGES } = require("../constants/colorRhythm");

const TIMER_INTERVAL_MS = 60 * 1000; // 每分钟轮询

/**
 * 根据 Date 判定时段
 * @param {Date} [date] 默认当前时间
 * @returns {"morning" | "noon" | "dusk" | "night"}
 */
function getTimePhase(date = new Date()) {
	const h = date.getHours();
	if (h >= TIME_RANGES.morning[0] && h < TIME_RANGES.morning[1]) return "morning";
	if (h >= TIME_RANGES.noon[0] && h < TIME_RANGES.noon[1]) return "noon";
	if (h >= TIME_RANGES.dusk[0] && h < TIME_RANGES.dusk[1]) return "dusk";
	return "night";
}

/**
 * 根据盈亏率判定 glow 档位
 * @param {number} profitRate 盈亏率（百分比或小数均可，符号决定档位）
 * @returns {"up" | "flat" | "down"}
 */
function getProfitPhase(profitRate) {
	if (Number.isNaN(profitRate)) return "flat";
	if (profitRate > 0) return "up";
	if (profitRate < 0) return "down";
	return "flat";
}

/**
 * 合并时间层 + 数据层变量为扁平对象
 * 注：--xhs-card-glow-color 由 WXSS 基线声明为 var(--xhs-gold-time)，此处不输出
 * @param {string} timePhase
 * @param {string} profitPhase
 * @returns {Object<string, string>}
 */
function buildGoldVars(timePhase, profitPhase) {
	return {
		...TIME_PHASES[timePhase],
		...PROFIT_PHASES[profitPhase],
	};
}

/**
 * 把扁平 CSS 变量对象序列化为 style 内联字符串
 * 例: { "--xhs-gold-time": "#FFB800" } → "--xhs-gold-time:#FFB800;"
 * @param {Object<string, string>} vars
 * @returns {string}
 */
function stringifyGoldVars(vars) {
	if (!vars || typeof vars !== "object") return "";
	return Object.keys(vars)
		.map((k) => `${k}:${vars[k]};`)
		.join("");
}

/**
 * 把 CSS 变量序列化后注入页面（写入 goldVars 字符串，供根容器 style 绑定）
 * @param {Object} pageCtx 页面实例（this），需有 setData
 * @param {Object<string, string>} vars 扁平 CSS 变量对象
 */
function applyToPage(pageCtx, vars) {
	if (!pageCtx || typeof pageCtx.setData !== "function") return;
	pageCtx.setData({ goldVars: stringifyGoldVars(vars) });
}

/**
 * 启动每分钟轮询：重算时段并 applyToPage
 * @param {Object} pageCtx 页面实例
 * @param {{ profitPhase?: string, onTick?: Function }} [options]
 *   - profitPhase: 锁定盈亏档（轮询只重算时段，盈亏档由持仓数据刷新驱动）
 *   - onTick: 每次轮询触发的回调（便于测试）
 * @returns {number} timerId
 */
function startTimer(pageCtx, options = {}) {
	const profitPhase = options.profitPhase || "flat";
	function tick() {
		try {
			const vars = buildGoldVars(getTimePhase(), profitPhase);
			applyToPage(pageCtx, vars);
		} catch (e) {
			console.error("[colorRhythm] tick error:", e);
		}
		if (typeof options.onTick === "function") {
			try {
				options.onTick();
			} catch (_) {
				/* noop */
			}
		}
	}
	return setInterval(tick, TIMER_INTERVAL_MS);
}

/**
 * 停止轮询（防泄漏，呼应 commit 8f75819）
 * @param {number} timerId
 */
function stopTimer(timerId) {
	if (timerId == null) return;
	try {
		clearInterval(timerId);
	} catch (_) {
		/* noop */
	}
}

module.exports = {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
	stringifyGoldVars,
	applyToPage,
	startTimer,
	stopTimer,
};
