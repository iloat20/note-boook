const { MARKETS, Stock, Transaction, Dividend, Strategy } = require('../../utils/storage.js')
const { fmt, fmtDate, fmtTime } = require('../../utils/format.js')
const { getMarketLabel, getMarketColor } = require('../../utils/market.js')

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    currentFilter: 'ALL',
    currentMarket: null,
    currentStrategy: null,
    activeStrategies: [],
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
    allGroupedHistory: [],  // 存储所有分组数据
    displayCount: 10,  // 初始显示 10 天
    loadingMore: false,
    hasMore: true,
    sliderLeft: 0,
    sliderWidth: 0,
    dissolvingId: null,
    searchKeyword: '',
    // 缓存相关
    cacheTimestamp: 0,
    isFromCache: false
  },

  onLoad() {
    this.setData(getApp().getNavBarInfo())
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

  // 构建全部记录并缓存，仅在数据变更时调用
  _buildAllRecords() {
    const transactions = Transaction.getAll()
    const dividends = Dividend.getAll()
    const stocks = Stock.getAll()

    const stockMap = new Map()
    stocks.forEach(s => stockMap.set(s.id, s))

    const allRecords = []

    transactions.forEach(t => {
      const stock = stockMap.get(t.stockId)
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
          time: fmtTime(date),
          _sortKey: date.getTime(),
          strategies: t.strategies || [],
          reason: t.reason || '',
          hasJournal: !!(t.reason || (t.strategies && t.strategies.length))
        })
      }
    })

    dividends.forEach(d => {
      const stock = stockMap.get(d.stockId)
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
          time: fmtTime(date),
          _sortKey: date.getTime()
        })
      }
    })

    // 使用预计算的数值排序，避免每次比较都创建 Date 对象
    allRecords.sort((a, b) => b._sortKey - a._sortKey)

    this._cachedAllRecords = allRecords
  },

  // 从缓存数据中筛选、分组、显示
  _applyFilters() {
    let filtered = this._cachedAllRecords || []

    if (this.data.currentFilter !== 'ALL') {
      filtered = filtered.filter(r => r.type === this.data.currentFilter)
    }

    if (this.data.currentMarket) {
      filtered = filtered.filter(r => r.market === this.data.currentMarket)
    }

    if (this.data.currentStrategy) {
      filtered = filtered.filter(r => r.strategies && r.strategies.indexOf(this.data.currentStrategy) >= 0)
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

    const displayCount = this.data.displayCount
    const displayData = groupedArray.slice(0, displayCount)
    const hasMore = groupedArray.length > displayCount

    this.setData({
      allGroupedHistory: groupedArray,
      groupedHistory: displayData,
      hasMore: hasMore,
      loadingMore: false,
      isFromCache: false,
      cacheTimestamp: Date.now()
    })

    this.calculateSliderPosition()
  },

  loadHistory() {
    this._buildAllRecords()
    this.setData({ activeStrategies: Strategy.getUsedStrategies() })
    this._applyFilters()
  },

  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ currentFilter: filter })
    this.calculateSliderPosition()
    this._applyFilters()
  },

  switchMarket(e) {
    const market = e.currentTarget.dataset.market
    this.setData({ currentMarket: market === 'null' ? null : market })
    this._applyFilters()
  },

  switchStrategy(e) {
    const strategy = e.currentTarget.dataset.strategy
    this.setData({ currentStrategy: strategy || null })
    this._applyFilters()
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

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this._applyFilters()
  },

  loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return

    const newCount = this.data.displayCount + 10
    const allData = this.data.allGroupedHistory
    const displayData = allData.slice(0, newCount)
    const hasMore = allData.length > newCount

    this.setData({
      displayCount: newCount,
      groupedHistory: displayData,
      hasMore: hasMore,
      loadingMore: false
    })
  },

  onSearchInput(e) {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    const keyword = e.detail.value.toLowerCase()
    this.setData({ searchKeyword: keyword })
    this._searchTimer = setTimeout(() => {
      this._applyFilters()
    }, 300)
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
            wx.navigateTo({ url: `/packageDetail/pages/dividend/dividend?id=${record.id}` })
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
    wx.navigateTo({ url: '/packageDetail/pages/dividend/dividend' })
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._cachedAllRecords = null
  },

  onPullDownRefresh() {
    this.loadHistory()
    wx.stopPullDownRefresh()
  },
})