/**
 * store.js — 轻量状态管理工厂
 *
 * @param {Object} config
 * @param {Object} config.state - 初始状态
 * @param {Object<string, Function>} config.mutations - mutation 函数集合
 * @returns {{
 *   getState: (key?: string) => any,
 *   commit: (type: string, payload?: any) => void,
 *   subscribe: (key: string, callback: Function) => Function
 * }}
 *
 * 用法:
 *   const store = createStore({
 *     state: { count: 0 },
 *     mutations: {
 *       INCREMENT(s) { s.count++ }
 *     }
 *   })
 *   store.subscribe('count', v => console.log(v))
 *   store.commit('INCREMENT')
 */

function createStore(config) {
  const state = config.state || {}
  const mutations = config.mutations || {}
  const _listeners = {}

  function _notify(key, value) {
    if (!_listeners[key]) return
    _listeners[key].forEach(function (cb) {
      try { cb(value) } catch (e) { console.error('[store] notify error:', e) }
    })
  }

  return {
    /** 获取状态，传 key 取子集，不传取全部 */
    getState(key) {
      return key ? state[key] : state
    },

    /** 提交 mutation，同步修改状态并通知订阅者 */
    commit(type, payload) {
      if (typeof mutations[type] === 'function') {
        mutations[type](state, payload)
        _notify(type, payload)
        _notify('*', { type: type, payload: payload })
      } else {
        console.warn('[store] unknown mutation:', type)
      }
    },

    /** 订阅状态变更，返回取消订阅函数 */
    subscribe(key, callback) {
      if (!_listeners[key]) _listeners[key] = []
      _listeners[key].push(callback)
      return function unsubscribe() {
        _listeners[key] = _listeners[key].filter(function (cb) { return cb !== callback })
      }
    }
  }
}

module.exports = { createStore }
