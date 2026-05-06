﻿// pages/detail/detail.js
const { Stock, Transaction, Dividend, calculatePosition, PriceCache } = require("../../utils/storage")
const { fmt, fmtShortDate, fmtDate, fmtTime } = require("../../utils/format")
const { getMarketLabel, getMarketColor } = require("../../utils/market")

Page({
  data: {
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
    if (options && options.stockId) {
      this._stockId = parseInt(options.stockId)
      this.loadData()
    }
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    var stockId = this._stockId
    if (!stockId) {
      stockId = this.data.stockId
    }
    var stock = Stock.getById(stockId)
    if (!stock) {
      this.setData({ stockId: stockId })
      return
    }

    var position = calculatePosition(stock.id)
    var transactions = Transaction.getByStockId(stock.id).map(this._formatTransaction.bind(this))
    var dividends = Dividend.getByStockId(stock.id).map(this._formatDividend.bind(this))

    var marketValue = position.currentPrice && position.quantity > 0
      ? position.currentPrice * position.quantity
      : 0
    var totalPnL = position.realizedPnL + position.floatingPnL + position.dividendIncome

    this.setData({
      stock: stock,
      stockId: stock.id,
      stockName: stock.name || "股票详情",
      marketLabel: getMarketLabel(stock.market),
      marketColor: getMarketColor(stock.market),
      position: position,
      transactions: transactions,
      dividends: dividends,
      formatAvgCost: fmt(position.avgCost),
      formatMarketValue: fmt(marketValue),
      formatDividendIncome: fmt(position.dividendIncome),
      floatingPnLClass: position.floatingPnL >= 0 ? "profit" : "loss",
      floatingPnLText: (position.floatingPnL >= 0 ? "+" : "") + fmt(position.floatingPnL),
      floatingPnLPercent: this._calcFloatingPercent(position),
      realizedPnLClass: position.realizedPnL >= 0 ? "profit" : "loss",
      realizedPnLText: (position.realizedPnL >= 0 ? "+" : "") + fmt(position.realizedPnL),
      totalPnLClass: totalPnL >= 0 ? "profit" : "loss",
      totalPnLText: (totalPnL >= 0 ? "+" : "") + fmt(totalPnL)
    })
  },

  _formatTransaction(transaction) {
    var typeClass = transaction.type === "BUY" ? "buy" : "sell"
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

  _calcFloatingPercent(position) {
    if (position.quantity > 0 && position.avgCost > 0) {
      return ((position.floatingPnL / (position.avgCost * position.quantity)) * 100).toFixed(2)
    }
    return "0.00"
  },

  updatePrice(e) {
    var price = parseFloat(e.detail.value)
    var stockId = this.data.stockId || this._stockId
    if (!isNaN(price) && price > 0) {
      PriceCache.set(stockId, price)
    }
    this.loadData()
  },

  goBack() {
    wx.navigateBack()
  },

  goToRecord() {
    var stockId = this.data.stockId || this._stockId
    wx.navigateTo({ url: "/pages/record/record?stockId=" + stockId })
  },

  goToDividend() {
    var stockId = this.data.stockId || this._stockId
    wx.navigateTo({ url: "/pages/dividend/dividend?stockId=" + stockId })
  },

  showTransactionActions(e) {
    var id = e.currentTarget.dataset.id
    var self = this
    wx.showActionSheet({
      itemList: ["编辑", "删除"],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: "/pages/record/record?id=" + id })
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
    var id = e.currentTarget.dataset.id
    var self = this
    wx.showActionSheet({
      itemList: ["编辑", "删除"],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: "/pages/dividend/dividend?id=" + id })
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
