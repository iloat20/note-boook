// app.js
App({
  onLaunch() {
    // 初始化本地存储
    if (!wx.getStorageSync('noteDates')) {
      wx.setStorageSync('noteDates', [])
    }
  },
  globalData: {
    userInfo: null
  }
})