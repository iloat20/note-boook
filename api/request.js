/**
 * 统一网络请求封装
 *
 * 负责构建请求配置（header/timeout/responseType/method/data），
 * 真正的请求发起与 success/fail 归一化委托给 platform/http（DIP 接缝）。
 */

const { request: wxRequest } = require("../utils/platform/http");

/**
 * 统一请求方法
 * @param {Object} options - 请求配置
 * @returns {Promise}
 */
function request(options) {
	return new Promise((resolve, reject) => {
		const config = {
			url: options.url,
			method: options.method || "GET",
			data: options.data || {},
			header: {
				"Content-Type": "application/json",
				...options.header,
			},
			timeout: options.timeout || 10000,
			responseType: options.responseType || "text",
		};

		wxRequest(config).then(resolve).catch(reject);
	});
}

// 便捷方法
request.get = (url, data, options) => {
	return request({ ...options, url, method: "GET", data });
};

request.post = (url, data, options) => {
	return request({ ...options, url, method: "POST", data });
};

request.put = (url, data, options) => {
	return request({ ...options, url, method: "PUT", data });
};

request.delete = (url, data, options) => {
	return request({ ...options, url, method: "DELETE", data });
};

module.exports = { request };
