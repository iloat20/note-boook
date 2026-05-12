const { MARKETS, Stock, Transaction, Dividend } = require('../../utils/storage.js')
const { fmt, fmtDate, fmtTime } = require('../../utils/format.js')
const { getMarketLabel, getMarketColor } = require('../../utils/market.js')

Page({
  data: {
    currentFilter: 'ALL',
    currentMarket: null,
    filterTabs: [
      { key: 'ALL', label: '全部' },
      { key: 'BUY', label: '买入' },
      { key: 'SELL', label: '卖出' },
      { key: 'DIVIDEND', label: '分红' }
    ],
    marketTabs: [
      { key: null, label: '全部' },
      { key: MARKETS.A_SHARE, label: 'A股' },
      { key: MARKETS.HK_SHARE, label: '港股' },
      { key: MARKETS.US_SHARE, label: '美股' }
    ],
    groupedHistory: [],
    sliderLeft: 0,
    sliderWidth: 0,
    dissolvingId: null,
    showSearchInput: false,
    searchKeyword: ''
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const app = getApp()
    if (app.globalData.dataDirty) {
      this.loadHistory()
      app.globalData.dataDirty = false
    }
  },

  loadHistory() {
    const transactions = Transaction.getAll()
    const dividends = Dividend.getAll()
    const stocks = Stock.getAll()
    
    const allRecords = []
    
    transactions.forEach(t => {
      const stock = stocks.find(s => s.id === t.stockId)
      if (stock) {
        const date = new Date(t.date)
        const amount = t.type === 'BUY' ? -(t.price * t.quantity + t.fee) : t.price * t.quantity - t.fee
        allRecords.push({
          id: t.id,
          type: t.type,
          typeText: t.type === 'BUY' ? '买入' : '卖出',
          stockId: t.stockId,
          market: stock.market,
          marketLabel: getMarketLabel(stock.market),
          marketColor: getMarketColor(stock.market),
          code: stock.code,
          name: stock.name,
          price: t.price,
          priceText: fmt(t.price),
          quantity: t.quantity,
          fee: t.fee,
          feeText: fmt(t.fee),
          amount: amount,
          amountText: fmt(Math.abs(amount)),
          date: fmtDate(date),
          time: fmtTime(date)
        })
      }
    })
    
    dividends.forEach(d => {
      const stock = stocks.find(s => s.id === d.stockId)
      if (stock) {
        const date = new Date(d.date)
        allRecords.push({
          id: d.id,
          type: 'DIVIDEND',
          typeText: '分红',
          stockId: d.stockId,
          market: stock.market,
          marketLabel: getMarketLabel(stock.market),
          marketColor: getMarketColor(stock.market),
          code: stock.code,
          name: stock.name,
          perShareAmount: d.perShareAmount,
          perShareAmountText: fmt(d.perShareAmount),
          quantity: d.quantity,
          amount: d.totalAmount,
          amountText: fmt(d.totalAmount),
          date: fmtDate(date),
          time: fmtTime(date)
        })
      }
    })
    
    allRecords.sort((a, b) => {
      return new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time)
    })
    
    let filtered = allRecords
    
    if (this.data.currentFilter !== 'ALL') {
      filtered = filtered.filter(r => r.type === this.data.currentFilter)
    }
    
    if (this.data.currentMarket) {
      filtered = filtered.filter(r => r.market === this.data.currentMarket)
    }
    
    if (this.data.searchKeyword) {
      const kw = this.data.searchKeyword.toLowerCase()
      filtered = filtered.filter(r => 
        r.code.toLowerCase().includes(kw) || 
        r.name.toLowerCase().includes(kw)
      )
    }
    
    const grouped = {}
    filtered.forEach(r => {
      if (!grouped[r.date]) {
        grouped[r.date] = []
      }
      grouped[r.date].push(r)
    })
    
    const groupedArray = Object.keys(grouped).map(date => ({
      date,
      items: grouped[date]
    }))
    
    this.setData({ groupedHistory: groupedArray })
    this.calculateSliderPosition()
  },

  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ currentFilter: filter })
    this.calculateSliderPosition()
    this.loadHistory()
  },

  switchMarket(e) {
    const market = e.currentTarget.dataset.market
    this.setData({ currentMarket: market === 'null' ? null : market })
    this.loadHistory()
  },

  calculateSliderPosition() {
    const systemInfo = getApp().globalData.systemInfo || wx.getWindowInfo() || {}
    const screenWidth = systemInfo.windowWidth
    const tabs = this.data.filterTabs
    const tabWidth = screenWidth / tabs.length
    const selectedIndex = tabs.findIndex(t => t.key === this.data.currentFilter)
    this.setData({
      sliderWidth: tabWidth,
      sliderLeft: selectedIndex * tabWidth
    })
  },

  showSearch() {
    wx.showToast({ title: '搜索功能开发中', icon: 'none' })
  },

  toggleSearch() {
    const show = !this.data.showSearchInput
    this.setData({ showSearchInput: show, searchKeyword: show ? this.data.searchKeyword : '' })
    if (!show) this.loadHistory()
  },

  onSearchInput(e) {
    const keyword = e.detail.value.toLowerCase()
    this.setData({ searchKeyword: keyword })
    this.loadHistory()
  },

  showActions(e) {
    const record = e.currentTarget.dataset.record
    const actions = [
      { text: '编辑', value: 'edit' },
      { text: '删除', value: 'delete' }
    ]
    
    wx.showActionSheet({
      itemList: actions.map(a => a.text),
      success: (res) => {
        const action = actions[res.tapIndex]
        if (action.value === 'edit') {
          if (record.type === 'DIVIDEND') {
            wx.navigateTo({ url: `/pages/dividend/dividend?id=${record.id}` })
          } else {
            wx.navigateTo({ url: `/pages/record/record?id=${record.id}` })
          }
        } else if (action.value === 'delete') {
          wx.showModal({
            title: '确认删除',
            content: `确定要删除这笔${record.typeText}记录吗？`,
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.setData({ dissolvingId: record.id })
                setTimeout(() => {
                  if (record.type === 'DIVIDEND') {
                    Dividend.delete(record.id)
                  } else {
                    Transaction.delete(record.id)
                  }
                  wx.showToast({ title: '删除成功', icon: 'success' })
                  this.loadHistory()
                }, 400)
              }
            }
          })
        }
      }
    })
  },

  goToRecord() {
    wx.navigateTo({ url: '/pages/record/record' })
  },

  goToDividend() {
    wx.navigateTo({ url: '/pages/dividend/dividend' })
  }
})