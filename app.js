// app.js

App({
  onLaunch() {
    this._initSystemInfo()
  },

  _initSystemInfo() {
    try {
      const info = wx.getSystemInfoSync()
      const safeTop = info.safeArea ? info.safeArea.top : info.statusBarHeight
      const safeBottom = info.safeArea 
        ? info.screenHeight - info.safeArea.bottom 
        : 0

      this.globalData.systemInfo = {
        safeAreaTop: safeTop,
        safeAreaBottom: safeBottom,
        statusBarHeight: info.statusBarHeight,
        screenWidth: info.screenWidth,
        screenHeight: info.screenHeight,
        fontSizeSetting: info.fontSizeSetting || 0
      }

      const level = info.fontSizeSetting || 0
      const scale = level <= 1 ? 1 : level === 2 ? 1.1 : level === 3 ? 1.2 : 1.3
      this.globalData.fontScale = Math.min(scale, 1.3)
    } catch (e) {
      console.warn('[App] System info detection failed:', e)
    }
  },

  globalData: {
    userInfo: null,
    systemInfo: null,
    fontScale: 1
  }
})
