/**
 * 动画助手 - 页面数字滚动动画
 * 优化版：直接设置终态值，由 CSS transition 驱动动画
 * 消除原来每帧 setData 的 50 次序列化开销
 */

const { fmt } = require("../helpers/format");

/**
 * 批量数字滚动动画（CSS transition 版）
 * 直接设置终态值，CSS transition 负责过渡动画
 * @param {Object} page - 页面实例（this）
 * @param {Object} targets - 目标值 { totalMarketValue: 12345, totalPnL: 678, ... }
 */
function animateAllValues(page, targets) {
	const updates = {};
	Object.keys(targets).forEach((k) => {
		updates[`displayValues.${k}`] = fmt(targets[k]);
	});

	if (page.setData) page.setData(updates);
}

module.exports = {
	animateAllValues,
};
