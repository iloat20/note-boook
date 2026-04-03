// pages/index/index.js
Page({
  data: {
    dates: [],
    today: ''
  },
  
  onLoad() {
    this.setData({
      today: new Date().toISOString().split('T')[0]
    })
    this.loadDates()
  },
  
  loadDates() {
    const savedDates = wx.getStorageSync('noteDates') || []
    this.setData({
      dates: savedDates
    })
  },
  
  navigateToChat(e) {
    const date = e.currentTarget.dataset.date
    wx.navigateTo({
      url: `/pages/chat/chat?date=${date}`
    })
  },
  
  formatDate(dateString) {
    const date = new Date(dateString)
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
  }
})