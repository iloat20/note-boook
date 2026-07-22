/**
 * gbk.js — GBK/GB18030 解码的单一归属
 *
 * 腾讯财经行情/汇率接口返回 GBK（gb18030 超集）编码的 ArrayBuffer。
 * 原逻辑在 stockPrice.js 与 exchangeRate.js 各实现一份，本模块收敛之。
 */

/**
 * 将 GBK 编码的响应解码为 UTF-8 字符串。
 * @param {ArrayBuffer|Uint8Array|string|null|undefined} data
 * @returns {string}
 */
function decodeGBK(data) {
	if (!data) return "";
	// 字符串直接透传（exchangeRate 某些分支已拿到字符串）
	if (typeof data === "string") return data;
	// 优先使用 TextDecoder（基础库 2.9.0+ 支持，gb18030 是 GBK 的超集）
	if (typeof TextDecoder !== "undefined") {
		try {
			return new TextDecoder("gb18030").decode(data);
		} catch (_e) {
			// 不支持 gb18030，fallthrough 到逐字节降级
		}
	}
	// 降级：按字节转 latin-1 字符串（中文会乱，但不会崩溃）
	const bytes = new Uint8Array(data);
	const chars = new Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		chars[i] = String.fromCharCode(bytes[i]);
	}
	return chars.join("");
}

module.exports = { decodeGBK };
