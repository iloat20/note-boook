// pages/detail/detail.js
const { Stock, Transaction, Dividend, PriceCache } = require('../../../utils/models/index')
const { calculatePosition } = require('../../../utils/services/positionService')
const { getStrategyStats } = require('../../../utils/services/statsService')
const { fmt, fmtShortDate, fmtTime } = require("../../../utils/helpers/format")
const { calcFloatingPercent } = require('../../../utils/helpers/positionCalculator')
const { getMarketLabel, getMarketColor } = require("../../../utils/constants/market")

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    stock: null,
    stockId: null,
    stockName: "股票详情",
    marketLabel: "",
    marketColor: "#64748B",
    position: {
      quantity: 0,
      avgCost: 0,
      realizedPnL: 0,
      dividendIncome: 0,
      currentPrice: null,
      floatingPnL: 0,
      totalPnL: 0
    },
    transactions: [],
    dividends: [],
    strategySummary: [],
    formatAvgCost: "0.00",
    formatMarketValue: "0.00",
    formatDividendIncome: "0.00",
    floatingPnLClass: "loss",
    floatingPnLText: "0.00",
    floatingPnLPercent: "0.00",
    realizedPnLClass: "loss",
    realizedPnLText: "0.00",
    totalPnLClass: "loss",
    totalPnLText: "0.00",
    disTransId: null,
    disDivId: null
  },

  onLoad(options) {
    this.setData(getApp().getNavBarInfo())

    if (options && options.stockId) {
      this._stockId = parseInt(options.stockId)
      this.loadData()
    }
  },

  onShow() {
    // 始终重新加载数据以反映可能的变更
    this.loadData()
  },

  loadData() {
    let stockId = this._stockId
    if (!stockId) {
      stockId = this.data.stockId
    }
    const stock = Stock.getById(stockId)
    if (!stock) {
      this.setData({ stockId: stockId })
      return
    }

    const position = calculatePosition(stock.id)
    const rawTransactions = Transaction.getByStockId(stock.id)
    const transactions = rawTransactions.map(this._formatTransaction.bind(this))
    const dividends = Dividend.getByStockId(stock.id).map(this._formatDividend.bind(this))
    const strategySummary = getStrategyStats(rawTransactions)

    const marketValue = position.currentPrice && position.quantity > 0
      ? position.currentPrice * position.quantity
      : 0
    const totalPnL = position.realizedPnL + position.floatingPnL + position.dividendIncome

    this.setData({
      stock: stock,
      stockId: stock.id,
      stockName: stock.name || "股票详情",
      marketLabel: getMarketLabel(stock.market),
      marketColor: getMarketColor(stock.market),
      position: position,
      transactions: transactions,
      dividends: dividends,
      strategySummary: strategySummary,
      formatAvgCost: fmt(position.avgCost),
      formatMarketValue: fmt(marketValue),
      formatDividendIncome: fmt(position.dividendIncome),
      floatingPnLClass: position.floatingPnL >= 0 ? "profit" : "loss",
      floatingPnLText: (position.floatingPnL >= 0 ? "+" : "") + fmt(position.floatingPnL),
      floatingPnLPercent: calcFloatingPercent(position),
      realizedPnLClass: position.realizedPnL >= 0 ? "profit" : "loss",
      realizedPnLText: (position.realizedPnL >= 0 ? "+" : "") + fmt(position.realizedPnL),
      totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
      totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(totalPnL)
    })
  },

  _formatTransaction(transaction) {
    const typeClass = transaction.type === "BUY" ? "buy" : "sell"
    const strategies = transaction.strategies || []
    const reason = transaction.reason || ''
    return {
      id: transaction.id,
      stockId: transaction.stockId,
      type: transaction.type,
      typeClass: typeClass,
      typeText: transaction.type === "BUY" ? "买入" : "卖出",
      price: transaction.price,
      quantity: transaction.quantity,
      fee: transaction.fee,
      date: transaction.date,
      note: transaction.note,
      reason: reason,
      strategies: strategies,
      hasJournal: !!(reason || strategies.length),
      dateText: fmtShortDate(transaction.date),
      timeText: fmtTime(transaction.date),
      priceText: fmt(transaction.price),
      feeText: fmt(transaction.fee),
      amountText: (transaction.type === "BUY" ? "-" : "+") + fmt(transaction.price * transaction.quantity)
    }
  },

  _formatDividend(dividend) {
    return {
      id: dividend.id,
      stockId: dividend.stockId,
      perShareAmount: dividend.perShareAmount,
      quantity: dividend.quantity,
      totalAmount: dividend.totalAmount,
      date: dividend.date,
      note: dividend.note,
      dateText: fmtShortDate(dividend.date),
      perShareText: fmt(dividend.perShareAmount),
      totalText: fmt(dividend.totalAmount)
    }
  },

  updatePrice(e) {
    const price = parseFloat(e.detail.value)
    const stockId = this.data.stockId || this._stockId
    if (!isNaN(price) && price > 0) {
      PriceCache.set(stockId, price)
    }
    this.loadData()
  },

  goBack() {
    wx.navigateBack()
  },

  goToRecord() {
    const stockId = this.data.stockId || this._stockId
    wx.navigateTo({ url: "/packageRecord/pages/record/record?stockId=" + stockId })
  },

  goToDividend() {
    const stockId = this.data.stockId || this._stockId
    wx.navigateTo({ url: "/packageDetail/pages/dividend/dividend?stockId=" + stockId })
  },

  showTransactionActions(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showActionSheet({
      itemList: ["编辑", "删除"],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: "/packageRecord/pages/record/record?id=" + id })
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: "确认删除",
            content: "确定要删除这笔交易记录吗？",
            success: function (modalRes) {
              if (modalRes.confirm) {
                self.setData({ disTransId: id })
                setTimeout(function () {
                  Transaction.delete(id)
                  self.loadData()
                }, 400)
              }
            }
          })
        }
      }
    })
  },

  showDividendActions(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showActionSheet({
      itemList: ["编辑", "删除"],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: "/packageDetail/pages/dividend/dividend?id=" + id })
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: "确认删除",
            content: "确定要删除这笔分红记录吗？",
            success: function (modalRes) {
              if (modalRes.confirm) {
                self.setData({ disDivId: id })
                setTimeout(function () {
                  Dividend.delete(id)
                  self.loadData()
                }, 400)
              }
            }
          })
        }
      }
    })
  }
})
