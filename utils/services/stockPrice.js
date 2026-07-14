/**
 * 价格行情获取工具
 * 使用公开价格数据接口（支持 HTTPS）
 */

const { request } = require("../../api/request");

// 调试开关（生产环境设为 false）
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const errLog = DEBUG ? console.error.bind(console) : () => {};

// 请求并发控制
const MAX_CONCURRENT_REQUESTS = 5;
const REQUEST_DELAY_MS = 100;
const BATCH_SIZE = 40;

// 请求重试配置
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // 重试延迟：第 1 次等待 1s，第 2 次等待 3s

let _activeRequests = 0;
const _requestQueue = [];

// 将腾讯 API 返回的 GBK ArrayBuffer 解码为 UTF-8 字符串
function decodeGBK(arrayBuffer) {
	if (!arrayBuffer) return "";
	// 优先使用 TextDecoder（基础库 2.9.0+ 支持，gb18030 是 GBK 的超集）
	if (typeof TextDecoder !== "undefined") {
		try {
			return new TextDecoder("gb18030").decode(arrayBuffer);
		} catch (_e) {
			// 不支持 gb18030，fallthrough
		}
	}
	// 降级：按字节转 latin-1 字符串（中文会乱，但不会崩溃）
	const bytes = new Uint8Array(arrayBuffer);
	const chars = new Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		chars[i] = String.fromCharCode(bytes[i]);
	}
	return chars.join("");
}

// 境内代码前缀映射
function getAsharePrefix(code) {
	const codeNum = parseInt(code, 10);
	if (codeNum >= 600000 && codeNum < 700000) return "sh"; // 上海主板 + 科创板（600xxx-688xxx）
	if (codeNum >= 0 && codeNum < 400000) return "sz"; // 深圳主板 + 创业板（000xxx-300xxx）
	if (codeNum >= 800000 && codeNum < 900000) return "bj"; // 北交所（8xxxxx）
	if (codeNum >= 400000 && codeNum < 500000) return "bj"; // 北交所（4xxxxx）
	return "sh"; // 默认上海
}

// 获取股票符号（用于API请求）
function getSymbol(market, code) {
	switch (market) {
		case "A_SHARE":
			return getAsharePrefix(code) + code;
		case "HK_SHARE":
			return `r_hk${String(code).padStart(5, "0")}`;
		case "US_SHARE":
			return `us${String(code).toUpperCase()}`;
		default:
			return null;
	}
}

// 构建API URL - 使用腾讯财经API（支持HTTPS）
function buildUrl(market, code) {
	const symbol = getSymbol(market, code);
	return symbol ? `https://qt.gtimg.cn/q=${symbol}` : null;
}

// 构建批量查询 URL（腾讯 API 支持逗号分隔多只股票）
function buildBatchUrl(stocks) {
	const symbols = stocks.map((stock) => getSymbol(stock.market, stock.code)).filter(Boolean);
	return symbols.length > 0 ? `https://qt.gtimg.cn/q=${symbols.join(",")}` : null;
}

// 解析单条腾讯财经 API 数据
function parseTencentData(data) {
	log("[parseTencentData] 原始数据:", data.substring(0, 200));

	// 非交易日 / 无效代码：腾讯 API 返回 v_pv_none_match="1"
	if (data.indexOf("pv_none_match") !== -1) {
		log("[parseTencentData] 非交易日或无数据匹配");
		return null;
	}

	const match = data.match(/="([^"]*)"/);
	if (!match) {
		warn("[parseTencentData] 未匹配到数据，原始:", data.substring(0, 100));
		return null;
	}

	const fields = match[1].split("~");
	log("[parseTencentData] 字段数:", fields.length, "前5个:", fields.slice(0, 5));
	if (fields.length < 35) {
		warn("[parseTencentData] 字段数不足35:", fields.length);
		return null;
	}

	const currentPrice = parseFloat(fields[3]) || 0;
	// 现价为 0 时兜底用昨收价（非交易日/停牌场景）
	const fallbackPrice = currentPrice > 0 ? currentPrice : parseFloat(fields[4]) || 0;

	const result = {
		code: fields[2],
		name: fields[1],
		currentPrice: fallbackPrice,
		yesterdayClose: parseFloat(fields[4]) || 0,
		todayOpen: parseFloat(fields[5]) || 0,
		volume: parseInt(fields[6], 10) || 0,
		high: parseFloat(fields[33]) || 0,
		low: parseFloat(fields[34]) || 0,
		amount: parseFloat(fields[37]) || 0,
	};
	log("[parseTencentData] 解析成功:", result);
	return result;
}

// 解析批量查询响应（多条 v_xxYY="..." 数据）
// 海外市场价格接口会在代码后附加交易所后缀（如 AAPL.OQ, BRK.B.N），需要剥离
function parseBatchData(responseText) {
	log("[parseBatchData] 原始响应:", responseText.substring(0, 300));
	const results = {};
	const regex = /v_([^=]+)="([^"]+)"/g;
	let match;
	let count = 0;
	while ((match = regex.exec(responseText)) !== null) {
		count++;
		const fields = match[2].split("~");
		if (fields.length >= 35) {
			let code = fields[2];
			// 剥离海外交易所后缀（.OQ / .N / .A / .P 等）
			code = code.replace(/\.[A-Z]+$/i, "");
			let batchPrice = parseFloat(fields[3]) || 0;
			// 现价为 0 时兜底用昨收价（非交易日/停牌场景）
			if (batchPrice <= 0) batchPrice = parseFloat(fields[4]) || 0;
			results[code] = {
				code: code,
				name: fields[1],
				currentPrice: batchPrice,
				yesterdayClose: parseFloat(fields[4]) || 0,
				todayOpen: parseFloat(fields[5]) || 0,
				volume: parseInt(fields[6], 10) || 0,
				high: parseFloat(fields[33]) || 0,
				low: parseFloat(fields[34]) || 0,
				amount: parseFloat(fields[37]) || 0,
			};
		}
	}
	log("[parseBatchData] 解析到", count, "条数据，有效:", Object.keys(results).length);
	return results;
}

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
					const url = buildUrl(market, code);
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
							const result = parseTencentData(responseData);
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

function fetchPriceBatch(stocks) {
	const url = buildBatchUrl(stocks);
	if (!url) return Promise.resolve(stocks.map((s) => ({ stockId: s.id, price: null })));

	// 内层：带重试的请求
	// 外层 catch：重试全部耗尽后返回 null 价格，不阻塞整体
	return _executeWithThrottle(
		_withRetry(
			() =>
				new Promise((resolve, reject) => {
					request
						.get(url, null, { timeout: 15000, responseType: "arraybuffer" })
						.then((data) => {
							const responseText = decodeGBK(data);
							const parsed = parseBatchData(responseText);
							const results = stocks.map((stock) => {
								const d = parsed[stock.code];
								return {
									stockId: stock.id,
									price: d && d.currentPrice > 0 ? d.currentPrice : null,
								};
							});
							resolve(results);
						})
						.catch((err) => {
							errLog("[fetchPriceBatch] 批量请求失败", err);
							reject(err);
						});
				}),
		),
	).catch(() => {
		// 所有重试耗尽后，返回 null 价格保证可用
		return stocks.map((s) => ({ stockId: s.id, price: null }));
	});
}

// 批量获取资产价格，按固定数量分片，避免 URL 过长导致整批失败
function fetchAllPrices(stocks) {
	if (!stocks || stocks.length === 0) return Promise.resolve([]);

	const chunks = [];
	for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
		chunks.push(stocks.slice(i, i + BATCH_SIZE));
	}

	return Promise.all(chunks.map(fetchPriceBatch)).then((chunkResults) =>
		chunkResults.reduce((all, current) => all.concat(current), []),
	);
}

module.exports = {
	fetchStockPrice,
	fetchAllPrices,
};
