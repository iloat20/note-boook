/**
 * 统一网络请求封装
 *
 * 精简版：去掉未使用的拦截器管道
 * 仅保留 wx.request Promise 封装 + 便捷方法
 */

/**
 * 统一请求方法
 * @param {Object} options - 请求配置
 * @returns {Promise}
 */
function request(options) {
  return new Promise((resolve, reject) => {
    const config = {
      url: options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        ...options.header
      },
      timeout: options.timeout || 10000,
      responseType: options.responseType || 'text'
    }

    wx.request({
      ...config,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject({ statusCode: res.statusCode, data: res.data })
        }
      },
      fail: (err) => {
        reject({ statusCode: 0, error: err })
      }
    })
  })
}

// 便捷方法
request.get = (url, data, options) => {
  return request({ ...options, url, method: 'GET', data })
}

request.post = (url, data, options) => {
  return request({ ...options, url, method: 'POST', data })
}

request.put = (url, data, options) => {
  return request({ ...options, url, method: 'PUT', data })
}

request.delete = (url, data, options) => {
  return request({ ...options, url, method: 'DELETE', data })
}

module.exports = { request }
