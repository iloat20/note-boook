/**
 * 汇率模块
 * 使用腾讯财经 API（qt.gtimg.cn）获取 USD/HKD → CNY 汇率
 * 支持本地缓存（当天有效），API 失败时使用兜底值
 *
 * 腾讯 forex 符号：fx_usr（美元/人民币）、fx_hkd（港币/人民币）
 * qt.gtimg.cn 已在 request 白名单中
 */

const { request } = require("../../api/request");
const { TIMING_CONFIG } = require("../constants/index");
const { getData, saveData } = require("../storageCore/core");

// 腾讯财经 API 获取汇率（批量查询 USD/CNY + HKD/CNY）
const API_URL = "https://qt.gtimg.cn/q=fx_usr,fx_hkd";

// 缓存 key
const CACHE_KEY = "exchange_rate_cache";

// 兜底默认汇率（2026-05 参考值）
const DEFAULTS = {
	usdToCny: 6.8,
	hkdToCny: 0.87,
};

// 汇率缓存有效期（毫秒）- 4小时，支持当天内刷新
const RATE_CACHE_TTL = TIMING_CONFIG.RATE_CACHE_TTL_MS;

/**
 * 解析腾讯财经 API 的汇率数据
 * 返回格式：v_fx_usr="...~...~...~价格~..."
 */
function parseRateResponse(responseText) {
	const results = {};

	// 匹配所有 v_fx_xxx="..." 格式的数据行
	const regex = /v_fx_([^=]+)="([^"]+)"/g;
	let match;
	while ((match = regex.exec(responseText)) !== null) {
		const fields = match[2].split("~");
		if (fields.length >= 5) {
			const price = parseFloat(fields[3]) || 0;
			const yesterdayClose = parseFloat(fields[4]) || 0;
			results[match[1]] = price > 0 ? price : yesterdayClose;
		}
	}
	return results;
}

/**
 * 从 API 获取汇率并缓存
 * @returns {Promise<{usdToCny: number, hkdToCny: number}>}
 */
function fetchAndCacheRates() {
	const currentId = ++_requestId;
	return new Promise((resolve) => {
		request
			.get(API_URL, null, { timeout: 8000, responseType: "arraybuffer" })
			.then((data) => {
				// 如果已有更新的请求，忽略本次过期的响应
				if (currentId !== _requestId) {
					resolve({
						usdToCny: DEFAULTS.usdToCny,
						hkdToCny: DEFAULTS.hkdToCny,
					});
					return;
				}

				// 解码 GBK 响应（优先 TextDecoder，降级逐字节）
				let decoded = "";
				if (data?.byteLength) {
					if (typeof TextDecoder !== "undefined") {
						try {
							decoded = new TextDecoder("gb18030").decode(data);
						} catch (_e) {
							const bytes = new Uint8Array(data);
							const chars = new Array(bytes.length);
							for (let i = 0; i < bytes.length; i++) {
								chars[i] = String.fromCharCode(bytes[i]);
							}
							decoded = chars.join("");
						}
					} else {
						const bytes = new Uint8Array(data);
						const chars = new Array(bytes.length);
						for (let i = 0; i < bytes.length; i++) {
							chars[i] = String.fromCharCode(bytes[i]);
						}
						decoded = chars.join("");
					}
				} else if (typeof data === "string") {
					decoded = data;
				}

				const parsed = parseRateResponse(decoded);
				let usdToCny = parsed.usr || DEFAULTS.usdToCny;
				let hkdToCny = parsed.hkd || DEFAULTS.hkdToCny;

				if (usdToCny < 3 || usdToCny > 15) usdToCny = DEFAULTS.usdToCny;
				if (hkdToCny < 0.05 || hkdToCny > 2) hkdToCny = DEFAULTS.hkdToCny;

				const cache = {
					usdToCny: parseFloat(usdToCny.toFixed(4)),
					hkdToCny: parseFloat(hkdToCny.toFixed(4)),
					date: _today(),
					timestamp: Date.now(),
				};

				try {
					saveData(CACHE_KEY, cache);
				} catch (_e) {
					// 缓存写入失败不影响主流程
				}

				resolve({
					usdToCny: cache.usdToCny,
					hkdToCny: cache.hkdToCny,
				});
			})
			.catch(() => {
				// API 失败，使用兜底值
				resolve({
					usdToCny: DEFAULTS.usdToCny,
					hkdToCny: DEFAULTS.hkdToCny,
				});
			});
	});
}

// Promise deduplication for concurrent calls with timeout
let _inflightPromise = null;
let _requestId = 0;

function _withTimeout(promise, ms) {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(() => {
				reject(new Error("timeout"));
			}, ms);
		}),
	]).finally(() => {
		clearTimeout(timer);
	});
}

/**
 * 获取汇率（优先缓存，缓存过期则重新拉取）
 * @returns {Promise<{usdToCny: number, hkdToCny: number}>}
 */
function getRates() {
	// Check storageCore LRU cache (covers memory + wx.getStorageSync)
	const cached = getData(CACHE_KEY);
	const now = Date.now();
	const isFresh =
		cached?.usdToCny &&
		cached.hkdToCny &&
		cached.timestamp &&
		now - cached.timestamp < RATE_CACHE_TTL;

	if (isFresh) {
		return Promise.resolve({ usdToCny: cached.usdToCny, hkdToCny: cached.hkdToCny });
	}

	return new Promise((resolve) => {
		// Deduplicate concurrent requests with timeout
		if (_inflightPromise) {
			_inflightPromise.then(resolve).catch(() => {
				resolve({ usdToCny: DEFAULTS.usdToCny, hkdToCny: DEFAULTS.hkdToCny });
			});
			return;
		}

		_inflightPromise = _withTimeout(fetchAndCacheRates(), 10000)
			.then((rates) => {
				_inflightPromise = null;
				return rates;
			})
			.catch(() => {
				_inflightPromise = null;
				return { usdToCny: DEFAULTS.usdToCny, hkdToCny: DEFAULTS.hkdToCny };
			});
		_inflightPromise.then(resolve);
	});
}

/**
 * 根据市场获取汇率乘数（原币种 → CNY）
 * @param {string} market - A_SHARE / HK_SHARE / US_SHARE
 * @param {Object} rates - {usdToCny, hkdToCny}
 * @returns {number}
 */
function getRate(market, rates) {
	if (!rates) return 1;
	switch (market) {
		case "HK_SHARE":
			return rates.hkdToCny;
		case "US_SHARE":
			return rates.usdToCny;
		default:
			return 1; // A股不需要换算
	}
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function _today() {
	const d = new Date();
	const m = d.getMonth() + 1;
	const day = d.getDate();
	return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

/**
 * 同步读取缓存汇率（供调用方在 getRates() 失败或 stockId 已孤儿时做快速回退）
 * @param {string} market - A_SHARE / HK_SHARE / US_SHARE
 * @returns {number|null} 缓存汇率；缓存缺失或过期返回 null
 */
function getCachedRate(market) {
	const cached = getData(CACHE_KEY);
	if (!cached?.timestamp) return null;
	const now = Date.now();
	if (now - cached.timestamp >= RATE_CACHE_TTL) return null;
	switch (market) {
		case "HK_SHARE":
			return cached.hkdToCny || null;
		case "US_SHARE":
			return cached.usdToCny || null;
		default:
			return 1; // A股无需换算
	}
}

module.exports = { getRates, getRate, getCachedRate, DEFAULTS };
