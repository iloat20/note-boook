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

      const platform = (appBaseInfo.platform || '').toLowerCase()
      const navBarHeight = platform === 'android' ? 48 : 44

      this.globalData.systemInfo = {
        safeAreaTop: safeTop,
        safeAreaBottom: safeBottom,
        statusBarHeight: windowInfo.statusBarHeight,
        navBarHeight: navBarHeight,
        platform: platform,
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

  getNavBarInfo() {
    const info = this.globalData.systemInfo || {}
    return {
      statusBarHeight: info.statusBarHeight || 20,
      navBarHeight: info.navBarHeight || 44
    }
  },

  globalData: {
    userInfo: null,
    systemInfo: null,
    fontScale: 1
  }
})
