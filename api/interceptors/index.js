/**
 * 拦截器统一导出
 *
 * 【已简化】纯客户端应用无需实际拦截器功能
 * 保留导出以避免破坏性 require 引用
 */

const authInterceptor = require('./authInterceptor')
const cacheInterceptor = require('./cacheInterceptor')
const errorInterceptor = require('./errorInterceptor')

function registerAll() {
  // 纯客户端应用，无需注册远程 API 拦截器
}

module.exports = {
  registerAll,
  authInterceptor,
  cacheInterceptor,
  errorInterceptor
}
