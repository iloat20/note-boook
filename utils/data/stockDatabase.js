/**
 * 资产代码数据库
 * 预设为空，仅按用户已添加的资产进行联想；可按需扩展常用资产列表。
 * 格式：{ code, name, market }
 */

const A_SHARE = [];
const HK_SHARE = [];
const US_SHARE = [];

const Stock = require("../models/stock");
const { makeIndexItem } = require("../helpers/pinyinIndex");

// 预构建带 market + 拼音索引的完整池，避免每次搜索都创建新对象
const _poolA = A_SHARE.map((s) => makeIndexItem({ ...s, market: "A_SHARE" }));
const _poolHK = HK_SHARE.map((s) => makeIndexItem({ ...s, market: "HK_SHARE" }));
const _poolUS = US_SHARE.map((s) => makeIndexItem({ ...s, market: "US_SHARE" }));
const _poolAll = _poolA.concat(_poolHK, _poolUS);

function searchStocks(keyword, market, limit) {
	limit = limit || 10;
	keyword = (keyword || "").toLowerCase().trim();
	if (!keyword) return [];

	let hkPrefix = false;
	if (/^(hk)(\d+)$/i.test(keyword)) {
		keyword = keyword.replace(/^(hk)/i, "");
		hkPrefix = true;
	}

	// 同时搜索用户本地已添加的资产（确保用户添加的资产出现在建议中）
	// 过 makeIndexItem 附加 pinyin/initials：表内精确拼音，表外空字符串（仍走 code/name 匹配）
	let userStocks = [];
	try {
		const stocks = Stock.getAll();
		userStocks = stocks.map((s) => ({
			...makeIndexItem(s),
			isUser: true,
		}));
	} catch (_e) {
		/* 首次加载时 model 可能未初始化 */
	}

	let pool;
	if (!market) pool = _poolAll;
	else if (market === "A_SHARE") pool = _poolA;
	else if (market === "HK_SHARE") pool = _poolHK;
	else if (market === "US_SHARE") pool = _poolUS;
	else pool = _poolAll;

	// 合并去重（用户资产优先）
	const seen = {};
	const combined = [];
	userStocks.forEach((s) => {
		if (market && s.market !== market) return;
		const key = `${s.code}_${s.market}`;
		if (!seen[key]) {
			seen[key] = true;
			combined.push(s);
		}
	});
	pool.forEach((s) => {
		const key = `${s.code}_${s.market}`;
		if (!seen[key]) {
			seen[key] = true;
			combined.push(s);
		}
	});

	const results = combined.filter((s) => {
		// 如果输入了 hk 前缀，只匹配港股
		if (hkPrefix && s.market !== "HK_SHARE") return false;
		const code = s.code.toLowerCase();
		const name = s.name.toLowerCase();
		const pinyin = (s.pinyin || "").toLowerCase();
		const initials = (s.initials || "").toLowerCase();
		return (
			code.indexOf(keyword) !== -1 ||
			name.indexOf(keyword) !== -1 ||
			pinyin.indexOf(keyword) !== -1 ||
			initials.indexOf(keyword) !== -1
		);
	});

	// 按匹配优先级排序：代码精确 > 代码前缀 > 名称前缀 > 拼音首字母精确 > 拼音前缀 > 其他
	results.sort((a, b) => {
		const aCode = a.code.toLowerCase();
		const bCode = b.code.toLowerCase();
		const aCodeExact = aCode === keyword;
		const bCodeExact = bCode === keyword;
		if (aCodeExact !== bCodeExact) return aCodeExact ? -1 : 1;
		const aCodeStart = aCode.indexOf(keyword) === 0;
		const bCodeStart = bCode.indexOf(keyword) === 0;
		if (aCodeStart !== bCodeStart) return aCodeStart ? -1 : 1;
		const aNameStart = a.name.toLowerCase().indexOf(keyword) === 0;
		const bNameStart = b.name.toLowerCase().indexOf(keyword) === 0;
		if (aNameStart !== bNameStart) return aNameStart ? -1 : 1;
		const aIni = (a.initials || "").toLowerCase();
		const bIni = (b.initials || "").toLowerCase();
		const aIniExact = aIni === keyword;
		const bIniExact = bIni === keyword;
		if (aIniExact !== bIniExact) return aIniExact ? -1 : 1;
		const aIniStart = aIni.indexOf(keyword) === 0;
		const bIniStart = bIni.indexOf(keyword) === 0;
		if (aIniStart !== bIniStart) return aIniStart ? -1 : 1;
		return 0;
	});

	return results.slice(0, limit);
}

module.exports = {
	searchStocks: searchStocks,
};
