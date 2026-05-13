const { MARKETS, getPositionSummary, getTotalStats, PriceCache, Transaction, Dividend } = require('../../utils/storage.js')
const { fmt } = require('../../utils/format.js')
const { getMarketLabel, getMarketColor } = require('../../utils/market.js')
const { fetchStockPrice } = require('../../utils/stockPrice.js')

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    currentDate: '',
    currentMarket: null,
    sliderLeft: 0,
    sliderWidth: 0,
    loading: true,
    animating: false,
    displayValues: {
      totalMarketValue: '0.00',
      totalPnL: '0.00',
      totalPnLPercent: '0.00'
    },
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
    this.setData(getApp().getNavBarInfo())
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
      app.globalData.dataDirty = false
    }

    // 自动获取缺失现价的股票行情
    const positions = this.data.positions
    if (positions.length > 0 && positions.some(p => !p.currentPrice)) {
      this.fetchPrices()
    }
  },

  onUnload() {
    if (this._animTimer) clearTimeout(this._animTimer)
  },

  onPullDownRefresh() {
    this.loadData()
    this.fetchPrices()
    wx.stopPullDownRefresh()
  },

  updateDate() {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ currentDate: date })
  },

  loadData() {
    try {
    // 一次性计算所有持仓（无筛选），避免 updateMarketTabs 重复计算
    const allPositions = getPositionSummary()
    const positions = this.data.currentMarket
      ? allPositions.filter(p => p.market === this.data.currentMarket)
      : allPositions

    let totalMarketValue = 0
    let totalCost = 0
    let totalRealizedPnL = 0
    let totalFloatingPnL = 0
    let totalDividendIncome = 0
    let totalBuyFee = 0

    allPositions.forEach(p => {
      totalRealizedPnL += p.realizedPnL
      totalFloatingPnL += p.floatingPnL
      totalDividendIncome += p.dividendIncome
    })

    positions.forEach(p => {
      if (p.currentPrice && p.quantity > 0) {
        totalMarketValue += p.currentPrice * p.quantity
      }
      totalCost += p.avgCost * p.quantity
      totalBuyFee += p.totalBuyFee || 0
    })

    const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome
    const totalInvestment = totalCost + totalBuyFee

    const formattedPositions = positions.map(p => {
      const pnlPercent = p.quantity > 0 && p.avgCost > 0
        ? ((p.floatingPnL / (p.avgCost * p.quantity)) * 100).toFixed(2)
        : '0.00'
      return {
        ...p,
        quantityText: fmt(p.quantity),
        avgCostText: fmt(p.avgCost),
        currentPriceText: p.currentPrice ? fmt(p.currentPrice) : '--',
        floatingPnLText: fmt(p.floatingPnL),
        pnlPercentText: pnlPercent,
        marketLabel: getMarketLabel(p.market),
        marketColor: getMarketColor(p.market)
      }
    })

    this.setData({
      positions: formattedPositions,
      totalMarketValue: parseFloat(totalMarketValue.toFixed(2)),
      totalMarketValueText: fmt(totalMarketValue),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalPnLText: fmt(totalPnL),
      totalPnLPercent: totalInvestment > 0 ? parseFloat((totalPnL / totalInvestment * 100).toFixed(2)) : 0,
      loading: false
    })

    // 批量数字滚动动画：3个值共享一个动画循环，每帧只调用一次 setData
    this._animateAllValues({
      totalMarketValue: totalMarketValue,
      totalPnL: totalPnL,
      totalPnLPercent: totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0
    })

    // 直接使用已计算的 allPositions 更新 tab 计数
    const tabs = this.data.marketTabs.map(tab => ({
      ...tab,
      count: tab.key
        ? allPositions.filter(p => p.market === tab.key).length
        : allPositions.length
    }))
    this.setData({ marketTabs: tabs })
    this.calculateSliderPosition()
    } catch (e) {
      console.error('[Index] loadData error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 批量数字滚动动画：所有目标值共享一个动画循环，每帧只调用一次 setData
  _animateAllValues(targets, duration = 800) {
    const startValues = {}
    const keys = Object.keys(targets)
    keys.forEach(k => { startValues[k] = parseFloat(this.data.displayValues[k]) || 0 })
    const startTime = Date.now()

    if (this._animTimer) clearTimeout(this._animTimer)

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const updates = {}
      keys.forEach(k => {
        const current = startValues[k] + (targets[k] - startValues[k]) * eased
        updates[`displayValues.${k}`] = fmt(parseFloat(current.toFixed(2)))
      })
      this.setData(updates)
      if (progress < 1) {
        this._animTimer = setTimeout(animate, 33)
      } else {
        this._animTimer = null
      }
    }
    animate()
  },

  switchMarket(e) {
    const market = e.currentTarget.dataset.market
    this.setData({ currentMarket: market === 'null' ? null : market })
    this.loadData()
  },

  calculateSliderPosition() {
    const systemInfo = getApp().globalData.systemInfo || wx.getWindowInfo() || {}
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
      url: `/packageDetail/pages/detail/detail?stockId=${stockId}`
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
        .catch(err => {
          console.warn('[Index] 获取行情失败:', pos.code, err.message)
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
    var newOffset = offset < -40 ? -180 : 0
    // 单次 setData 更新所有变化的 swipeOffset
    var updates = {}
    positions.forEach(function (p, i) {
      var target = i === index ? newOffset : 0
      if ((p.swipeOffset || 0) !== target) {
        updates['positions[' + i + '].swipeOffset'] = target
      }
    })
    if (Object.keys(updates).length > 0) this.setData(updates)
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
          Transaction.deleteByStockId(stockId)
          Dividend.deleteByStockId(stockId)
          wx.showToast({ title: '删除成功', icon: 'success' })
          that.loadData()
        }
      }
    })
  }
})


