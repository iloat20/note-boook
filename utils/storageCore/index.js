/**
 * Storage 模块统一导出
 */

const core = require('./core')
const constants = require('./constants')

module.exports = {
  ...core,
  ...constants
}
