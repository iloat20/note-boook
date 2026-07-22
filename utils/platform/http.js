/**
 * platform/http.js — 网络请求的平台抽象层（DIP 接缝）
 *
 * 把对具体平台 API（wx.request）的直接依赖收敛到这一层。
 * api/request 负责构建请求配置（header/timeout/responseType 等），本模块只负责
 * 真正发起请求并把 wx 的 success/fail 归一为 Promise。测试或 Node 环境下可整体替换。
 */

function request(options) {
	return new Promise((resolve, reject) => {
		wx.request({
			...options,
			success: (res) => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(res.data);
				} else {
					reject({ statusCode: res.statusCode, data: res.data });
				}
			},
			fail: (err) => {
				reject({ statusCode: 0, error: err });
			},
		});
	});
}

module.exports = { request };
