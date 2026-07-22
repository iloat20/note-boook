/**
 * version.js — 数据版本号的单一事实来源（叶子模块，无任何依赖）
 *
 * 任何写操作经 markDataDirty 抬升版本号；computedCache 据此判定磁盘缓存是否失效。
 *
 * 把它抽成独立模块的目的：打破 core ↔ cacheManager ↔ computedCache 的
 * 结构性循环依赖——core 与 computedCache 原本各自隐式依赖"版本语义"，
 * 现在二者都只依赖本模块，环被解除。
 */

let _dataVersion = 0;

/**
 * 抬升数据版本（在任何数据写入后被调用）。
 * 所有现有磁盘缓存条目随即过期。
 */
function bumpVersion() {
	_dataVersion++;
}

/**
 * 读取当前数据版本。
 * @returns {number}
 */
function getVersion() {
	return _dataVersion;
}

/**
 * 直接设置版本号（仅供测试复位使用）。
 * @param {number} v
 */
function setVersion(v) {
	_dataVersion = v;
}

module.exports = {
	bumpVersion,
	getVersion,
	setVersion,
};
