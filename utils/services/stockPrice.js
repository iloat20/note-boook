/**
 * 价格行情获取工具
 * 使用公开价格数据接口（支持 HTTPS）
 *
 * 架构说明（架构审查 P2-5）：
 * - 外部行情源被抽象为 PriceProvider，当前实现 TencentPriceProvider。
 *   更换数据源只需提供新的 Provider（实现 buildUrl / buildBatchUrl / parseSingle / parseBatch），
 *   上层 fetchStockPrice / fetchAllPrices 无需改动。
 * - 腾讯行情以 "~" 分隔的关键字段索引用 TENCENT_FIELD 命名常量集中管理，避免散落魔法数字。
 * - 数值合法性校验集中在 parseRawFields：关键价格 NaN / 非法时视为无效行情。
 */

const { request } = require("../../api/request");
const { decodeGBK } = require("../helpers/gbk");
const { buildSymbol } = require("../constants/market");

// 调试开关（生产环境设为 false）
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const errLog = DEBUG ? console.error.bind(console) : () => {};

// 腾讯财经行情字段索引（以 "~" 分隔）。命名常量避免魔法数字。
const TENCENT_FIELD = {
	NAME: 1,
	CODE: 2,
	CURRENT: 3,
	YESTERDAY_CLOSE: 4,
	TODAY_OPEN: 5,
	VOLUME: 6,
	HIGH: 33,
	LOW: 34,
	AMOUNT: 37,
};

// 请求并发控制
const MAX_CONCURRENT_REQUESTS = 5;
const REQUEST_DELAY_MS = 100;
const BATCH_SIZE = 40;

// 请求重试配置
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // 重试延迟：第 1 次等待 1s，第 2 次等待 3s

let _activeRequests = 0;
const _requestQueue = [];

// 在途价格请求表：stockId -> Promise。用于并发请求合并（去重），
// 同一股票在途期间，后续 fetchAllPrices 调用复用同一 Promise，不重复发起网络请求。
const _pricePromises = new Map();

// 获取股票符号（用于API请求）—— 委托 market.buildSymbol，市场扩展只改注册表
function getSymbol(market, code) {
	return buildSymbol(market, code);
}

/**
 * 把一条腾讯行情的字段数组解析为标准化对象。
 * 返回 null 表示字段不足或当前价无效（非交易日 / 停牌 / 无效代码）。
 * @param {string[]} fields
 * @returns {Object|null}
 */
function parseRawFields(fields) {
	if (!Array.isArray(fields) || fields.length < 35) return null;

	const currentRaw = parseFloat(fields[TENCENT_FIELD.CURRENT]);
	const yesterdayClose = parseFloat(fields[TENCENT_FIELD.YESTERDAY_CLOSE]);
	// 现价为 0 / 非法时兜底用昨收价（非交易日 / 停牌场景）
	const currentPrice =
		Number.isFinite(currentRaw) && currentRaw > 0
			? currentRaw
			: Number.isFinite(yesterdayClose)
				? yesterdayClose
				: 0;

	// 任一关键价非法（NaN）视为无效行情
	if (!Number.isFinite(currentPrice)) return null;

	return {
		code: fields[TENCENT_FIELD.CODE],
		name: fields[TENCENT_FIELD.NAME],
		currentPrice,
		yesterdayClose: Number.isFinite(yesterdayClose) ? yesterdayClose : 0,
		todayOpen: Number.isFinite(parseFloat(fields[TENCENT_FIELD.TODAY_OPEN]))
			? parseFloat(fields[TENCENT_FIELD.TODAY_OPEN])
			: 0,
		volume: Number.isFinite(parseInt(fields[TENCENT_FIELD.VOLUME], 10))
			? parseInt(fields[TENCENT_FIELD.VOLUME], 10)
			: 0,
		high: Number.isFinite(parseFloat(fields[TENCENT_FIELD.HIGH]))
			? parseFloat(fields[TENCENT_FIELD.HIGH])
			: 0,
		low: Number.isFinite(parseFloat(fields[TENCENT_FIELD.LOW]))
			? parseFloat(fields[TENCENT_FIELD.LOW])
			: 0,
		amount: Number.isFinite(parseFloat(fields[TENCENT_FIELD.AMOUNT]))
			? parseFloat(fields[TENCENT_FIELD.AMOUNT])
			: 0,
	};
}

/**
 * 腾讯财经行情 Provider：封装 URL 构造、响应解析与数值校验。
 * 实现 PriceProvider 契约：buildUrl / buildBatchUrl / parseSingle / parseBatch。
 */
function createTencentProvider() {
	function buildUrl(market, code) {
		const symbol = getSymbol(market, code);
		return symbol ? `https://qt.gtimg.cn/q=${symbol}` : null;
	}

	function buildBatchUrl(stocks) {
		const symbols = stocks.map((stock) => getSymbol(stock.market, stock.code)).filter(Boolean);
		return symbols.length > 0 ? `https://qt.gtimg.cn/q=${symbols.join(",")}` : null;
	}

	// 解析单条腾讯财经 API 数据
	function parseSingle(data) {
		log("[parseSingle] 原始数据:", data.substring(0, 200));

		// 非交易日 / 无效代码：腾讯 API 返回 v_pv_none_match="1"
		if (data.indexOf("pv_none_match") !== -1) {
			log("[parseSingle] 非交易日或无数据匹配");
			return null;
		}

		const match = data.match(/="([^"]*)"/);
		if (!match) {
			warn("[parseSingle] 未匹配到数据，原始:", data.substring(0, 100));
			return null;
		}

		const fields = match[1].split("~");
		const result = parseRawFields(fields);
		log("[parseSingle] 解析结果:", result);
		return result;
	}

	// 解析批量查询响应（多条 v_xxYY="..." 数据）
	// 海外市场价格接口会在代码后附加交易所后缀（如 AAPL.OQ, BRK.B.N），需要剥离
	function parseBatch(responseText) {
		log("[parseBatch] 原始响应:", responseText.substring(0, 300));
		const results = {};
		const regex = /v_([^=]+)="([^"]+)"/g;
		let match;
		let count = 0;
		while ((match = regex.exec(responseText)) !== null) {
			count++;
			const fields = match[2].split("~");
			const parsed = parseRawFields(fields);
			if (!parsed) continue;
			// 剥离海外交易所后缀（.OQ / .N / .A / .P 等）
			const code = parsed.code.replace(/\.[A-Z]+$/i, "");
			results[code] = parsed;
		}
		log("[parseBatch] 解析到", count, "条数据，有效:", Object.keys(results).length);
		return results;
	}

	return {
		name: "tencent",
		buildUrl,
		buildBatchUrl,
		parseSingle,
		parseBatch,
	};
}

// 默认 Provider 实例（可替换：注入其它 createXxxProvider() 实现即可切换数据源）
const priceProvider = createTencentProvider();

// 带并发控制的请求执行器
function _executeWithThrottle(fn) {
	return new Promise((resolve, reject) => {
		const run = () => {
			_activeRequests++;
			fn()
				.then(resolve)
				.catch(reject)
				.finally(() => {
					_activeRequests--;
					if (_requestQueue.length > 0) {
						const next = _requestQueue.shift();
						setTimeout(next, REQUEST_DELAY_MS);
					}
				});
		};
		if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
			run();
		} else {
			_requestQueue.push(run);
		}
	});
}

/**
 * 带指数退避的请求重试包装器
 * @param {Function} fn - 返回 Promise 的请求函数
 * @param {number} maxRetries - 最大重试次数（默认 MAX_RETRIES）
 * @returns {Function} 包装后的函数，自动重试
 */
function _withRetry(fn, maxRetries = MAX_RETRIES) {
	return function attempt(remaining = maxRetries) {
		return fn().catch((err) => {
			if (remaining <= 0) throw err;
			const delay = RETRY_DELAYS[Math.min(maxRetries - remaining, RETRY_DELAYS.length - 1)];
			warn(`[Retry] 请求失败，${delay}ms 后重试，剩余重试次数:`, remaining - 1, err);
			return new Promise((resolve) => {
				setTimeout(resolve, delay);
			}).then(() => attempt(remaining - 1));
		});
	};
}

// 获取单个资产价格
function fetchStockPrice(market, code) {
	return _executeWithThrottle(
		_withRetry(
			() =>
				new Promise((resolve, reject) => {
					const url = priceProvider.buildUrl(market, code);
					if (!url) {
						reject(new Error("不支持的市场类型"));
						return;
					}

					log("[fetchStockPrice] 请求行情", { market, code, url });

					request
						.get(url, null, { timeout: 10000, responseType: "arraybuffer" })
						.then((data) => {
							const responseData = decodeGBK(data);
							log(
								"[fetchStockPrice] 解析数据:",
								typeof responseData === "string" ? responseData.substring(0, 200) : responseData,
							);
							const result = priceProvider.parseSingle(responseData);
							log("[fetchStockPrice] 解析结果:", result);

							if (result && result.currentPrice > 0) {
								resolve(result);
							} else {
								// 非交易日 / 无效代码等正常无数据情况，resolve(null) 而非 reject
								// 让上层 onRefreshPrice 优雅地提示"价格无效"而非崩溃
								log("[fetchStockPrice] 无有效行情数据（非交易日/无效代码）");
								resolve(null);
							}
						})
						.catch((err) => {
							errLog("[fetchStockPrice] 请求失败", err);
							reject(new Error(`网络请求失败: ${err.message || err.errMsg}`));
						});
				}),
		),
	);
}

// 原始批量请求（带重试 + 并发节流）。
// 返回 { results, ok }：ok=false 表示所有重试耗尽（网络故障），
// 上层据此区分「网络故障」与「代码确实无行情」，从而决定缓存策略（负结果缓存）。
function _fetchPriceBatchRaw(stocks) {
	const url = priceProvider.buildBatchUrl(stocks);
	if (!url) {
		return Promise.resolve({
			results: stocks.map((s) => ({ stockId: s.id, price: null })),
			ok: true,
		});
	}

	// 内层：带重试的请求
	// 外层 catch：重试全部耗尽后返回 null 价格 + ok:false，不阻塞整体
	return _executeWithThrottle(
		_withRetry(
			() =>
				new Promise((resolve, reject) => {
					request
						.get(url, null, { timeout: 15000, responseType: "arraybuffer" })
						.then((data) => {
							const responseText = decodeGBK(data);
							const parsed = priceProvider.parseBatch(responseText);
							const results = stocks.map((stock) => {
								const d = parsed[stock.code];
								return {
									stockId: stock.id,
									price: d && d.currentPrice > 0 ? d.currentPrice : null,
								};
							});
							resolve({ results, ok: true });
						})
						.catch((err) => {
							errLog("[_fetchPriceBatchRaw] 批量请求失败", err);
							reject(err);
						});
				}),
		),
	).catch(() => {
		// 所有重试耗尽后，返回 null 价格 + ok:false 标记网络失败
		return {
			results: stocks.map((s) => ({ stockId: s.id, price: null })),
			ok: false,
		};
	});
}

// 同一股票列表的并发去重签名（按 id 排序后拼接，与顺序无关）
function _priceListSignature(stocks) {
	return stocks
		.map((s) => String(s.id))
		.sort()
		.join(",");
}

// 批量获取资产价格，按固定数量分片，避免 URL 过长导致整批失败。
// 并发去重（瓶颈 B）：同一股票列表（signature）在途期间，后续 fetchAllPrices 调用
// 复用同一 Promise，不重复发起网络请求（刷新连点 / onShow 重复触发时的去重）。
// 返回的数组携带 __ok 标记：true=网络成功，false=全部重试耗尽（网络故障）。
function fetchAllPrices(stocks) {
	if (!stocks || stocks.length === 0) return Promise.resolve([]);

	const signature = _priceListSignature(stocks);
	const inflight = _pricePromises.get(signature);
	if (inflight) return inflight;

	const promise = _fetchAllPricesCore(stocks).finally(() => {
		// 请求结算后移除在途记录，避免内存泄漏；下次刷新走 PriceCache 命中判断
		_pricePromises.delete(signature);
	});
	_pricePromises.set(signature, promise);
	return promise;
}

function _fetchAllPricesCore(stocks) {
	const chunks = [];
	for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
		chunks.push(stocks.slice(i, i + BATCH_SIZE));
	}

	return Promise.all(chunks.map(_fetchPriceBatchRaw)).then((chunkResults) => {
		let ok = true;
		const combined = [];
		chunkResults.forEach(({ results, ok: chunkOk }) => {
			if (chunkOk === false) ok = false;
			combined.push(...results);
		});
		// 数组实例上携带 ok 标记，调用方用 Array.isArray + .__ok 判断
		combined.__ok = ok;
		return combined;
	});
}

module.exports = {
	fetchStockPrice,
	fetchAllPrices,
	// 暴露 Provider 以便测试 / 未来替换数据源
	priceProvider,
	createTencentProvider,
};
