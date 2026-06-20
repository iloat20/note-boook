/**
 * 动画助手 - 页面数字滚动动画
 * 从 index.js 提取，减少页面文件大小
 */

const { fmt } = require("../helpers/format");

/**
 * 批量数字滚动动画
 * @param {Object} page - 页面实例（this）
 * @param {Object} targets - 目标值 { totalMarketValue: 12345, totalPnL: 678, ... }
 * @param {number} duration - 动画时长 ms
 */
function animateAllValues(page, targets, duration) {
	duration = duration || 800;
	const startValues = {};
	const keys = Object.keys(targets);

	keys.forEach((k) => {
		const displayVal = page.data.displayValues[k];
		startValues[k] = parseFloat(String(displayVal || 0).replace(/,/g, "")) || 0;
	});

	const startTime = Date.now();
	let _alive = true;

	if (page._animTimer) clearTimeout(page._animTimer);

	function animate() {
		if (!_alive) return;
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const eased = 1 - (1 - progress) ** 3;

		const updates = {};
		keys.forEach((k) => {
			const current = startValues[k] + (targets[k] - startValues[k]) * eased;
			updates[`displayValues.${k}`] = fmt(parseFloat(current.toFixed(2)));
		});

		if (page.setData) page.setData(updates);

		if (progress < 1) {
			page._animTimer = setTimeout(animate, 16);
		} else {
			page._animTimer = null;
		}
	}

	animate();

	return function cancel() {
		_alive = false;
		if (page._animTimer) {
			clearTimeout(page._animTimer);
			page._animTimer = null;
		}
	};
}

module.exports = {
	animateAllValues,
};
