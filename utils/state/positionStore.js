/**
 * positionStore — 持仓状态管理
 *
 * 基于 createStore 实现，保持与旧版相同的 API：
 *   subscribe(key, callback) → unsubscribe
 *   commit(mutation, payload)
 *   getState(key)
 */

const { createStore } = require("./store");

const positionStore = createStore({
	state: {
		positions: [],
		summary: null,
	},
	mutations: {
		SET_POSITIONS: (state, payload) => {
			state.positions = payload;
		},
		SET_SUMMARY: (state, payload) => {
			state.summary = payload;
		},
	},
});

module.exports = positionStore;
