const { MARKETS, getPositionSummary, getTotalStats, PriceCache } = require('../../utils/storage.js')

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
    this.loadData()
    this.calculateSliderPosition()
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
        avgCostText: this.fmt(p.avgCost),
        floatingPnLText: this.fmt(p.floatingPnL),
        pnlPercentText: pnlPercent,
        marketLabel: this.getMarketLabel(p.market),
        marketColor: this.getMarketColor(p.market),
        parallaxStyle: 'translateZ(0rpx)'
      }
    })
    
    this.setData({
      positions: formattedPositions,
      totalMarketValue: parseFloat(totalMarketValue.toFixed(2)),
      totalMarketValueText: this.fmt(totalMarketValue),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalPnLText: this.fmt(totalPnL),
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
    const systemInfo = wx.getSystemInfoSync()
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
    const scrollTop = e.detail.scrollTop
    this.updateParallax(scrollTop)
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
    return parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
})
