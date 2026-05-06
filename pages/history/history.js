const { MARKETS, Stock, Transaction, Dividend } = require('../../utils/storage.js')

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
    dissolvingId: null
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadHistory()
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
          marketLabel: this.getMarketLabel(stock.market),
          marketColor: this.getMarketColor(stock.market),
          code: stock.code,
          name: stock.name,
          price: t.price,
          priceText: this.fmt(t.price),
          quantity: t.quantity,
          fee: t.fee,
          feeText: this.fmt(t.fee),
          amount: amount,
          amountText: this.fmt(Math.abs(amount)),
          date: this.formatDate(date),
          time: this.formatTime(date)
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
          marketLabel: this.getMarketLabel(stock.market),
          marketColor: this.getMarketColor(stock.market),
          code: stock.code,
          name: stock.name,
          perShareAmount: d.perShareAmount,
          perShareAmountText: this.fmt(d.perShareAmount),
          quantity: d.quantity,
          amount: d.totalAmount,
          amountText: this.fmt(d.totalAmount),
          date: this.formatDate(date),
          time: this.formatTime(date)
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

  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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
    const systemInfo = wx.getSystemInfoSync()
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
  },

  getMarketLabel(market) {
    const labels = {
      [MARKETS.A_SHARE]: 'A股',
      [MARKETS.HK_SHARE]: '港股',
      [MARKETS.US_SHARE]: '美股'
    }
    return labels[market] || ''
  },

  getMarketColor(market) {
    const colors = {
      [MARKETS.A_SHARE]: '#3B82F6',
      [MARKETS.HK_SHARE]: '#F97316',
      [MARKETS.US_SHARE]: '#A855F7'
    }
    return colors[market] || '#64748B'
  },

  fmt(num) {
    if (isNaN(num)) return '0.00'
    return Math.abs(parseFloat(num)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
})
