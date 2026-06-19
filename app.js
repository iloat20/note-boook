// app.js

App({
	onLaunch() {
		this._initSystemInfo();
		this._checkStorageQuota();
		this._pruneStaleData();
	},

	_initSystemInfo() {
		try {
			const windowInfo = wx.getWindowInfo() || {};
			const appBaseInfo = wx.getAppBaseInfo() || {};
			const safeTop = windowInfo.safeArea
				? windowInfo.safeArea.top
				: windowInfo.statusBarHeight;
			const safeBottom = windowInfo.safeArea
				? windowInfo.screenHeight - windowInfo.safeArea.bottom
				: 0;

			const platform = (appBaseInfo.platform || "").toLowerCase();
			const navBarHeight = platform === "android" ? 48 : 44;

			this.globalData.systemInfo = {
				safeAreaTop: safeTop,
				safeAreaBottom: safeBottom,
				statusBarHeight: windowInfo.statusBarHeight,
				navBarHeight: navBarHeight,
				platform: platform,
				screenWidth: windowInfo.screenWidth,
				screenHeight: windowInfo.screenHeight,
				fontSizeSetting: appBaseInfo.fontSizeSetting || 0,
			};

			const level = appBaseInfo.fontSizeSetting || 0;
			const scale =
				level <= 1 ? 1 : level === 2 ? 1.1 : level === 3 ? 1.2 : 1.3;
			this.globalData.fontScale = Math.min(scale, 1.3);
		} catch (e) {
			console.warn("[App] System info detection failed:", e);
		}
	},

	getNavBarInfo() {
		const info = this.globalData.systemInfo || {};
		return {
			statusBarHeight: info.statusBarHeight || 20,
			navBarHeight: info.navBarHeight || 44,
		};
	},

	/**
	 * 检查存储空间使用情况，超过 90% 预警
	 */
	_checkStorageQuota() {
		try {
			const info = wx.getStorageInfoSync();
			if (!info || typeof info.currentSize !== "number") return;

			const currentMB = (info.currentSize / 1024).toFixed(1);
			const limitMB = info.limitSize
				? (info.limitSize / 1024).toFixed(1)
				: "未知";
			const pct =
				info.limitSize > 0
					? ((info.currentSize / info.limitSize) * 100).toFixed(1)
					: null;

			if (pct !== null && parseFloat(pct) > 90) {
				console.warn(
					"[App] 存储空间预警：已使用 " +
						currentMB +
						"MB / " +
						limitMB +
						"MB (" +
						pct +
						"%)",
				);
				wx.showToast({
					title: "存储空间不足 (" + pct + "%)",
					icon: "none",
					duration: 3000,
				});
			}
		} catch (e) {
			console.warn("[App] 存储空间检查失败:", e);
		}
	},

	/**
	 * 启动时清理过期缓存数据
	 */
	_pruneStaleData() {
		try {
			const PriceCache = require("./utils/models/priceCache");
			const count = PriceCache.pruneExpired();
			if (count > 0) {
				console.log("[App] 清理了 " + count + " 条过期价格缓存");
			}
		} catch (e) {
			console.warn("[App] 过期数据清理失败:", e);
		}
	},

	globalData: {
		userInfo: null,
		systemInfo: null,
		fontScale: 1,
	},
});
