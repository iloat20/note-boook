/**
 * platform/storage.js — 本地存储的平台抽象层（DIP 接缝）
 *
 * 把对具体平台 API（wx.getStorageSync / wx.setStorageSync / wx.removeStorageSync）
 * 的直接依赖收敛到这一层。storageCore / models / services 只依赖本模块，
 * 不直接碰全局 wx。测试或 Node 环境下可整体替换为内存实现。
 */

function getStorageSync(key) {
	return wx.getStorageSync(key);
}

function setStorageSync(key, value) {
	return wx.setStorageSync(key, value);
}

function removeStorageSync(key) {
	return wx.removeStorageSync(key);
}

module.exports = {
	getStorageSync,
	setStorageSync,
	removeStorageSync,
};
