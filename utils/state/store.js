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
	const state = config.state || {};
	const mutations = config.mutations || {};
	const _listeners = {};

	function _notify(key, value) {
		if (!_listeners[key]) return;
		_listeners[key].forEach((cb) => {
			try {
				cb(value);
			} catch (e) {
				console.error("[store] notify error:", e);
			}
		});
	}

	return {
		/** 获取状态，传 key 取子集，不传取全部 */
		getState(key) {
			return key ? state[key] : state;
		},

		/** 提交 mutation，同步修改状态并通知订阅者 */
		commit(type, payload) {
			if (typeof mutations[type] === "function") {
				mutations[type](state, payload);
				_notify(type, payload);
				_notify("*", { type: type, payload: payload });
			} else {
				console.warn("[store] unknown mutation:", type);
			}
		},

		/**
		 * 订阅状态变更，返回取消订阅函数
		 *
		 * 注意：subscribe 按 mutation type 通知，而非 state key。
		 * - subscribe("INCREMENT", cb)  → 仅在 commit("INCREMENT") 时触发
		 * - subscribe("*", cb)          → 所有 mutation 都会触发
		 *
		 * 如需监听某个 state 属性的变化，请使用 subscribeToState(key, cb)
		 */
		subscribe(key, callback) {
			if (!_listeners[key]) _listeners[key] = [];
			_listeners[key].push(callback);
			return function unsubscribe() {
				_listeners[key] = _listeners[key].filter((cb) => cb !== callback);
			};
		},

		/**
		 * 监听指定 state 属性的变化
		 * 内部通过 subscribe("*") 实现，每次 mutation 后对比 state[key] 并回调
		 * @param {string} key - state 中的属性名
		 * @param {Function} callback - 回调函数，参数为该属性的最新值
		 * @returns {Function} 取消订阅函数
		 */
		subscribeToState(key, callback) {
			return this.subscribe("*", () => {
				callback(state[key]);
			});
		},
	};
}

module.exports = { createStore };
