const { MARKETS, getPositionSummary, getTotalStats, PriceCache } = require('../../utils/storage.js')
const { fmt } = require('../../utils/format.js')
const { getMarketLabel, getMarketColor } = require('../../utils/market.js')
const { fetchStockPrice } = require('../../utils/stockPrice.js')

Page({
  data: {
    currentDate: '',
    currentMarket: null,
    sliderLeft: 0,
    sliderWidth: 0,
    marketTabs: [
      { key: null, label: '全部', count: 0 },
      { key: MARKETS.A_SHARE, label: 'A股', count: 0 },
      { key: MARKETS.HK_SHARE, label: '港股', count: 0 },
      { key: MARKETS.US_SHARE, label: '美股', count: 0 }
    ],
    positions: [],
    totalMarketValue: 0,
    totalMarketValueText: '0.00',
    totalPnL: 0,
    totalPnLText: '0.00',
    totalPnLPercent: 0
  },

  onLoad() {
    this.updateDate()
    this.loadData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    const app = getApp()
    if (app.globalData.dataDirty) {
      this.loadData()
      this.calculateSliderPosition()
      app.globalData.dataDirty = false
    }

    // 自动获取缺失现价的股票行情
    const positions = this.data.positions
    if (positions.length > 0 && positions.some(p => !p.currentPrice)) {
      this.fetchPrices()
    }
  },

  updateDate() {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ currentDate: date })
  },

  loadData() {
    const positions = getPositionSummary(this.data.currentMarket)
    
    let totalMarketValue = 0
    let totalCost = 0
    
    positions.forEach(p => {
      if (p.currentPrice && p.quantity > 0) {
        totalMarketValue += p.currentPrice * p.quantity
      }
      totalCost += p.avgCost * p.quantity
    })
    
    const stats = getTotalStats()
    const floatingPnL = totalMarketValue - totalCost
    const totalPnL = stats.realizedPnL + floatingPnL + stats.dividendIncome
    const totalInvestment = totalCost + stats.totalBuyFee
    
    const formattedPositions = positions.map(p => {
      const pnlPercent = p.quantity > 0 && p.avgCost > 0 
        ? ((p.floatingPnL / (p.avgCost * p.quantity)) * 100).toFixed(2) 
        : '0.00'
      return {
        ...p,
        avgCostText: fmt(p.avgCost),
        currentPriceText: p.currentPrice ? fmt(p.currentPrice) : '--',
        floatingPnLText: fmt(p.floatingPnL),
        pnlPercentText: pnlPercent,
        marketLabel: getMarketLabel(p.market),
        marketColor: getMarketColor(p.market),
        parallaxStyle: 'translateZ(0rpx)'
      }
    })
    
    this.setData({
      positions: formattedPositions,
      totalMarketValue: parseFloat(totalMarketValue.toFixed(2)),
      totalMarketValueText: fmt(totalMarketValue),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalPnLText: fmt(totalPnL),
      totalPnLPercent: totalInvestment > 0 ? parseFloat((totalPnL / totalInvestment * 100).toFixed(2)) : 0
    })
    
    this.updateMarketTabs()
    this.calculateSliderPosition()
  },

  updateMarketTabs() {
    const allPositions = getPositionSummary()
    const tabs = this.data.marketTabs.map(tab => ({
      ...tab,
      count: tab.key 
        ? allPositions.filter(p => p.market === tab.key).length 
        : allPositions.length
    }))
    this.setData({ marketTabs: tabs })
  },

  switchMarket(e) {
    const market = e.currentTarget.dataset.market
    this.setData({ currentMarket: market === 'null' ? null : market })
    this.loadData()
  },

  calculateSliderPosition() {
    const systemInfo = getApp().globalData.systemInfo || wx.getSystemInfoSync()
    const screenWidth = systemInfo.windowWidth
    const tabs = this.data.marketTabs
    const tabCount = tabs.length
    const tabWidth = (screenWidth - 40) / tabCount
    const activeIndex = tabs.findIndex(t => {
      if (this.data.currentMarket === null) return t.key === null
      return t.key === this.data.currentMarket
    })
    const left = activeIndex >= 0 ? activeIndex * tabWidth : 0
    this.setData({
      sliderLeft: left,
      sliderWidth: tabWidth
    })
  },

  onScroll(e) {
    if (this._parallaxRaf) return
    const scrollTop = e.detail.scrollTop
    this._parallaxRaf = true
    requestAnimationFrame(() => {
      this.updateParallax(scrollTop)
      this._parallaxRaf = false
    })
  },

  updateParallax(scrollTop) {
    const query = this.createSelectorQuery()
    query.select('.parallax-container').boundingClientRect()
    query.selectAll('.parallax-card').boundingClientRect()
    query.exec((res) => {
      if (!res || !res[0] || !res[1]) return
      const containerRect = res[0]
      const cardRects = res[1]
      const viewportCenter = containerRect.top + containerRect.height / 2
      const maxOffset = 10

      const positions = this.data.positions.map((item, index) => {
        if (index >= cardRects.length) {
          return { ...item, parallaxStyle: 'translateZ(0rpx)' }
        }
        const cardRect = cardRects[index]
        const cardCenter = cardRect.top + cardRect.height / 2
        const distanceFromCenter = (cardCenter - viewportCenter) / (containerRect.height / 2)
        const clampedDistance = Math.max(-1, Math.min(1, distanceFromCenter))
        const translateZ = Math.round((1 - Math.abs(clampedDistance)) * maxOffset * 10) / 10
        return {
          ...item,
          parallaxStyle: `translateZ(${translateZ}rpx)`
        }
      })

      this.setData({ positions })
    })
  },

  updatePrice(e) {
    const stockId = parseInt(e.currentTarget.dataset.stockId)
    const price = parseFloat(e.detail.value)
    
    if (!isNaN(price) && price > 0) {
      PriceCache.set(stockId, price)
    }
    
    this.loadData()
  },

  goToDetail(e) {
    const stockId = e.currentTarget.dataset.stockId
    wx.navigateTo({
      url: `/pages/detail/detail?stockId=${stockId}`
    })
  },

  goToAddTransaction() {
    wx.navigateTo({
      url: '/pages/record/record'
    })
  },

  fetchPrices() {
    const positions = this.data.positions
    if (!positions || positions.length === 0) return

    wx.showLoading({ title: '获取行情中...' })

    const promises = positions.map(pos => {
      return fetchStockPrice(pos.market, pos.code)
        .then(priceData => {
          if (priceData && priceData.currentPrice > 0) {
            PriceCache.set(pos.id, priceData.currentPrice)
          }
        })
        .catch(() => {
          // 获取失败，使用缓存的价格
        })
    })

    Promise.all(promises).then(() => {
      wx.hideLoading()
      this.loadData()
      wx.showToast({ title: '行情已更新', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      this.loadData()
    })
  },

  onRefreshPrice(e) {
    const stockId = e.currentTarget.dataset.stockId
    const position = this.data.positions.find(p => p.id === stockId)
    if (!position) return

    wx.showLoading({ title: '获取行情中...' })

    fetchStockPrice(position.market, position.code)
      .then(priceData => {
        if (priceData && priceData.currentPrice > 0) {
          PriceCache.set(stockId, priceData.currentPrice)
          this.loadData()
          wx.hideLoading()
          wx.showToast({ title: '行情已更新', icon: 'success' })
        } else {
          wx.hideLoading()
          wx.showToast({ title: '获取失败', icon: 'none' })
        }
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '获取失败', icon: 'none' })
      })
  },

  // ========== 左滑菜单触摸事件 ==========
  onTouchStart(e) {
    var t = e.touches[0]
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    this._swiping = null
  },

  onTouchMove(e) {
    if (this._swiping === false) return
    var t = e.touches[0]
    var dx = t.clientX - this._touchStartX
    var dy = t.clientY - this._touchStartY
    // 判断是否为横向滑动
    if (this._swiping === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      this._swiping = Math.abs(dx) > Math.abs(dy)
      if (!this._swiping) return
    }
    // 只允许左滑
    if (dx > 0) return
    var index = e.currentTarget.dataset.index
    var positions = this.data.positions
    if (!positions[index]) return
    var offset = Math.max(-180, dx)
    this.setData({
      ['positions[' + index + '].swipeOffset']: offset
    })
  },

  onTouchEnd(e) {
    if (this._swiping !== true) return
    var index = e.currentTarget.dataset.index
    var positions = this.data.positions
    if (!positions[index]) return
    var offset = positions[index].swipeOffset || 0
    // 滑过一半则展开菜单，否则收回
    var newOffset = offset < -40 ? -180 : 0
    this.setData({
      ['positions[' + index + '].swipeOffset']: newOffset
    })
    // 关闭其他已打开的菜单
    positions.forEach(function (p, i) {
      if (i !== index && p.swipeOffset && p.swipeOffset !== 0) {
        positions[i].swipeOffset = 0
      }
    })
    this.setData({ positions: positions })
  },

  onSwipeEdit(e) {
    var stockId = e.currentTarget.dataset.stockId
    // 找到该股票的第一笔交易记录进行编辑
    var transactions = Transaction.getAll().filter(function (t) { return t.stockId === stockId })
    if (transactions.length > 0) {
      wx.navigateTo({ url: '/pages/record/record?id=' + transactions[0].id })
    }
  },

  onSwipeSell(e) {
    var item = e.currentTarget.dataset.item
    wx.navigateTo({ url: '/pages/record/record?stockId=' + item.id + '&type=SELL' })
  },

  onSwipeDelete(e) {
    var stockId = e.currentTarget.dataset.stockId
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '将删除该股票的所有交易记录和分红记录，是否确认？',
      success: function (res) {
        if (res.confirm) {
          var transactions = Transaction.getAll().filter(function (t) { return t.stockId === stockId })
          transactions.forEach(function (t) { Transaction.delete(t.id) })
          var dividends = Dividend.getAll().filter(function (d) { return d.stockId === stockId })
          dividends.forEach(function (d) { Dividend.delete(d.id) })
          wx.showToast({ title: '删除成功', icon: 'success' })
          that.loadData()
        }
      }
    })
  }
})


