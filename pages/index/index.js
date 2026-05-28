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
const { getMarketLabel, getMarketColor, getMarketCurrency } = require('../../utils/constants/market')
const { fetchStockPrice, fetchAllPrices } = require('../../utils/services/stockPrice')
const { getRates, getRate } = require('../../utils/services/exchangeRate')
const { MARKETS, TIMING_CONFIG } = require('../../utils/constants/index')
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
    summaryCurrency: '¥',
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
    displayPositions: [],
    _allPositions: [],
    _rates: null,
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
    displayCount: 20,
    
    // 加载状态（初始 false，_loadData 开始时会设为 true）
    loading: false,
    animating: false,
    entranceDone: false,

    showQuickRecord: false,
    deletingId: null,
    tabAnimating: false
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

    // 订阅状态变化（使用 mutation type 作为 key，与 store 的 _notify 一致）
    this._unsubscribePositions = positionStore.subscribe('SET_POSITIONS', (newPositions) => {
      const filtered = this.data.currentMarket
        ? newPositions.filter(p => p.market === this.data.currentMarket)
        : newPositions
      this.setData({ positions: filtered, displayPositions: filtered.slice(0, this.data.displayCount) })
    })

    // 等待数据加载完成后再获取现价
    await this._loadData()

    // 只在交易时段或持仓无现价时（首次进入）获取行情
    var allPos = this.data._allPositions || this.data.positions
    var hasNoPrice = allPos.some(function (p) { return !p.currentPrice || p.currentPrice <= 0 })
    if (isTradingTime() || hasNoPrice) {
      this._fetchPrices({ silent: true })
    }
  },
  
  async onShow() {
    pageMixin.setTabSelected(this, 0)

    // 如果数据过期，先刷新持仓数据
    if (pageMixin.consumeDirtyFlag()) {
      await this._loadData()
      // 添加/修改交易后自动获取一次现价，不区分交易时段，强制忽略缓存
      if (this.data.positions && this.data.positions.length > 0) {
        this._fetchPrices({ silent: true, force: true })
      }
    } else if (isTradingTime()) {
      // 交易时段正常刷新现价
      if (this.data.positions && this.data.positions.length > 0) {
        this._fetchPrices({ silent: true })
      }
    }
  },
  
  onUnload() {
    // 清理定时器
    if (this._animTimer) clearTimeout(this._animTimer)
    if (this._cleanupTimer) clearTimeout(this._cleanupTimer)

    // 取消状态订阅
    if (this._unsubscribePositions) {
      this._unsubscribePositions()
    }
    
    // (eventBus 监听已移除 — 改用 appStore + positionStore)
  },
  
  onPullDownRefresh() {
    this._loadData(true).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
    this._fetchPrices()
  },
  
  // ========== 数据加载 ==========
  async _loadData(forceRefresh = false) {
    if (this.data.loading) return

    try {

      // 使用 positionService 获取数据（已封装缓存逻辑）
      // 注意：getAllPositions 内部使用同步 storage 操作，无需 Promise
      const allPositions = positionService.getAllPositions(forceRefresh)

      // 获取汇率（港股/美股 → 人民币换算）
      const rates = await getRates()
      this._rates = rates

      // 计算显示数据
      let totalMarketValue = 0
      let totalCost = 0
      let totalRealizedPnL = 0
      let totalFloatingPnL = 0
      let totalDividendIncome = 0
      let totalBuyFee = 0
      let totalInvestment = 0

      // 已实现盈亏和分红收入从所有持仓（含已清仓）计算
      allPositions.forEach(p => {
        var rate = getRate(p.market, rates)
        totalRealizedPnL += (p.realizedPnL || 0) * rate
        totalDividendIncome += (p.dividendIncome || 0) * rate
      })

      // 持仓页只显示持股数 > 0 的标的
      const positions = allPositions.filter(function (p) { return p.quantity > 0 })

      // 更新 Store（会触发订阅回调）
      positionStore.commit('SET_POSITIONS', positions)

      // 浮动盈亏和市值仅统计当前持仓
      positions.forEach(p => {
        var rate = getRate(p.market, rates)
        totalFloatingPnL += (p.floatingPnL || 0) * rate
        if (p.currentPrice) {
          totalMarketValue += p.currentPrice * p.quantity * rate
        }
        totalCost += p.avgCost * p.quantity * rate
        totalBuyFee += (p.totalBuyFee || 0) * rate
      })

      // Build positionMap for O(1) lookups
      const positionMap = new Map(allPositions.map(function (p) { return [p.id, p] }))
      this._positionMap = positionMap

      // 计算总投资（买入金额 + 费用，含已清仓股票）
      const allTransactions = Transaction.getAll()
      const allStockIds = new Set(allPositions.map(p => p.id))

      allTransactions.forEach(t => {
        if (allStockIds.has(t.stockId) && t.type === 'BUY') {
          var tRate = getRate(positionMap.get(t.stockId)?.market, rates)
          totalInvestment += (t.price * t.quantity + t.fee) * tRate
        }
      })

      // Cache for _updateSummary and onMarketTabChange
      this._cachedTotalInvestment = totalInvestment
      
      if (totalInvestment <= 0) totalInvestment = totalCost + totalBuyFee
      
      const totalPnL = totalRealizedPnL + totalFloatingPnL + totalDividendIncome
      
      // 格式化持仓数据
      const oldPositions = this.data._allPositions || []
      const oldPriceMap = {}
      oldPositions.forEach(function (op) { oldPriceMap[op.id] = op.currentPrice })
      
      // 找出新增的卡片ID（仅在非首次加载时标记）
      const isFirstLoad = oldPositions.length === 0
      const newIds = isFirstLoad ? new Set() : new Set(positions.map(p => p.id).filter(id => !oldPositions.some(op => op.id === id)))
      
      const formattedPositions = positions.map(p => {
        const pnlPercent = calcFloatingPercent(p)
        const oldPrice = oldPriceMap[p.id]
        let priceFlashClass = ''
        if (oldPrice && p.currentPrice && oldPrice !== p.currentPrice) {
          priceFlashClass = p.currentPrice > oldPrice ? 'price-flash-profit' : 'price-flash-loss'
        }

        const currency = getMarketCurrency(p.market)

        // Pre-compute card class to avoid ternary in WXML
        var cardClass = 'position-card'
        if (newIds.has(p.id)) cardClass += ' position-card-entering'
        if (priceFlashClass) cardClass += ' ' + priceFlashClass

        return {
          ...p,
          quantityText: String(Math.round(p.quantity)),
          avgCostText: fmt(p.avgCost),
          currentPriceText: p.currentPrice ? fmt(p.currentPrice) : '--',
          floatingPnLText: fmt(p.floatingPnL),
          pnlPercentText: pnlPercent,
          marketLabel: getMarketLabel(p.market),
          marketColor: getMarketColor(p.market),
          priceFlashClass: priceFlashClass,
          entering: newIds.has(p.id),
          cardClass: cardClass
        }
      })

      // Schedule combined cleanup for priceFlash + entering animations
      const hasFlash = formattedPositions.some(function (p) { return p.priceFlashClass !== '' })
      const hasEntering = newIds.size > 0
      if (hasFlash || hasEntering) {
        const delay = Math.max(TIMING_CONFIG.PRICE_FLASH_CLEAR_DELAY, TIMING_CONFIG.ENTER_ANIM_DELAY)
        this._cleanupTimer = setTimeout(() => {
          const cleaned = this.data.positions.map(p => {
            var result = Object.assign({}, p)
            if (hasFlash) result.priceFlashClass = ''
            if (hasEntering) result.entering = false
            return result
          })
          this.setData({ positions: cleaned })
        }, delay)
      }
      
      // Compute market tab counts in single pass
      const marketCounts = { null: formattedPositions.length }
      formattedPositions.forEach(function (p) {
        marketCounts[p.market] = (marketCounts[p.market] || 0) + 1
      })
      const updatedTabs = this.data.marketTabs.map(function (tab) {
        return Object.assign({}, tab, { count: marketCounts[tab.key] || 0 })
      })

      // Pre-compute per-market investment for tab switching
      const marketInvestment = {}
      const allTx = Transaction.getAll()
      allTx.forEach(function (t) {
        if (t.type === 'BUY') {
          var pos = positionMap.get(t.stockId)
          if (pos) {
            var tRate = getRate(pos.market, rates)
            marketInvestment[pos.market] = (marketInvestment[pos.market] || 0) + (t.price * t.quantity + t.fee) * tRate
          }
        }
      })
      marketInvestment[null] = totalInvestment
      this._cachedMarketInvestment = marketInvestment

      // 根据当前市场筛选
      const filteredPositions = this.data.currentMarket
        ? formattedPositions.filter(p => p.market === this.data.currentMarket)
        : formattedPositions

      // 防止 NaN 导致 toFixed 报错
      const safeTotalMarketValue = isNaN(totalMarketValue) ? 0 : totalMarketValue
      const safeTotalPnL = isNaN(totalPnL) ? 0 : totalPnL
      const safeTotalInvestment = isNaN(totalInvestment) ? 1 : totalInvestment

      this.setData({
        _allPositions: formattedPositions,
        _rates: rates,
        positions: filteredPositions,
        displayPositions: filteredPositions.slice(0, this.data.displayCount),
        totalMarketValue: parseFloat(safeTotalMarketValue.toFixed(2)),
        totalMarketValueText: fmt(safeTotalMarketValue),
        totalPnL: parseFloat(safeTotalPnL.toFixed(2)),
        totalPnLText: fmt(safeTotalPnL),
        totalPnLPercent: safeTotalInvestment > 0 ? parseFloat((safeTotalPnL / safeTotalInvestment * 100).toFixed(2)) : 0,
        loading: false,
        entranceDone: true,
        marketTabs: updatedTabs,
        // 直接设置 displayValues 初始值，防止 animateAllValues 失败时显示空白
        'displayValues.totalMarketValue': fmt(safeTotalMarketValue),
        'displayValues.totalPnL': fmt(safeTotalPnL),
        'displayValues.totalPnLPercent': fmt(safeTotalInvestment > 0 ? parseFloat((safeTotalPnL / safeTotalInvestment * 100).toFixed(2)) : 0)
      })

      // 批量数字滚动动画
      animateAllValues(this, {
        totalMarketValue: totalMarketValue,
        totalPnL: totalPnL,
        totalPnLPercent: totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0
      })
      
      } catch (err) {
        console.error('[Index] loadData error:', err)
        this.setData({ loading: false })
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        catchError(err, '加载失败')
      }
  },

  _updateSummary() {
    const allPositions = this.data._allPositions || []
    const rates = this.data._rates || { usdToCny: 1, hkdToCny: 1 }

    let totalMarketValue = 0
    let totalPnL = 0

    const portfolioPositions = allPositions.filter(p => p.quantity > 0)

    portfolioPositions.forEach(p => {
      const rate = getRate(p.market, rates)
      if (p.currentPrice && p.quantity > 0) {
        totalMarketValue += p.currentPrice * p.quantity * rate
      }
      totalPnL += (p.floatingPnL || 0) * rate
        + (p.realizedPnL || 0) * rate
        + (p.dividendIncome || 0) * rate
    })

    const totalInvestment = this._cachedTotalInvestment || 1

    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment * 100) : 0

    this.setData({
      totalMarketValue: parseFloat(totalMarketValue.toFixed(2)),
      totalMarketValueText: fmt(totalMarketValue),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalPnLText: fmt(totalPnL),
      totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2))
    })

    animateAllValues(this, {
      totalMarketValue: totalMarketValue,
      totalPnL: totalPnL,
      totalPnLPercent: totalPnLPercent
    })
  },

  // 更新市场 tab 计数（已内联到 _loadData）
  // _updateMarketTabs removed - counts computed in _loadData main setData

  
  // 更新日期
  updateDate() {
    const now = new Date()
    const date = fmtDate(now)
    this.setData({ currentDate: date })
  },
  
  // ========== 用户交互 ==========
  // 切换市场（由 liquid-slider 组件触发）- 只切换显示，不刷新页面
  onMarketTabChange(e) {
    const key = e.detail.key
    const that = this
    
    // 先触发退场动画
    this.setData({ tabAnimating: true })

    // 等待退场动画完成后切换数据
    setTimeout(function() {
      // 从缓存数据中筛选对应市场的持仓
      const allPositions = that.data._allPositions || []
      const filteredPositions = key
        ? allPositions.filter(p => p.market === key)
        : allPositions
      
      // 使用缓存的汇率计算汇总数据
      const rates = that.data._rates || { usdToCny: 1, hkdToCny: 1 }
      
      const marketValue = filteredPositions.reduce((sum, p) => {
        const rate = getRate(p.market, rates)
        return sum + (p.currentPrice || 0) * p.quantity * rate
      }, 0)
      
      const marketPnL = filteredPositions.reduce((sum, p) => {
        const rate = getRate(p.market, rates)
        return sum + (p.floatingPnL || 0) * rate + (p.realizedPnL || 0) * rate + (p.dividendIncome || 0) * rate
      }, 0)

      let marketInvestment = 0
      const cachedMI = that._cachedMarketInvestment
      if (key && cachedMI) {
        marketInvestment = cachedMI[key] || 0
      } else if (cachedMI) {
        marketInvestment = cachedMI[null] || 0
      }
      const marketPnLPercent = marketInvestment > 0 ? (marketPnL / marketInvestment * 100) : 0
      
      that.setData({
        currentMarket: key,
        positions: filteredPositions,
        displayPositions: filteredPositions.slice(0, 20),
        tabAnimating: false,
        displayCount: 20,
        totalMarketValue: parseFloat(marketValue.toFixed(2)),
        totalPnL: parseFloat(marketPnL.toFixed(2)),
        totalPnLPercent: parseFloat(marketPnLPercent.toFixed(2))
      })
      // Use animateAllValues to update displayValues with raw numbers (not formatted strings)
      animateAllValues(that, {
        totalMarketValue: marketValue,
        totalPnL: marketPnL,
        totalPnLPercent: marketPnLPercent
      })
    }, TIMING_CONFIG.TAB_SWITCH_ANIM_DELAY)
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

  // 持仓列表加载更多
  loadMorePositions() {
    const current = this.data.displayCount
    const total = (this.data.positions || []).length
    if (current < total) {
      const newCount = Math.min(current + 20, total)
      this.setData({
        displayCount: newCount,
        displayPositions: this.data.positions.slice(0, newCount)
      })
    }
  },

  // 长按持仓卡片 — 快捷操作菜单
  onPositionLongPress(e) {
    const stockId = e.currentTarget.dataset.stockId
    const stock = (this.data._allPositions || []).find(p => p.id === stockId)
    if (!stock) return
    wx.showActionSheet({
      itemList: ['查看详情', '快速卖出', '添加交易'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/packageDetail/pages/detail/detail?stockId=${stockId}` })
        } else if (res.tapIndex === 1) {
          wx.navigateTo({ url: `/packageRecord/pages/record/record?stockId=${stockId}&type=SELL` })
        } else if (res.tapIndex === 2) {
          wx.navigateTo({ url: `/packageRecord/pages/record/record?stockId=${stockId}` })
        }
      }
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
    // 自动刷新行情，更新现价（静默）
    this._fetchPrices({ silent: true })
  },
  
  // ========== 获取行情 ==========
  async _fetchPrices(opts) {
    var silent = opts && opts.silent
    var force = opts && opts.force
    // 使用 _allPositions 确保所有市场的股票都能获取行情（不只是当前 tab 筛选的）
    const positions = this.data._allPositions || this.data.positions
    if (!positions || positions.length === 0) return

    // 非强制时跳过 TTL 未过期的股票
    const needFetch = force 
      ? positions 
      : positions.filter(p => !PriceCache.has(p.id))
    
    if (needFetch.length === 0) {
      if (!silent) wx.showToast({ title: '行情已是最新', icon: 'none' })
      return
    }

    if (!silent) wx.showLoading({ title: '获取行情中...' })

    try {
      const results = await fetchAllPrices(needFetch)
      const validResults = results.filter(r => r.price !== null)

      if (validResults.length > 0) {
        // 批量写入缓存
        PriceCache.setBatch(validResults)
        // 直接更新持仓的现价，不依赖 _loadData（避免 loading 锁竞争）
        const priceMap = {}
        validResults.forEach(function (r) { priceMap[r.stockId] = r.price })
        const updated = this.data.positions.map(function (p) {
          if (priceMap[p.id] != null) {
            return Object.assign({}, p, {
              currentPrice: priceMap[p.id],
              currentPriceText: fmt(priceMap[p.id])
            })
          }
          return p
        })
        // 同步更新 _allPositions
        const allUpdated = (this.data._allPositions || []).map(function (p) {
          if (priceMap[p.id] != null) {
            return Object.assign({}, p, {
              currentPrice: priceMap[p.id],
              currentPriceText: fmt(priceMap[p.id])
            })
          }
          return p
        })
        this.setData({ positions: updated, _allPositions: allUpdated, displayPositions: updated.slice(0, this.data.displayCount) })
        this._updateSummary()
      } else {
        // 无有效结果时仍刷新持仓（可能清理过期缓存等）
        this._loadData()
      }

      if (!silent) wx.hideLoading()

      if (!silent) {
        if (validResults.length > 0) {
          wx.showToast({ title: '行情已更新', icon: 'success' })
        } else {
          wx.showToast({ title: '获取失败', icon: 'none' })
        }
      }
    } catch (err) {
      if (!silent) wx.hideLoading()
      this._loadData()
      if (!silent) wx.showToast({ title: '获取失败', icon: 'none' })
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
      url: '/packageDetail/pages/detail/detail?stockId=' + stockId
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
          // 先触发删除动画
          that.setData({ deletingId: stockId })
          
          // 等待动画完成后执行删除
          setTimeout(function() {
            Stock.delete(stockId)
            Transaction.deleteByStockId(stockId)
            Dividend.deleteByStockId(stockId)
            
            wx.showToast({ title: '删除成功', icon: 'success' })
            that.setData({ deletingId: null })
            that._loadData()
          }, 400)
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
