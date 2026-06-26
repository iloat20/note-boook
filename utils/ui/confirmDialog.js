/**
 * confirmDialog.js — 统一确认删除弹窗
 *
 * 封装 wx.showModal 的删除确认模式（标题/确认色/确认判定）。
 * 动画字段名和删除后回调由调用方处理，本 helper 只消灭 showModal 样板。
 */

/**
 * 确认删除弹窗。统一 history/detail/index 的删除确认入口。
 *
 * @param {Object} options
 * @param {string} [options.title="确认删除"] - 弹窗标题
 * @param {string} options.content - 弹窗内容
 * @param {Function} options.onConfirm - 用户点击确认后的回调
 */
function confirmDelete({ title, content, onConfirm }) {
	wx.showModal({
		title: title || "确认删除",
		content: content,
		confirmColor: "#FF3B30",
		confirmText: "删除",
		success: (res) => {
			if (res.confirm && typeof onConfirm === "function") {
				onConfirm();
			}
		},
	});
}

module.exports = { confirmDelete };
