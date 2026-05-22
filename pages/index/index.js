/**
 * 持仓页（重构版 - 使用新架构）
 * 使用 positionService + positionStore + pageMixin
 * 数据变更通过 appStore.dataDirty 驱动页面刷新
 */

const positionService = require('../../utils/services/positionService')
const positionStore = require('../../utils/state/positionStore')
const pageMixin = require('../../utils/ui/pageMixin')
const touchGestureMixin = require('../../utils/ui/touchGestureMixin')
const { animateAllValues } = require('../../utils/ui/animationHelper')
const { sharePortfolio } = require('../../utils/render/shareHelper')
const { fmt, fmtDate } = require('../../utils/helpers/format')
const { calcFloatingPercent } = require('../../utils/helpers/positionCalculator')
const { getMarketLabel, getMarketColor } = require('../../utils/constants/market')
const { fetchStockPrice, fetchAllPrices } = require('../../utils/services/stockPrice')
const { MARKETS } = require('../../utils/constants/index')
const { Stock, Transaction, Dividend, PriceCache } = require('../../utils/models/index')
const { toast, success, loading, hideLoading, catchError } = require('../../utils/ui/feedback')

// 判断是否在交易时段（任意市场）
function isTradingTime() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  
  const t = now.getHours() * 60 + now.getMinutes()
  // A股+港股：9:30-12:00 / 13:00-16:00
  const inAHK = (t >= 570 && t < 720) || (t >= 780 && t < 960)
  // 美股：21:30-次日5:00
  const inUS = t >= 1290 || t < 300
  return inAHK || inUS
}

Page({ ...touchGestureMixin,
  // ========== 页面数据 ==========
  data: {
    ...pageMixin.initPageData(),
    
    // 日期
    currentDate: '',
    
    // 市场切换
    currentMarket: null,
    sliderLeft: 0,
    sliderWidth: 0,
    marketTabs: [
      { key: null, label: '全部', count: 0 },
      { key: MARKETS.A_SHARE, label: 'A股', count: 0 },
      { key: MARKETS.HK_SHARE, label: '港股', count: 0 },
      { key: MARKETS.US_SHARE, label: '美股', count: 0 }
    ],
    
    // 持仓数据
    positions: [],
    totalMarketValue: 0,
    totalMarketValueText: '0.00',
    totalPnL: 0,
    totalPnLText: '0.00',
    totalPnLPercent: 0,
    
    // 显示值（用于动画）
    displayValues: {
      totalMarketValue: '0.00',
      totalPnL: '0.00',
      totalPnLPercent: '0.00'
    },
    
    // 虚拟列表高度
    scrollHeight: 400,
    
    // 加载状态（初始 false，_loadData 开始时会设为 true）
    loading: false,
    animating: false,
    
    showQuickRecord: false
  },
  
  // ========== 生命周期 ==========
  async onLoad() {
    // 使用 mixin 初始化
    pageMixin.onLoadMixin(this)

    // 更新日期
    this.updateDate()

    // 计算虚拟列表高度
    const systemInfo = getApp().globalData.systemInfo || wx.getWindowInfo() || {}
    const windowHeight = systemInfo.windowHeight || 667
    const statusBarHeight = this.data.statusBarHeight || systemInfo.statusBarHeight || 44
    const fixedHeight = statusBarHeight + 180
    const scrollHeight = windowHeight - fixedHeight
    this.setData({ scrollHeight: Math.max(scrollHeight, 300) })

    // 订阅状态变化
    this._unsubscribePositions = positionStore.subscribe('positions', (newPositions) => {
      this.setData({ positions: newPositions })
    })

    // 等待数据加载完成后再获取现价
    await this._loadData()

    // 刚进入页面获取一次现价
    this._fetchPrices()
  },
  
  onShow() {
    // 使用 mixin 处理通用逻辑
    pageMixin.onShowMixin(this, 0, this._loadData)
    
    // 每次进入持仓自动获取现价（仅交易时段）
    if (isTradingTime()) {
      const positions = this.data.positions
      if (positions.length > 0) {
        this._fetchPrices()
      }
    }
  },
  
  onUnload() {
    // 清理定时器
    if (this._animTimer) clearTimeout(this._animTimer)
    
    // 取消状态订阅
    if (this._unsubscribePositions) {
      this._unsubscribePositions()
    }
    
    // (eventBus 监听已移除 — 改用 appStore + positionStore)
  },
  
  onPullDownRefresh() {
    this._loadData(true)
    this._fetchPrices()
    wx.stopPullDownRefresh()
  },
  
  // ========== 数据加载 ==========
  async _loadData(forceRefresh = false) {
    if (this.data.loading) return

    try {
      this.setData({ loading: true })

      // 使用 positionService 获取数据（已封装缓存逻辑）
      // 注意：getAllPositions 内部使用同步 storage 操作，无需 Promise
      let positions = positionService.getAllPositions(forceRefresh)

      // 更新 Store（会触发订阅回调）
      positionStore.commit('SET_POSITIONS', positions)
      
      // 计算显示数据
      let totalMarketValue = 0
      let totalCost = 0
      let totalRealizedPnL = 0
      let totalFloatingPnL = 0
      let totalDividendIncome = 0
      let totalBuyFee = 0
      let totalInvestment = 0
      
      // 计算总市值、总成本、总盈亏
      const portfolioPositions = positions.filter(p => p.quantity > 0)
      
      portfolioPositions.forEach(p => {
        totalRealizedPnL += p.realizedPnL || 0
        totalFloatingPnL += p.floatingPnL || 0
        totalDividendIncome += p.dividendIncome || 0
      })
      
      positions.forEach(p => {
        if (p.currentPrice && p.quantity > 0) {
          totalMarketValue += p.currentPrice * p.quantity
        }
        totalCost += p.avgCost * p.quantity
        totalBuyFee += p.totalBuyFee || 0
      })
      
      // 计算总投资（买入金额 + 费用）
      const allTransactions = Transaction.getAll()
      const portfolioStockIds = new Set(portfolioPositions.map(p => p.id))
      
      allTransactions.forEach(t => {
        if (portfolioStockIds.has(t.stockId) && t.type === 'BUY') {
          totalInvestment += t.price * t.quantity + t.fee
        }
      })
      
      if (totalInvestment <= 0) totalInvestment = totalCost + totalBuyFee
      
      const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome
      
      // 格式化持仓数据
      const oldPositions = this.data.positions || []
      const oldPriceMap = {}
      oldPositions.forEach(function (op) { oldPriceMap[op.id] = op.currentPrice })

      const formattedPositions = positions.map(p => {
        const pnlPercent = calcFloatingPercent(p)
        const oldPrice = oldPriceMap[p.id]
        let priceFlashClass = ''
        // 价格变高 → 红色闪光；变低 → 绿色闪光
        if (oldPrice && p.currentPrice && oldPrice !== p.currentPrice) {
          priceFlashClass = p.currentPrice > oldPrice ? 'price-flash-profit' : 'price-flash-loss'
        }

        return {
          ...p,
          quantityText: fmt(p.quantity),
          avgCostText: fmt(p.avgCost),
          currentPriceText: p.currentPrice ? fmt(p.currentPrice) : '--',
          floatingPnLText: fmt(p.floatingPnL),
          pnlPercentText: pnlPercent,
          marketLabel: getMarketLabel(p.market),
          marketColor: getMarketColor(p.market),
          priceFlashClass: priceFlashClass
        }
      })

      // 清除 priceFlashClass（600ms 动画结束后）
      if (formattedPositions.some(function (p) { return p.priceFlashClass })) {
        setTimeout(function () {
          const cleared = formattedPositions.map(function (p) {
            return { ...p, priceFlashClass: '' }
          })
          this.setData({ positions: cleared })
        }.bind(this), 650)
      }
      
      // 筛选当前市场
      const filteredPositions = this.data.currentMarket
        ? formattedPositions.filter(p => p.market === this.data.currentMarket)
        : formattedPositions
      
      this.setData({
        positions: filteredPositions,
        totalMarketValue: parseFloat(totalMarketValue.toFixed(2)),
        totalMarketValueText: fmt(totalMarketValue),
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        totalPnLText: fmt(totalPnL),
        totalPnLPercent: totalInvestment > 0 ? parseFloat((totalPnL / totalInvestment * 100).toFixed(2)) : 0,
        loading: false
      })
      
      // 批量数字滚动动画
      animateAllValues(this, {
        totalMarketValue: totalMarketValue,
        totalPnL: totalPnL,
        totalPnLPercent: totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0
      })
      
      // 更新市场 tab 计数
      this._updateMarketTabs(positions)
      
      } catch (err) {
        console.error('[Index] loadData error:', err)
        this.setData({ loading: false })
        catchError(err, '加载失败')
      }
  },
  
  // 更新市场 tab 计数
  _updateMarketTabs(positions) {
    const tabs = this.data.marketTabs.map(tab => ({
      ...tab,
      count: tab.key
        ? positions.filter(p => p.market === tab.key).length
        : positions.length
    }))
    
    this.setData({ marketTabs: tabs })
  },

  
  // 更新日期
  updateDate() {
    const now = new Date()
    const date = fmtDate(now)
    this.setData({ currentDate: date })
  },
  
  // ========== 用户交互 ==========
  // 切换市场（由 liquid-slider 组件触发）
  onMarketTabChange(e) {
    const key = e.detail.key
    this.setData({ currentMarket: key })
    this._loadData()
  },
  
  // 更新价格
  updatePrice(e) {
    const stockId = parseInt(e.currentTarget.dataset.stockId)
    const price = parseFloat(e.detail.value)
    
    if (!isNaN(price) && price > 0) {
      PriceCache.set(stockId, price)
    }
    
    this._loadData()
  },
  
  // 跳转到详情
  goToDetail(e) {
    const stockId = e.currentTarget.dataset.stockId
    wx.navigateTo({
      url: `/packageDetail/pages/detail/detail?stockId=${stockId}`
    })
  },
  
  // 跳转到添加交易
  goToAddTransaction() {
    if (this._longPressFired) { this._longPressFired = false; return }
    wx.navigateTo({
      url: '/packageRecord/pages/record/record'
    })
  },
  
  // ========== 快捷记录 ==========
  onQuickRecord() {
    this._longPressFired = true
    try { wx.vibrateShort({ type: 'medium' }) } catch (e) {}
    this.setData({ showQuickRecord: true })
  },

  onQuickRecordClose() {
    this.setData({ showQuickRecord: false })
  },

  onQuickRecordSubmit() {
    this.setData({ showQuickRecord: false })
    this._loadData()
    // 自动刷新行情，更新现价
    this._fetchPrices()
  },
  
  // ========== 获取行情 ==========
  async _fetchPrices() {
    const positions = this.data.positions
    if (!positions || positions.length === 0) return

    // 跳过 TTL 未过期的股票，只请求需要更新的
    const needFetch = positions.filter(p => !PriceCache.has(p.id))
    if (needFetch.length === 0) {
      wx.showToast({ title: '行情已是最新', icon: 'none' })
      return
    }

    wx.showLoading({ title: '获取行情中...' })

    try {
      const results = await fetchAllPrices(needFetch)
      const validResults = results.filter(r => r.price !== null)

      if (validResults.length > 0) {
        // 批量写入，一次 saveData 完成
        PriceCache.setBatch(validResults)
      }

      wx.hideLoading()
      this._loadData()

      if (validResults.length > 0) {
        wx.showToast({ title: '行情已更新', icon: 'success' })
      } else {
        wx.showToast({ title: '获取失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      this._loadData()
      wx.showToast({ title: '获取失败', icon: 'none' })
    }
  },
  
  async onRefreshPrice(e) {
    const stockId = parseInt(e.currentTarget.dataset.stockId)
    const position = this.data.positions.find(p => p.id === stockId)
    if (!position) {
      console.error('[onRefreshPrice] 未找到持仓', stockId, this.data.positions)
      toast('未找到该股票')
      return
    }
    
    console.log('[onRefreshPrice] 开始获取', position.market, position.code, position.name)
    loading('获取行情中...')
    
    try {
      let priceData = await fetchStockPrice(position.market, position.code)
      
      if (priceData && priceData.currentPrice > 0) {
        PriceCache.set(stockId, priceData.currentPrice)
        this._loadData()
        hideLoading()
        success('行情已更新')
      } else {
        hideLoading()
        toast('获取失败：价格无效')
        console.error('[onRefreshPrice] 价格无效', priceData)
      }
    } catch (err) {
      hideLoading()
      catchError(err, '获取失败')
      console.error('[onRefreshPrice] 异常', err)
    }
  },
  
  onSwipeEdit(e) {
    let stockId = e.currentTarget.dataset.stockId
    wx.navigateTo({
      url: '/packageRecord/pages/record/record?stockId=' + stockId
    })
  },
  
  onSwipeSell(e) {
    let stockId = e.currentTarget.dataset.stockId
    let position = this.data.positions.find(function (p) { return p.id === stockId })
    if (!position) { wx.showToast({ title: '未找到持仓', icon: 'none' }); return }
    wx.navigateTo({ url: '/packageRecord/pages/record/record?stockId=' + stockId + '&type=SELL' })
  },
  
  onSwipeDelete(e) {
    let stockId = e.currentTarget.dataset.stockId
    let that = this
    
    wx.showModal({
      title: '确认删除',
      content: '将删除该股票的所有交易记录和分红记录，是否确认？',
      success: function(res) {
        if (res.confirm) {
          Stock.delete(stockId)
          Transaction.deleteByStockId(stockId)
          Dividend.deleteByStockId(stockId)
          
          wx.showToast({ title: '删除成功', icon: 'success' })
          that._loadData()
        }
      }
    })
  },
  
  // ========== 持仓截图分享 ==========
  onSharePortfolio() {
    sharePortfolio(this)
  },
  
  // ========== 分享 ==========
  onShareAppMessage() {
    return {
      title: '我的股票持仓',
      path: '/pages/index/index'
    }
  }
})