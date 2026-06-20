// utils/helpers/format.js
// Shared number/date formatting helpers

/**
 * 格式化数字为带千分位分隔的字符串，保留 2 位小数
 * @param {number} num
 * @returns {string}
 */
function fmt(num) {
	const n = parseFloat(num);
	if (!Number.isFinite(n)) return "0.00";
	const parts = n.toFixed(2).split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+$)/g, ",");
	return parts.join(".");
}

/**
 * 格式化为 yyyy-MM-dd
 * @param {Date|string} date
 * @returns {string}
 */
function fmtDate(date) {
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return "";
	return (
		d.getFullYear() +
		"-" +
		String(d.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(d.getDate()).padStart(2, "0")
	);
}

/**
 * 格式化为 HH:mm
 * @param {Date|string} date
 * @returns {string}
 */
function fmtTime(date) {
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 格式化为 M/d
 * @param {Date|string} date
 * @returns {string}
 */
function fmtShortDate(date) {
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return "";
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

module.exports = { fmt, fmtDate, fmtTime, fmtShortDate };
