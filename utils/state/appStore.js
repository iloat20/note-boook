/**
 * appStore — 应用级状态
 *
 * 替代 app.globalData.dataDirty，统一管理数据过期标记。
 * 当 models 中的 CRUD 操作发生时，cacheManager.markDataDirty()
 * 提交 MARK_DIRTY mutation，页面 onShow 时检查并消费。
 */

const { createStore } = require("./store");

const appStore = createStore({
	state: {
		/** 是否有数据变更需要页面重新加载 */
		dataDirty: false,
	},
	mutations: {
		MARK_DIRTY: (state) => {
			state.dataDirty = true;
		},
		MARK_CLEAN: (state) => {
			state.dataDirty = false;
		},
	},
});

module.exports = appStore;
