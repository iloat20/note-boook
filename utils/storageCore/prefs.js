/**
 * prefs.js — 轻量用户偏好存储
 *
 * 单一 JSON 对象持久化到本地存储（经 platform/storage 抽象层），
 * 用于首页等页面的用户级偏好：常用资产排序(assetOrder)、
 * 自动刷新开关(autoRefresh)、是否首启引导等。
 *
 * 与 stock/transaction 等业务数据分离，避免污染核心存储键。
 */

const storage = require("../platform/storage");
const PREFS_KEY = "noteboook_prefs";

/**
 * 读取全部偏好（返回浅拷贝，调用方可安全修改）
 * @returns {Object}
 */
function getPrefs() {
	const data = storage.getStorageSync(PREFS_KEY);
	return data && typeof data === "object" ? Object.assign({}, data) : {};
}

/**
 * 覆盖式写入全部偏好
 * @param {Object} obj
 * @returns {Object}
 */
function setPrefs(obj) {
	storage.setStorageSync(PREFS_KEY, obj || {});
	return obj || {};
}

/**
 * 局部更新偏好（合并补丁）
 * @param {Object} patch
 * @returns {Object} 更新后的完整偏好
 */
function updatePrefs(patch) {
	const next = Object.assign({}, getPrefs(), patch || {});
	setPrefs(next);
	return next;
}

/**
 * 读取单个偏好键（带默认值）
 * @param {string} key
 * @param {*} [defaultValue]
 * @returns {*}
 */
function getPref(key, defaultValue) {
	const prefs = getPrefs();
	return prefs[key] === undefined ? defaultValue : prefs[key];
}

module.exports = { getPrefs, setPrefs, updatePrefs, getPref };
