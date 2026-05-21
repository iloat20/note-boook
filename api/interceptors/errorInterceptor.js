/**
 * 错误拦截器
 * 统一处理响应错误
 *
 * 【已停用】纯客户端应用无需错误拦截器
 * 保留为空函数以避免破坏性变更
 */

function responseInterceptor(response) {
  return response
}

module.exports = {
  response: responseInterceptor
}
