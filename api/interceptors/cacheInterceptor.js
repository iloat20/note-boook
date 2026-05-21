/**
 * 缓存拦截器
 * 处理请求缓存和响应缓存
 *
 * 【已停用】纯客户端应用无需缓存拦截器
 * 保留为空函数以避免破坏性变更
 */

function requestInterceptor(config) {
  return config
}

function responseInterceptor(response) {
  return response
}

module.exports = {
  request: requestInterceptor,
  response: responseInterceptor
}
