/**
 * pinyinIndex.js — 资产名拼音/首字母索引
 *
 * 0 依赖。为内置资产池预计算 { pinyin, initials } 字段，
 * 使用子串匹配即可支持：
 *   - 代码:   600519 → 示例资产
 *   - 中文:   茅台   → 示例资产
 *   - 拼音:   maotai → 示例资产
 *   - 首字母: gzmt   → 示例资产（核心增强点）
 *
 * 用户自建资产（Stock.getAll）若不在表中，initials 为空字符串，
 * 仍走原有的 code / name 匹配，不会退化。
 *
 * 数据来源：pinyin-pro 生成 + 人工校验；多音字已校正。
 * 首字母保留英文后缀原大小写（-W / -SW / -H / A / B）。
 */

/**
 * 内置资产名 → { pinyin, initials }
 * 覆盖 utils/data/stockDatabase.js 全部 A/HK/US 池。
 */
const NAME_PINYIN_MAP = {};

/**
 * 查询资产名的拼音信息
 * @param {string} name - 资产名称（可含 A/W/SW/H 等后缀）
 * @returns {{ pinyin: string, initials: string }} 找不到返回 { pinyin: "", initials: "" }
 */
function getPinyinInfo(name) {
	if (typeof name !== "string" || !name) return { pinyin: "", initials: "" };
	if (NAME_PINYIN_MAP[name]) return NAME_PINYIN_MAP[name];
	// 尝试去掉英文后缀后匹配（如 "阿里巴巴-W" → "阿里巴巴"）
	const stripped = name.replace(/-[A-Z]+$/, "").replace(/[A-Z]$/, "");
	if (stripped !== name && NAME_PINYIN_MAP[stripped]) return NAME_PINYIN_MAP[stripped];
	return { pinyin: "", initials: "" };
}

/**
 * 为单条资产对象附加 pinyin / initials 字段（不修改原对象）
 * @param {{ code: string, name: string, market: string }} stock
 * @returns {{ code: string, name: string, market: string, pinyin: string, initials: string }}
 */
function makeIndexItem(stock) {
	if (!stock || typeof stock !== "object") {
		return { code: "", name: "", market: "", pinyin: "", initials: "" };
	}
	const info = getPinyinInfo(stock.name);
	return {
		code: stock.code,
		name: stock.name,
		market: stock.market,
		pinyin: info.pinyin,
		initials: info.initials,
	};
}

module.exports = {
	NAME_PINYIN_MAP,
	getPinyinInfo,
	makeIndexItem,
};
