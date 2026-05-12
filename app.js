// app.js

App({
  onLaunch() {
    this._initSystemInfo()
  },

  _initSystemInfo() {
    try {
      const windowInfo = wx.getWindowInfo() || {}
      const appBaseInfo = wx.getAppBaseInfo() || {}
      const safeTop = windowInfo.safeArea ? windowInfo.safeArea.top : windowInfo.statusBarHeight
      const safeBottom = windowInfo.safeArea 
        ? windowInfo.screenHeight - windowInfo.safeArea.bottom 
        : 0

      this.globalData.systemInfo = {
        safeAreaTop: safeTop,
        safeAreaBottom: safeBottom,
        statusBarHeight: windowInfo.statusBarHeight,
        screenWidth: windowInfo.screenWidth,
        screenHeight: windowInfo.screenHeight,
        fontSizeSetting: appBaseInfo.fontSizeSetting || 0
      }

      const level = appBaseInfo.fontSizeSetting || 0
      const scale = level <= 1 ? 1 : level === 2 ? 1.1 : level === 3 ? 1.2 : 1.3
      this.globalData.fontScale = Math.min(scale, 1.3)
    } catch (e) {
      console.warn('[App] System info detection failed:', e)
    }
  },

  globalData: {
    userInfo: null,
    systemInfo: null,
    fontScale: 1,
    dataDirty: true
  }
})
