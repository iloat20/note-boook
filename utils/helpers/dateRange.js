/**
 * dateRange.js — 日期范围计算工具
 *
 * 统一所有统计页面的日期范围计算逻辑，消除重复代码。
 * 每个函数返回 { startDate, endDate }，时间精确到毫秒。
 */

/**
 * 获取今天的日期范围（00:00:00.000 ~ 23:59:59.999）
 * @returns {{ startDate: Date, endDate: Date }}
 */
function today() {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(start.getTime() + 86400000 - 1);
	return { startDate: start, endDate: end };
}

/**
 * 获取本周的日期范围（周一 00:00:00.000 ~ 周日 23:59:59.999）
 * @returns {{ startDate: Date, endDate: Date }}
 */
function thisWeek() {
	const now = new Date();
	const dayOfWeek = now.getDay() || 7; // 周日=0 → 7
	const start = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() - dayOfWeek + 1,
	);
	const end = new Date(start.getTime() + 604800000 - 1); // 7天 - 1ms
	return { startDate: start, endDate: end };
}

/**
 * 获取本月的日期范围（1日 00:00:00.000 ~ 末日 23:59:59.999）
 * @returns {{ startDate: Date, endDate: Date }}
 */
function thisMonth() {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(
		now.getFullYear(),
		now.getMonth() + 1,
		0,
		23,
		59,
		59,
		999,
	);
	return { startDate: start, endDate: end };
}

/**
 * 获取今年的日期范围（1月1日 00:00:00.000 ~ 今天 23:59:59.999）
 * 使用"年至今"语义，而非全年（避免未来日期影响缓存）
 * @returns {{ startDate: Date, endDate: Date }}
 */
function yearToDate() {
	const now = new Date();
	const start = new Date(now.getFullYear(), 0, 1);
	const end = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		23,
		59,
		59,
		999,
	);
	return { startDate: start, endDate: end };
}

/**
 * 获取指定年份的完整日期范围
 * @param {number} year - 年份
 * @returns {{ startDate: Date, endDate: Date }}
 */
function fullYear(year) {
	const start = new Date(year, 0, 1);
	const end = new Date(year, 11, 31, 23, 59, 59, 999);
	return { startDate: start, endDate: end };
}

/**
 * 根据周期类型获取日期范围
 * @param {string} period - 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
 * @returns {{ startDate: Date, endDate: Date }}
 */
function getByPeriod(period) {
	switch (period) {
		case "DAY":
			return today();
		case "WEEK":
			return thisWeek();
		case "MONTH":
			return thisMonth();
		case "YEAR":
			return yearToDate();
		default: {
			const now = new Date();
			return { startDate: new Date(0), endDate: now };
		}
	}
}

module.exports = {
	today,
	thisWeek,
	thisMonth,
	yearToDate,
	fullYear,
	getByPeriod,
};
