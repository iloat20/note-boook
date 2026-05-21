// pages/record/record.js
const { MARKETS } = require("../../../utils/constants/index")
const { Stock, Transaction, Strategy } = require('../../../utils/models/index')
const { getSellableQuantity, calculatePosition } = require('../../../utils/services/positionService')
const { fetchStockPrice } = require('../../../utils/services/stockPrice')
const { calculateFee, getFeeBreakdown } = require("../../../utils/helpers/feeCalculator")
const { fmt } = require("../../../utils/helpers/format")
const { getMarketLabel, validateStockCode, formatStockCode } = require("../../../utils/constants/market")
const { searchStocks } = require("../../../utils/data/stockDatabase")

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    market: MARKETS.A_SHARE, code: "", name: "", type: "BUY",
    price: "", quantity: "", fee: "", date: "", time: "", note: "",
    codeError: "", feePreview: [], amountText: "0.00", actualText: "0.00",
    isEdit: false, marketLabel: "A股",
    markets: [
      { key: MARKETS.A_SHARE, label: "A股" },
      { key: MARKETS.HK_SHARE, label: "港股" },
      { key: MARKETS.US_SHARE, label: "美股" }
    ],
    showSuggestions: false,
    suggestions: [],
    highlightIndex: -1,
    showJournal: false,
    reason: '',
    strategies: [],
    allStrategies: [],
    showStrategyPicker: false,
    customStrategyInput: ''
  },

  onLoad(options) {
    this.setData(getApp().getNavBarInfo())

    const now = new Date()
    this.setData({
      date: now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0"),
      time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"),
      allStrategies: Strategy.getAll()
    })
    if (options && options.id) {
      this._isEdit = true
      this._editId = parseInt(options.id)
      this._loadEdit(this._editId)
    } else {
      if (options && options.type) {
        this.setData({ type: options.type })
      }
      // 处理从持仓页跳转的新增交易
      if (options && options.stockId) {
        const stock = Stock.getById(parseInt(options.stockId))
        if (stock) {
          this.setData({
            market: stock.market,
            code: stock.code,
            name: stock.name,
            marketLabel: getMarketLabel(stock.market)
          })
          // 卖出交易自动填入现价和持仓数量
          if (this.data.type === 'SELL') {
            this._fillSellDefaults(stock.id, stock.market, stock.code)
          }
        }
      }
    }
  },

  _loadEdit(id) {
    const transactions = Transaction.getAll()
    const transaction = transactions.find(function (t) { return t.id === id })
    if (!transaction) return
    const stock = Stock.getById(transaction.stockId)
    const date = new Date(transaction.date)
    const hasJournal = !!(transaction.reason || (transaction.strategies && transaction.strategies.length))
    this.setData({
      market: stock.market, code: stock.code, name: stock.name,
      type: transaction.type, price: String(transaction.price), quantity: String(transaction.quantity),
      fee: String(transaction.fee),
      date: date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"),
      time: String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0"),
      note: transaction.note || "",
      reason: transaction.reason || "",
      strategies: transaction.strategies || [],
      showJournal: hasJournal,
      marketLabel: getMarketLabel(stock.market)
    })
    this._calcFee()
  },

  _fillSellDefaults(stockId, market, code) {
    // 获取持仓数量
    const position = calculatePosition(stockId)
    if (position && position.quantity > 0) {
      this.setData({ quantity: String(position.quantity) })
    }
    // 获取现价
    fetchStockPrice(market, code).then(function (data) {
      if (data && data.currentPrice > 0) {
        this.setData({ price: String(data.currentPrice) })
        this._calcFee()
      }
    }.bind(this)).catch(function () {})
  },

  selectMarket(e) {
    const market = e.currentTarget.dataset.market
    this._clearAutoFetch()
    this.setData({ market: market, code: "", name: "", codeError: "", marketLabel: getMarketLabel(market) })
    this._calcFee()
  },

  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ type: type, reason: '', strategies: [] })
    this._calcFee()
  },

  onCodeInput(e) {
    const value = (e.detail.value || "").trim()
    this.setData({ code: value, codeError: "", name: "" })
    this._checkCode()
    // 触发联想搜索（本地数据库）
    if (value.length >= 1) {
      const results = searchStocks(value, this.data.market, 8)
      this.setData({ suggestions: results, showSuggestions: results.length > 0, highlightIndex: -1 })
    } else {
      this.setData({ suggestions: [], showSuggestions: false })
    }
    // 自动获取：有效代码时延迟拉取名称和现价
    this._scheduleAutoFetch(value)
  },
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onPriceInput(e) { this.setData({ price: e.detail.value }); this._calcFee() },
  onQuantityInput(e) { this.setData({ quantity: e.detail.value }); this._calcFee() },
  onFeeInput(e) {
    this.setData({ fee: e.detail.value })
    const data = this.data
    const tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity) || 0)
    const fee = parseFloat(e.detail.value) || 0
    const actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee
    this.setData({ amountText: fmt(tradeAmount), actualText: fmt(actualAmount) })
  },
  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onTimeChange(e) { this.setData({ time: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  onSelectSuggestion(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      code: item.code,
      name: item.name,
      suggestions: [],
      showSuggestions: false,
      codeError: ""
    })
    this._calcFee()
    // 选中后自动拉取现价
    this._tryAutoFetch(item.code)
  },

  hideSuggestions() {
    this.setData({ suggestions: [], showSuggestions: false })
    // 失焦时立即尝试自动获取（无延迟）
    this._tryAutoFetch(this.data.code)
  },

  _checkCode() {
    const data = this.data
    if (!data.code) { this.setData({ codeError: "" }); return }
    if (!validateStockCode(data.code, data.market)) {
      this.setData({ codeError: getMarketLabel(data.market) + "代码格式错误" })
    } else {
      this.setData({ codeError: "" })
    }
  },

  // 延迟自动获取（输入时防抖 600ms）
  _scheduleAutoFetch(code) {
    this._clearAutoFetch()
    if (!code || !validateStockCode(code, this.data.market)) return
    this._fetchTimer = setTimeout(() => {
      this._tryAutoFetch(code)
    }, 600)
  },

  _clearAutoFetch() {
    if (this._fetchTimer) { clearTimeout(this._fetchTimer); this._fetchTimer = null }
  },

  // 调用腾讯财经 API 获取名称和现价
  _tryAutoFetch(code) {
    if (!code || !validateStockCode(code, this.data.market)) return
    // 避免重复请求
    if (this._fetchingCode === code) return
    this._fetchingCode = code

    fetchStockPrice(this.data.market, code).then(function (data) {
      if (data && data.name && this.data.code === code) {
        const updates = { name: data.name }
        // 如果价格未填或为0，自动填入现价
        if (!this.data.price || parseFloat(this.data.price) === 0) {
          updates.price = String(data.currentPrice)
        }
        this.setData(updates)
        this._calcFee()
      }
      this._fetchingCode = null
    }.bind(this)).catch(function () {
      this._fetchingCode = null
    }.bind(this))
  },

  _calcFee() {
    const data = this.data
    const fee = calculateFee(data.market, data.type, data.price, data.quantity)
    const breakdown = getFeeBreakdown(data.market, data.type, data.price, data.quantity)
    const tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity) || 0)
    const actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee
    this.setData({
      fee: String(fee),
      feePreview: breakdown.items.map(function (item) { return { name: item.name, value: item.value, vt: fmt(item.value), rate: item.rate, min: item.min, note: item.note } }),
      amountText: fmt(tradeAmount),
      actualText: fmt(actualAmount)
    })
  },

  toggleJournal() {
    this.setData({ showJournal: !this.data.showJournal })
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value })
  },

  openStrategyPicker() {
    this.setData({ showStrategyPicker: true, customStrategyInput: '' })
  },

  closeStrategyPicker() {
    this.setData({ showStrategyPicker: false })
  },

  toggleStrategy(e) {
    const tag = e.currentTarget.dataset.tag
    const strategies = this.data.strategies.slice()
    const idx = strategies.indexOf(tag)
    if (idx >= 0) {
      strategies.splice(idx, 1)
    } else {
      strategies.push(tag)
    }
    this.setData({ strategies: strategies })
  },

  removeStrategy(e) {
    const tag = e.currentTarget.dataset.tag
    const strategies = this.data.strategies.filter(function (s) { return s !== tag })
    this.setData({ strategies: strategies })
  },

  onCustomStrategyInput(e) {
    this.setData({ customStrategyInput: e.detail.value })
  },

  addCustomStrategy() {
    const tag = (this.data.customStrategyInput || '').trim()
    if (!tag) return
    Strategy.add(tag)
    const strategies = this.data.strategies.slice()
    if (strategies.indexOf(tag) === -1) strategies.push(tag)
    this.setData({
      strategies: strategies,
      allStrategies: Strategy.getAll(),
      customStrategyInput: ''
    })
  },

  confirmStrategyPicker() {
    this.setData({ showStrategyPicker: false })
  },

  goBack() { wx.navigateBack() },

  submit() {
    const data = this.data
    const market = data.market
    const code = formatStockCode(data.code, market)
    const name = data.name
    const type = data.type
    const price = data.price
    const quantity = data.quantity
    const fee = data.fee
    const date = data.date
    const time = data.time
    const note = data.note

    if (!code || !name) { wx.showToast({ title: "请填写代码和名称", icon: "none" }); return }
    if (!validateStockCode(code, market)) { wx.showToast({ title: "代码格式错误", icon: "none" }); return }
    if (!price || parseFloat(price) <= 0) { wx.showToast({ title: "请输入有效价格", icon: "none" }); return }
    if (!quantity || parseInt(quantity) <= 0) { wx.showToast({ title: "请输入有效数量", icon: "none" }); return }
    if (!date || !time) { wx.showToast({ title: "请选择日期时间", icon: "none" }); return }

    let stock = Stock.getByCode(code, market)
    if (type === 'SELL') {
      if (!stock) { wx.showToast({ title: '暂无可卖持仓', icon: 'none' }); return }
      const ignoredTransactionId = this._isEdit ? this._editId : null
      const sellableQuantity = getSellableQuantity(stock.id, ignoredTransactionId)
      if (parseInt(quantity) > sellableQuantity) {
        wx.showToast({ title: '卖出数量超过持仓', icon: 'none' })
        return
      }
    }
    if (!stock) { stock = Stock.create(code, name, market); Stock.save(stock) }

    const transaction = Transaction.create(stock.id, type, price, quantity, fee, new Date(date + "T" + time + ":00").toISOString(), note, data.reason, data.strategies)
    if (this._isEdit) transaction.id = this._editId
    Transaction.save(transaction)
    wx.showToast({ title: this._isEdit ? "已修改" : "已添加", icon: "success" })
    setTimeout(function () { wx.navigateBack() }, 800)
  }
})
