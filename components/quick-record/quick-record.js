/**
 * QuickRecord 组件 — 快速交易弹窗
 */
const { fmt } = require('../../utils/helpers/format')
const { validateStockCode, getMarketLabel, formatStockCode } = require('../../utils/constants/market')
const { fetchStockPrice } = require('../../utils/services/stockPrice')
const { calculateFee } = require('../../utils/helpers/feeCalculator')
const { searchStocks } = require('../../utils/data/stockDatabase')
const { MARKETS } = require('../../utils/constants/index')
const { Stock, Transaction } = require('../../utils/models/index')
const { getSellableQuantity } = require('../../utils/services/positionService')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: '_onVisibleChange'
    }
  },

  data: {
    qrType: 'BUY',
    qrCode: '',
    qrName: '',
    qrMarket: 'A_SHARE',
    qrMarketLabel: '',
    qrPrice: '',
    qrQuantity: '100',
    qrDate: '',
    qrTime: '',
    qrFee: 0,
    qrFeeText: '0.00',
    qrActualText: '0.00',
    qrAmountText: '0.00',
    qrSuggestions: [],
    showQrSuggestions: false,
    qrFetching: false,
    showQrMore: false,
    qrCodeFocus: false
  },

  methods: {
    _onVisibleChange: function (visible) {
      if (visible) {
        var now = new Date()
        this.setData({
          qrDate: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
          qrTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
          qrCodeFocus: true,
          showQrMore: false
        })
        var that = this
        setTimeout(function () { that.setData({ qrCodeFocus: true }) }, 350)
      } else {
        this._resetForm()
      }
    },

    close: function () {
      this.triggerEvent('close')
    },

    onSheetTap: function () {},

    onQrTypeSelect: function (e) {
      this.setData({ qrType: e.currentTarget.dataset.type })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    onQrCodeInput: function (e) {
      var value = (e.detail.value || '').trim()
      var market = this._detectMarket(value)
      this.setData({
        qrCode: value,
        qrMarket: market,
        qrMarketLabel: getMarketLabel(market),
        qrName: '',
        qrPrice: ''
      })

      if (value.length >= 1) {
        var results = searchStocks(value, market, 8)
        this.setData({ qrSuggestions: results, showQrSuggestions: results.length > 0 })
      } else {
        this.setData({ qrSuggestions: [], showQrSuggestions: false })
      }

      this._calcQrFee()
      this._scheduleAutoFetch(value)
    },

    onQrCodeBlur: function () {
      var that = this
      setTimeout(function () { that.setData({ showQrSuggestions: false }) }, 200)
      this._tryAutoFetch(this.data.qrCode)
    },

    onQrSelectSuggestion: function (e) {
      var item = e.currentTarget.dataset.item
      var that = this
      this.setData({
        qrCode: item.code,
        qrName: item.name,
        qrMarket: item.market,
        qrMarketLabel: getMarketLabel(item.market),
        qrSuggestions: [],
        showQrSuggestions: false
      })
      this._tryAutoFetch(item.code)
      this._calcQrFee()
    },

    _scheduleAutoFetch: function (code) {
      if (this._afTimer) { clearTimeout(this._afTimer); this._afTimer = null }
      if (!code || !validateStockCode(code, this.data.qrMarket)) return
      var that = this
      this._afTimer = setTimeout(function () { that._tryAutoFetch(code) }, 500)
    },

    _tryAutoFetch: function (code) {
      if (!code || !validateStockCode(code, this.data.qrMarket)) return
      if (this._afFetching === code) return
      this._afFetching = code
      var that = this
      this.setData({ qrFetching: true })

      fetchStockPrice(this.data.qrMarket, code).then(function (data) {
        if (data && data.name && that.data.qrCode === code) {
          var localResults = searchStocks(code, that.data.qrMarket, 1)
          var localName = localResults.length > 0 ? localResults[0].name : null
          var finalName = localName || data.name
          var updates = { qrName: finalName, qrFetching: false }
          if (!that.data.qrPrice || parseFloat(that.data.qrPrice) === 0) {
            updates.qrPrice = String(data.currentPrice)
          }
          that.setData(updates)
          that._calcQrFee()
        } else {
          that.setData({ qrFetching: false })
        }
        that._afFetching = null
      }).catch(function () {
        that.setData({ qrFetching: false })
        that._afFetching = null
      })
    },

    onQrPriceInput: function (e) {
      this.setData({ qrPrice: e.detail.value })
      this._calcQrFee()
    },

    onQrQuantityInput: function (e) {
      this.setData({ qrQuantity: e.detail.value })
      this._calcQrFee()
    },

    onQrQtyMinus: function () {
      var qty = Math.max(0, (parseInt(this.data.qrQuantity) || 0) - 100)
      this.setData({ qrQuantity: qty > 0 ? String(qty) : '0' })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    onQrQtyPlus: function () {
      var qty = (parseInt(this.data.qrQuantity) || 0) + 100
      this.setData({ qrQuantity: String(qty) })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    onQrQtyPreset: function (e) {
      var qty = parseInt(e.currentTarget.dataset.qty) || 0
      if (qty === 0) {
        wx.showToast({ title: '全仓功能开发中', icon: 'none' })
        return
      }
      this.setData({ qrQuantity: String(qty) })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    toggleQrMore: function () {
      this.setData({ showQrMore: !this.data.showQrMore })
    },

    onQrDateChange: function (e) {
      this.setData({ qrDate: e.detail.value })
    },

    onQrTimeChange: function (e) {
      this.setData({ qrTime: e.detail.value })
    },

    _calcQrFee: function () {
      var d = this.data
      var fee = calculateFee(d.qrMarket, d.qrType, d.qrPrice, d.qrQuantity)
      var tradeAmount = (parseFloat(d.qrPrice) || 0) * (parseInt(d.qrQuantity) || 0)
      var actualAmount = d.qrType === 'BUY' ? tradeAmount + fee : tradeAmount - fee

      this.setData({
        qrFee: fee,
        qrFeeText: fmt(fee),
        qrAmountText: fmt(tradeAmount),
        qrActualText: fmt(actualAmount)
      })
    },

    _detectMarket: function (code) {
      if (/^\d{6}$/.test(code)) return MARKETS.A_SHARE
      if (/^\d{1,5}$/.test(code)) return MARKETS.HK_SHARE
      if (/^[A-Za-z]{1,5}$/.test(code)) return MARKETS.US_SHARE
      return 'A_SHARE'
    },

    submitQuickRecord: function () {
      var d = this.data
      var code = formatStockCode(d.qrCode, d.qrMarket)
      var name = d.qrName

      if (!code) { wx.showToast({ title: '请输入股票代码', icon: 'none' }); return }
      if (!name) { wx.showToast({ title: '请从列表中选择或等待自动识别', icon: 'none' }); return }
      if (!d.qrPrice || parseFloat(d.qrPrice) <= 0) { wx.showToast({ title: '请输入有效价格', icon: 'none' }); return }
      if (!d.qrQuantity || parseInt(d.qrQuantity) <= 0) { wx.showToast({ title: '请输入有效数量', icon: 'none' }); return }

      wx.vibrateShort({ type: 'medium' })
      var stock = Stock.getByCode(code, d.qrMarket)

      if (d.qrType === 'SELL') {
        if (!stock) { wx.showToast({ title: '暂无可卖持仓', icon: 'none' }); return }
        var sellableQuantity = getSellableQuantity(stock.id)
        if (parseInt(d.qrQuantity) > sellableQuantity) {
          wx.showToast({ title: '卖出数量超过持仓', icon: 'none' })
          return
        }
      }

      if (!stock) {
        stock = Stock.create(code, name, d.qrMarket)
        Stock.save(stock)
      }
      var dateTimeStr = d.qrDate + 'T' + (d.qrTime || '00:00') + ':00'
      var tx = Transaction.create(stock.id, d.qrType, d.qrPrice, d.qrQuantity, d.qrFee, new Date(dateTimeStr).toISOString())
      Transaction.save(tx)

      wx.showToast({ title: '添加成功', icon: 'success' })
      this.triggerEvent('submit', { stockId: stock.id })
    },

    _resetForm: function () {
      if (this._afTimer) { clearTimeout(this._afTimer); this._afTimer = null }
      this._afFetching = null
      this.setData({
        qrType: 'BUY',
        qrCode: '',
        qrName: '',
        qrMarket: 'A_SHARE',
        qrMarketLabel: '',
        qrPrice: '',
        qrQuantity: '100',
        qrDate: '',
        qrTime: '',
        qrFee: 0,
        qrFeeText: '0.00',
        qrActualText: '0.00',
        qrAmountText: '0.00',
        qrSuggestions: [],
        showQrSuggestions: false,
        qrFetching: false,
        showQrMore: false,
        qrCodeFocus: false
      })
    }
  }
})
