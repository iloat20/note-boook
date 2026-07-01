/**
 * pinyinIndex.js — 股票名拼音/首字母索引
 *
 * 0 依赖。为内置股票池预计算 { pinyin, initials } 字段，
 * 使用子串匹配即可支持：
 *   - 代码:   600519 → 贵州茅台
 *   - 中文:   茅台   → 贵州茅台
 *   - 拼音:   maotai → 贵州茅台
 *   - 首字母: gzmt   → 贵州茅台（核心增强点）
 *
 * 用户自建股票（Stock.getAll）若不在表中，initials 为空字符串，
 * 仍走原有的 code / name 匹配，不会退化。
 *
 * 数据来源：pinyin-pro 生成 + 人工校验；多音字已校正。
 * 首字母保留英文后缀原大小写（-W / -SW / -H / A / B）。
 */

/**
 * 内置股票名 → { pinyin, initials }
 * 覆盖 utils/data/stockDatabase.js 全部 A/HK/US 池。
 */
const NAME_PINYIN_MAP = {
	// ===== A 股 =====
	"浦发银行": { pinyin: "pufayinhang", initials: "pfyh" },
	"民生银行": { pinyin: "minshengyinhang", initials: "msyh" },
	"宝钢股份": { pinyin: "baoganggufen", initials: "bggf" },
	"中国石化": { pinyin: "zhongguoshihua", initials: "zgsh" },
	"南方航空": { pinyin: "nanfanghangkong", initials: "nfhk" },
	"中信证券": { pinyin: "zhongxinzhengquan", initials: "zxzq" },
	"招商银行": { pinyin: "zhaoshangyinhang", initials: "zsyh" },
	"保利发展": { pinyin: "baolifazhan", initials: "blfz" },
	"中国联通": { pinyin: "zhongguoliantong", initials: "zglt" },
	"上汽集团": { pinyin: "shangqijituan", initials: "sqjt" },
	"贵州茅台": { pinyin: "guizhoumaotai", initials: "gzmt" },
	"海尔智家": { pinyin: "haierzhijia", initials: "hezj" },
	"伊利股份": { pinyin: "yiligufen", initials: "ylgf" },
	"航发动力": { pinyin: "hangfadongli", initials: "hfdl" },
	"长江电力": { pinyin: "changjiangdianli", initials: "cjdl" },
	"隆基绿能": { pinyin: "longjilvneng", initials: "ljln" },
	"中国神华": { pinyin: "zhongguoshenhua", initials: "zgsh" },
	"兴业银行": { pinyin: "xingyeyinhang", initials: "xyyh" },
	"中国铁建": { pinyin: "zhongguotiejian", initials: "zgtj" },
	"中国平安": { pinyin: "zhongguopingan", initials: "zgpa" },
	"交通银行": { pinyin: "jiaotongyinhang", initials: "jtyh" },
	"工商银行": { pinyin: "gongshangyinhang", initials: "gsyh" },
	"中国人寿": { pinyin: "zhongguorenshou", initials: "zgrs" },
	"中国建筑": { pinyin: "zhongguojianzhu", initials: "zgjz" },
	"华泰证券": { pinyin: "huataizhengquan", initials: "htzq" },
	"中国中车": { pinyin: "zhongguozhongche", initials: "zgzc" },
	"光大证券": { pinyin: "guangdazhengquan", initials: "gdzq" },
	"中国石油": { pinyin: "zhongguoshiyou", initials: "zgsy" },
	"中国中免": { pinyin: "zhongguozhongmian", initials: "zgzm" },
	"紫金矿业": { pinyin: "zijinkuangye", initials: "zjky" },
	"建设银行": { pinyin: "jiansheyinhang", initials: "jsyh" },
	"中国银行": { pinyin: "zhongguoyinhang", initials: "zgyh" },
	"南方基金": { pinyin: "nanfangjijin", initials: "nfjj" },
	"药明康德": { pinyin: "yaomingkangde", initials: "ymkd" },
	"海天味业": { pinyin: "haitianweiye", initials: "htwy" },
	"韦尔股份": { pinyin: "weiergufen", initials: "wegf" },
	"兆易创新": { pinyin: "zhaoyichuangxin", initials: "zycx" },
	"平安银行": { pinyin: "pinganyinhang", initials: "payh" },
	"万科A": { pinyin: "wankeA", initials: "wkA" },
	"中兴通讯": { pinyin: "zhongxingtongxun", initials: "zxtx" },
	"TCL科技": { pinyin: "TCLkeji", initials: "TCLkj" },
	"美的集团": { pinyin: "meidejituan", initials: "mdjt" },
	"格力电器": { pinyin: "gelidianqi", initials: "gldq" },
	"京东方A": { pinyin: "jingdongfangA", initials: "jdfA" },
	"五粮液": { pinyin: "wuliangye", initials: "wly" },
	"新希望": { pinyin: "xinxiwang", initials: "xxw" },
	"中南建设": { pinyin: "zhongnanjianshe", initials: "znjs" },
	"招商蛇口": { pinyin: "zhaoshangshekou", initials: "zssk" },
	"东方财富": { pinyin: "dongfangcaifu", initials: "dfcf" },
	"汇川技术": { pinyin: "huichuanjishu", initials: "hcjs" },
	"沃森生物": { pinyin: "wosenshengwu", initials: "wssw" },
	"阳光电源": { pinyin: "yangguangdianyuan", initials: "ygdy" },
	"泰格医药": { pinyin: "taigeyiyao", initials: "tgyy" },
	"先导智能": { pinyin: "xiandaozhineng", initials: "xdzn" },
	"温氏股份": { pinyin: "wenshigufen", initials: "wsgf" },
	"欧普康视": { pinyin: "oupukangshi", initials: "opks" },
	"宁德时代": { pinyin: "ningdeshidai", initials: "ndsd" },
	"迈瑞医疗": { pinyin: "mairuiyiliao", initials: "mryl" },
	"爱美客": { pinyin: "aimeike", initials: "amk" },
	"华兴源创": { pinyin: "huaxingyuanchuang", initials: "hxyc" },
	"容百科技": { pinyin: "rongbaikeji", initials: "rbkj" },
	"澜起科技": { pinyin: "lanqikeji", initials: "lqkj" },
	"中国通号": { pinyin: "zhongguotonghao", initials: "zgth" },
	"中微公司": { pinyin: "zhongweigongsi", initials: "zwgs" },
	"传音控股": { pinyin: "chuanyinkonggu", initials: "cykg" },
	"海光信息": { pinyin: "haiguangxinxi", initials: "hgxx" },
	"龙芯中科": { pinyin: "longxinzhongke", initials: "lxzk" },
	"金山办公": { pinyin: "jinshanbangong", initials: "jsbg" },
	"时代电气": { pinyin: "shidaidianqi", initials: "sddq" },
	"晶科能源": { pinyin: "jingkenengyuan", initials: "jkny" },
	"大全能源": { pinyin: "daquannengyuan", initials: "dqny" },
	"华熙生物": { pinyin: "huaxishengwu", initials: "hxsw" },
	"华润微": { pinyin: "huarunwei", initials: "hrw" },
	"天合光能": { pinyin: "tianheguangneng", initials: "thgn" },
	// ===== 港股 =====
	"腾讯控股": { pinyin: "tengxunkonggu", initials: "txkg" },
	"阿里巴巴-W": { pinyin: "alibaba-W", initials: "albb-W" },
	"小米集团-W": { pinyin: "xiaomijituan-W", initials: "xmjt-W" },
	"京东集团-SW": { pinyin: "jingdongjituan-SW", initials: "jdjt-SW" },
	"美团-W": { pinyin: "meituan-W", initials: "mt-W" },
	"工商银行-H": { pinyin: "gongshangyinhang-H", initials: "gsyh-H" },
	"中国移动": { pinyin: "zhongguoyidong", initials: "zgyd" },
	"汇丰控股": { pinyin: "huifengkonggu", initials: "hfkg" },
	"AIA集团": { pinyin: "AIAjituan", initials: "AIAjt" },
	"中国海洋石油": { pinyin: "zhongguohaiyangshiyou", initials: "zghysy" },
	"快手-W": { pinyin: "kuaishou-W", initials: "ks-W" },
	"哔哩哔哩-SW": { pinyin: "bilibili-SW", initials: "blbl-SW" },
	"百度集团-SW": { pinyin: "baidujituan-SW", initials: "bdjt-SW" },
	"香港交易所": { pinyin: "xianggangjiaoyisuo", initials: "xgjys" },
	"海底捞": { pinyin: "haidilao", initials: "hdl" },
	"阿里健康": { pinyin: "alijiankang", initials: "aljk" },
	"石药集团": { pinyin: "shiyaojituan", initials: "syjt" },
	"中国生物制药": { pinyin: "zhongguoshengwuzhiyao", initials: "zgswzy" },
	// ===== 美股 =====
	"苹果": { pinyin: "pingguo", initials: "pg" },
	"微软": { pinyin: "weiruan", initials: "wr" },
	"谷歌A": { pinyin: "gugeA", initials: "ggA" },
	"亚马逊": { pinyin: "yamaxun", initials: "ymx" },
	"英伟达": { pinyin: "yingweida", initials: "ywd" },
	"Meta平台": { pinyin: "Metapingtai", initials: "Metapt" },
	"特斯拉": { pinyin: "tesila", initials: "tsl" },
	"台积电": { pinyin: "taijidian", initials: "tjd" },
	"伯克希尔B": { pinyin: "bokexierB", initials: "bkxeB" },
	"摩根大通": { pinyin: "mogendatong", initials: "mgdt" },
	"Visa": { pinyin: "Visa", initials: "Visa" },
	"联合健康": { pinyin: "lianhejiankang", initials: "lhjk" },
	"埃克森美孚": { pinyin: "aikesenmeifu", initials: "aksmf" },
	"万事达": { pinyin: "wanshida", initials: "wsd" },
	"家得宝": { pinyin: "jiadebao", initials: "jdb" },
	"宝洁": { pinyin: "baojie", initials: "bj" },
	"好市多": { pinyin: "haoshiduo", initials: "hsd" },
	"迪士尼": { pinyin: "dishini", initials: "dsn" },
	"奈飞": { pinyin: "naifei", initials: "nf" },
	"AMD": { pinyin: "AMD", initials: "AMD" },
	"英特尔": { pinyin: "yingteer", initials: "yte" },
	"京东": { pinyin: "jingdong", initials: "jd" },
	"百度": { pinyin: "baidu", initials: "bd" },
	"拼多多": { pinyin: "pinduoduo", initials: "pdd" },
	"贝壳": { pinyin: "beike", initials: "bk" },
	"蔚来": { pinyin: "weilai", initials: "wl" },
	"小鹏汽车": { pinyin: "xiaopengqiche", initials: "xpqc" },
	"理想汽车": { pinyin: "lixiangqiche", initials: "lxqc" },
};

/**
 * 查询股票名的拼音信息
 * @param {string} name - 股票中文名（可含 A/W/SW/H 等后缀）
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
 * 为单条股票对象附加 pinyin / initials 字段（不修改原对象）
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
