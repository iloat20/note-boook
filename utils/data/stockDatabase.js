/**
 * 股票代码数据库
 * 来源：常见A股/港股/美股，可随使用扩展
 * 格式：{ code, name, market }
 */

const A_SHARE = [
	// 上证主板 (60xxxx)
	{ code: "600000", name: "浦发银行" },
	{ code: "600016", name: "民生银行" },
	{ code: "600019", name: "宝钢股份" },
	{ code: "600028", name: "中国石化" },
	{ code: "600029", name: "南方航空" },
	{ code: "600030", name: "中信证券" },
	{ code: "600036", name: "招商银行" },
	{ code: "600048", name: "保利发展" },
	{ code: "600050", name: "中国联通" },
	{ code: "600104", name: "上汽集团" },
	{ code: "600519", name: "贵州茅台" },
	{ code: "600690", name: "海尔智家" },
	{ code: "600887", name: "伊利股份" },
	{ code: "600893", name: "航发动力" },
	{ code: "600900", name: "长江电力" },
	{ code: "601012", name: "隆基绿能" },
	{ code: "601088", name: "中国神华" },
	{ code: "601166", name: "兴业银行" },
	{ code: "601186", name: "中国铁建" },
	{ code: "601318", name: "中国平安" },
	{ code: "601328", name: "交通银行" },
	{ code: "601398", name: "工商银行" },
	{ code: "601628", name: "中国人寿" },
	{ code: "601668", name: "中国建筑" },
	{ code: "601688", name: "华泰证券" },
	{ code: "601766", name: "中国中车" },
	{ code: "601788", name: "光大证券" },
	{ code: "601857", name: "中国石油" },
	{ code: "601888", name: "中国中免" },
	{ code: "601899", name: "紫金矿业" },
	{ code: "601939", name: "建设银行" },
	{ code: "601988", name: "中国银行" },
	{ code: "601995", name: "南方基金" },
	{ code: "603259", name: "药明康德" },
	{ code: "603288", name: "海天味业" },
	{ code: "603501", name: "韦尔股份" },
	{ code: "603986", name: "兆易创新" },
	// 深证主板 (00xxxx)
	{ code: "000001", name: "平安银行" },
	{ code: "000002", name: "万科A" },
	{ code: "000063", name: "中兴通讯" },
	{ code: "000100", name: "TCL科技" },
	{ code: "000333", name: "美的集团" },
	{ code: "000651", name: "格力电器" },
	{ code: "000725", name: "京东方A" },
	{ code: "000858", name: "五粮液" },
	{ code: "000876", name: "新希望" },
	{ code: "000938", name: "中南建设" },
	{ code: "001979", name: "招商蛇口" },
	// 创业板 (300xxx)
	{ code: "300059", name: "东方财富" },
	{ code: "300124", name: "汇川技术" },
	{ code: "300142", name: "沃森生物" },
	{ code: "300274", name: "阳光电源" },
	{ code: "300347", name: "泰格医药" },
	{ code: "300450", name: "先导智能" },
	{ code: "300498", name: "温氏股份" },
	{ code: "300595", name: "欧普康视" },
	{ code: "300750", name: "宁德时代" },
	{ code: "300760", name: "迈瑞医疗" },
	{ code: "300896", name: "爱美客" },
	// 科创板 (688xxx)
	{ code: "688001", name: "华兴源创" },
	{ code: "688005", name: "容百科技" },
	{ code: "688008", name: "澜起科技" },
	{ code: "688009", name: "中国通号" },
	{ code: "688012", name: "中微公司" },
	{ code: "688036", name: "传音控股" },
	{ code: "688041", name: "海光信息" },
	{ code: "688047", name: "龙芯中科" },
	{ code: "688111", name: "金山办公" },
	{ code: "688187", name: "时代电气" },
	{ code: "688223", name: "晶科能源" },
	{ code: "688256", name: "寒武纪" },
	{ code: "688303", name: "大全能源" },
	{ code: "688363", name: "华熙生物" },
	{ code: "688396", name: "华润微" },
	{ code: "688599", name: "天合光能" },
];

const HK_SHARE = [
	{ code: "00700", name: "腾讯控股" },
	{ code: "09988", name: "阿里巴巴-W" },
	{ code: "01810", name: "小米集团-W" },
	{ code: "09618", name: "京东集团-SW" },
	{ code: "03690", name: "美团-W" },
	{ code: "01398", name: "工商银行-H" },
	{ code: "00941", name: "中国移动" },
	{ code: "00939", name: "建设银行" },
	{ code: "00005", name: "汇丰控股" },
	{ code: "01299", name: "AIA集团" },
	{ code: "00883", name: "中国海洋石油" },
	{ code: "01024", name: "快手-W" },
	{ code: "09626", name: "哔哩哔哩-SW" },
	{ code: "09888", name: "百度集团-SW" },
	{ code: "02318", name: "中国平安-H" },
	{ code: "00388", name: "香港交易所" },
	{ code: "06862", name: "海底捞" },
	{ code: "00241", name: "阿里健康" },
	{ code: "01093", name: "石药集团" },
	{ code: "01177", name: "中国生物制药" },
];

const US_SHARE = [
	{ code: "AAPL", name: "苹果" },
	{ code: "MSFT", name: "微软" },
	{ code: "GOOGL", name: "谷歌A" },
	{ code: "AMZN", name: "亚马逊" },
	{ code: "NVDA", name: "英伟达" },
	{ code: "META", name: "Meta平台" },
	{ code: "TSLA", name: "特斯拉" },
	{ code: "TSM", name: "台积电" },
	{ code: "BRK.B", name: "伯克希尔B" },
	{ code: "JPM", name: "摩根大通" },
	{ code: "V", name: "Visa" },
	{ code: "UNH", name: "联合健康" },
	{ code: "XOM", name: "埃克森美孚" },
	{ code: "MA", name: "万事达" },
	{ code: "HD", name: "家得宝" },
	{ code: "PG", name: "宝洁" },
	{ code: "COST", name: "好市多" },
	{ code: "DIS", name: "迪士尼" },
	{ code: "NFLX", name: "奈飞" },
	{ code: "AMD", name: "AMD" },
	{ code: "INTC", name: "英特尔" },
	{ code: "BABA", name: "阿里巴巴" },
	{ code: "JD", name: "京东" },
	{ code: "BIDU", name: "百度" },
	{ code: "PDD", name: "拼多多" },
	{ code: "BEKE", name: "贝壳" },
	{ code: "NIO", name: "蔚来" },
	{ code: "XPEV", name: "小鹏汽车" },
	{ code: "LI", name: "理想汽车" },
];

const Stock = require("../models/stock");

// 预构建带 market 标签的完整池，避免每次搜索都创建新对象
const _poolA = A_SHARE.map((s) => ({
	code: s.code,
	name: s.name,
	market: "A_SHARE",
}));
const _poolHK = HK_SHARE.map((s) => ({
	code: s.code,
	name: s.name,
	market: "HK_SHARE",
}));
const _poolUS = US_SHARE.map((s) => ({
	code: s.code,
	name: s.name,
	market: "US_SHARE",
}));
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

	// 同时搜索用户本地已添加的股票（确保用户的股票出现在建议中）
	let userStocks = [];
	try {
		const stocks = Stock.getAll();
		userStocks = stocks.map((s) => ({
			code: s.code,
			name: s.name,
			market: s.market,
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

	// 合并去重（用户股票优先）
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
		return (
			s.code.toLowerCase().indexOf(keyword) !== -1 || s.name.toLowerCase().indexOf(keyword) !== -1
		);
	});

	// 按匹配优先级排序：代码前缀匹配 > 名称前缀匹配 > 其他
	results.sort((a, b) => {
		const aCodeExact = a.code.toLowerCase() === keyword;
		const bCodeExact = b.code.toLowerCase() === keyword;
		if (aCodeExact !== bCodeExact) return aCodeExact ? -1 : 1;
		const aCodeStart = a.code.toLowerCase().indexOf(keyword) === 0;
		const bCodeStart = b.code.toLowerCase().indexOf(keyword) === 0;
		if (aCodeStart !== bCodeStart) return aCodeStart ? -1 : 1;
		const aNameStart = a.name.toLowerCase().indexOf(keyword) === 0;
		const bNameStart = b.name.toLowerCase().indexOf(keyword) === 0;
		if (aNameStart !== bNameStart) return aNameStart ? -1 : 1;
		return 0;
	});

	return results.slice(0, limit);
}

module.exports = {
	searchStocks: searchStocks,
};
