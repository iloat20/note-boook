﻿// pages/record/record.js
const { MARKETS } = require("../../utils/constants")
const { Stock, Transaction, PriceCache, Strategy } = require("../../utils/storage")
const { calculateFee, getFeeBreakdown } = require("../../utils/feeCalculator")
const { fmt } = require("../../utils/format")
const { getMarketLabel, validateStockCode, formatStockCode } = require("../../utils/market")
const { searchStocks } = require("../../utils/stockDatabase")

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
    }
  },

  _loadEdit(id) {
    const transactions = Transaction.getAll()
    const transaction = transactions.find(function (t) { return t.id === id })
    if (!transaction) return
    const stock = Stock.getById(transaction.stockId)
    const date = new Date(transaction.date)
    var hasJournal = !!(transaction.reason || (transaction.strategies && transaction.strategies.length))
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

  selectMarket(e) {
    var market = e.currentTarget.dataset.market
    this.setData({ market: market, code: "", codeError: "", marketLabel: getMarketLabel(market) })
    this._calcFee()
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
    this._calcFee()
  },

  onCodeInput(e) {
    var value = (e.detail.value || "").trim()
    this.setData({ code: value, codeError: "" })
    this._checkCode()
    // 触发联想搜索
    if (value.length >= 1) {
      var results = searchStocks(value, this.data.market, 8)
      this.setData({ suggestions: results, showSuggestions: results.length > 0, highlightIndex: -1 })
    } else {
      this.setData({ suggestions: [], showSuggestions: false })
    }
  },
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onPriceInput(e) { this.setData({ price: e.detail.value }); this._calcFee() },
  onQuantityInput(e) { this.setData({ quantity: e.detail.value }); this._calcFee() },
  onFeeInput(e) {
    this.setData({ fee: e.detail.value })
    var data = this.data
    var tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity) || 0)
    var fee = parseFloat(e.detail.value) || 0
    var actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee
    this.setData({ amountText: fmt(tradeAmount), actualText: fmt(actualAmount) })
  },
  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onTimeChange(e) { this.setData({ time: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  onSelectSuggestion(e) {
    var item = e.currentTarget.dataset.item
    this.setData({
      code: item.code,
      name: item.name,
      suggestions: [],
      showSuggestions: false,
      codeError: ""
    })
    this._calcFee()
  },

  hideSuggestions() {
    this.setData({ suggestions: [], showSuggestions: false })
  },

  _checkCode() {
    var data = this.data
    if (!data.code) { this.setData({ codeError: "" }); return }
    if (!validateStockCode(data.code, data.market)) {
      this.setData({ codeError: getMarketLabel(data.market) + "代码格式错误" })
    } else {
      this.setData({ codeError: "" })
    }
  },

  _calcFee() {
    var data = this.data
    var fee = calculateFee(data.market, data.type, data.price, data.quantity)
    var breakdown = getFeeBreakdown(data.market, data.type, data.price, data.quantity)
    var tradeAmount = (parseFloat(data.price) || 0) * (parseInt(data.quantity) || 0)
    var actualAmount = data.type === "BUY" ? tradeAmount + fee : tradeAmount - fee
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
    var tag = e.currentTarget.dataset.tag
    var strategies = this.data.strategies.slice()
    var idx = strategies.indexOf(tag)
    if (idx >= 0) {
      strategies.splice(idx, 1)
    } else {
      strategies.push(tag)
    }
    this.setData({ strategies: strategies })
  },

  removeStrategy(e) {
    var tag = e.currentTarget.dataset.tag
    var strategies = this.data.strategies.filter(function (s) { return s !== tag })
    this.setData({ strategies: strategies })
  },

  onCustomStrategyInput(e) {
    this.setData({ customStrategyInput: e.detail.value })
  },

  addCustomStrategy() {
    var tag = (this.data.customStrategyInput || '').trim()
    if (!tag) return
    Strategy.add(tag)
    var strategies = this.data.strategies.slice()
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
    var data = this.data
    var market = data.market
    var code = formatStockCode(data.code, market)
    var name = data.name
    var type = data.type
    var price = data.price
    var quantity = data.quantity
    var fee = data.fee
    var date = data.date
    var time = data.time
    var note = data.note

    if (!code || !name) { wx.showToast({ title: "请填写代码和名称", icon: "none" }); return }
    if (!validateStockCode(code, market)) { wx.showToast({ title: "代码格式错误", icon: "none" }); return }
    if (!price || parseFloat(price) <= 0) { wx.showToast({ title: "请输入有效价格", icon: "none" }); return }
    if (!quantity || parseInt(quantity) <= 0) { wx.showToast({ title: "请输入有效数量", icon: "none" }); return }
    if (!date || !time) { wx.showToast({ title: "请选择日期时间", icon: "none" }); return }

    var stock = Stock.getByCode(code, market)
    if (!stock) { stock = Stock.create(code, name, market); Stock.save(stock) }

    var transaction = Transaction.create(stock.id, type, price, quantity, fee, new Date(date + "T" + time + ":00").toISOString(), note, data.reason, data.strategies)
    if (this._isEdit) transaction.id = this._editId
    Transaction.save(transaction)
    wx.showToast({ title: this._isEdit ? "已修改" : "已添加", icon: "success" })
    setTimeout(function () { wx.navigateBack() }, 800)
  }
})
