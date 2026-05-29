/**
 * QuickRecord 组件 — 快速交易弹窗（重构版）
 *
 * 属性：
 *   visible  {boolean}  控制弹窗显示/隐藏
 *
 * 事件：
 *   close    — 用户关闭弹窗（背景点击 / ✕ 按钮）
 *   submit   — 交易记录保存成功
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
    // ──── 生命周期 ────
    _onVisibleChange: function (visible) {
      if (visible) { now = new Date()
        this.setData({
          qrDate: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
          qrTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
          qrCodeFocus: true,
          showQrMore: false
        })
        // 重新聚焦输入框 that = this
        setTimeout(function () { that.setData({ qrCodeFocus: true }) }, 350)
      } else {
        this._resetForm()
      }
    },

    // ──── 关闭 ────
    close: function () {
      this.triggerEvent('close')
    },

    onSheetTap: function () {},

    // ──── 类型切换 ────
    onQrTypeSelect: function (e) {
      this.setData({ qrType: e.currentTarget.dataset.type })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    // ──── 代码输入 + 自动获取 ────
    onQrCodeInput: function (e) { value = (e.detail.value || '').trim() market = this._detectMarket(value)
      this.setData({
        qrCode: value,
        qrMarket: market,
        qrMarketLabel: getMarketLabel(market),
        qrName: '',
        qrPrice: ''
      })

      // 本地联想搜索
      if (value.length >= 1) { results = searchStocks(value, market, 8)
        this.setData({ qrSuggestions: results, showQrSuggestions: results.length > 0 })
      } else {
        this.setData({ qrSuggestions: [], showQrSuggestions: false })
      }

      this._calcQrFee()
      this._scheduleAutoFetch(value)
    },

    onQrCodeBlur: function () { that = this
      setTimeout(function () { that.setData({ showQrSuggestions: false }) }, 200)
      // 失焦时立即尝试获取
      this._tryAutoFetch(this.data.qrCode)
    },

    onQrSelectSuggestion: function (e) { item = e.currentTarget.dataset.item that = this
      this.setData({
        qrCode: item.code,
        qrName: item.name,
        qrMarket: item.market,
        qrMarketLabel: getMarketLabel(item.market),
        qrSuggestions: [],
        showQrSuggestions: false
      })
      // 选中后自动拉取现价
      this._tryAutoFetch(item.code)
      this._calcQrFee()
    },

    // ──── 自动获取（防抖） ────
    _scheduleAutoFetch: function (code) {
      if (this._afTimer) { clearTimeout(this._afTimer); this._afTimer = null }
      if (!code || !validateStockCode(code, this.data.qrMarket)) return that = this
      this._afTimer = setTimeout(function () { that._tryAutoFetch(code) }, 500)
    },

    _tryAutoFetch: function (code) {
      if (!code || !validateStockCode(code, this.data.qrMarket)) return
      if (this._afFetching === code) return
      this._afFetching = code that = this
      this.setData({ qrFetching: true })

      fetchStockPrice(this.data.qrMarket, code).then(function (data) {
        if (data && data.name && that.data.qrCode === code) {
          // 优先用本地数据库名字（UTF-8 不会乱码），API 名字仅作兜底 localResults = searchStocks(code, that.data.qrMarket, 1) localName = localResults.length > 0 ? localResults[0].name : null finalName = localName || data.name updates = { qrName: finalName, qrFetching: false }
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

    // ──── 价格/数量 ────
    onQrPriceInput: function (e) {
      this.setData({ qrPrice: e.detail.value })
      this._calcQrFee()
    },

    onQrQuantityInput: function (e) {
      this.setData({ qrQuantity: e.detail.value })
      this._calcQrFee()
    },

    onQrQtyMinus: function () { qty = Math.max(0, (parseInt(this.data.qrQuantity) || 0) - 100)
      this.setData({ qrQuantity: qty > 0 ? String(qty) : '0' })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    onQrQtyPlus: function () { qty = (parseInt(this.data.qrQuantity) || 0) + 100
      this.setData({ qrQuantity: String(qty) })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    // ──── 数量快捷预设 ────
    onQrQtyPreset: function (e) { qty = parseInt(e.currentTarget.dataset.qty) || 0
      if (qty === 0) {
        // 全仓：TODO 后续可接持仓数据
        wx.showToast({ title: '全仓功能开发中', icon: 'none' })
        return
      }
      this.setData({ qrQuantity: String(qty) })
      this._calcQrFee()
      wx.vibrateShort({ type: 'light' })
    },

    // ──── 日期/时间 ────
    toggleQrMore: function () {
      this.setData({ showQrMore: !this.data.showQrMore })
    },

    onQrDateChange: function (e) {
      this.setData({ qrDate: e.detail.value })
    },

    onQrTimeChange: function (e) {
      this.setData({ qrTime: e.detail.value })
    },

    // ──── 费用 ────
    _calcQrFee: function () { d = this.data fee = calculateFee(d.qrMarket, d.qrType, d.qrPrice, d.qrQuantity) tradeAmount = (parseFloat(d.qrPrice) || 0) * (parseInt(d.qrQuantity) || 0) actualAmount = d.qrType === 'BUY' ? tradeAmount + fee : tradeAmount - fee

      this.setData({
        qrFee: fee,
        qrFeeText: fmt(fee),
        qrAmountText: fmt(tradeAmount),
        qrActualText: fmt(actualAmount)
      })
    },

    // ──── 市场检测 ────
    _detectMarket: function (code) {
      if (/^\d{6}$/.test(code)) return MARKETS.A_SHARE
      if (/^\d{1,5}$/.test(code)) return MARKETS.HK_SHARE
      if (/^[A-Za-z]{1,5}$/.test(code)) return MARKETS.US_SHARE
      return 'A_SHARE'
    },

    // ──── 提交 ────
    submitQuickRecord: function () { d = this.data code = formatStockCode(d.qrCode, d.qrMarket) name = d.qrName

      if (!code) { wx.showToast({ title: '请输入股票代码', icon: 'none' }); return }
      if (!name) { wx.showToast({ title: '请从列表中选择或等待自动识别', icon: 'none' }); return }
      if (!d.qrPrice || parseFloat(d.qrPrice) <= 0) { wx.showToast({ title: '请输入有效价格', icon: 'none' }); return }
      if (!d.qrQuantity || parseInt(d.qrQuantity) <= 0) { wx.showToast({ title: '请输入有效数量', icon: 'none' }); return }

      wx.vibrateShort({ type: 'medium' }) stock = Stock.getByCode(code, d.qrMarket)

      if (d.qrType === 'SELL') {
        if (!stock) { wx.showToast({ title: '暂无可卖持仓', icon: 'none' }); return } sellableQuantity = getSellableQuantity(stock.id)
        if (parseInt(d.qrQuantity) > sellableQuantity) {
          wx.showToast({ title: '卖出数量超过持仓', icon: 'none' })
          return
        }
      }

      if (!stock) {
        stock = Stock.create(code, name, d.qrMarket)
        Stock.save(stock)
      } dateTimeStr = d.qrDate + 'T' + (d.qrTime || '00:00') + ':00' tx = Transaction.create(stock.id, d.qrType, d.qrPrice, d.qrQuantity, d.qrFee, new Date(dateTimeStr).toISOString())
      Transaction.save(tx)

      wx.showToast({ title: '添加成功', icon: 'success' })
      this.triggerEvent('submit', { stockId: stock.id })
    },

    // ──── 重置 ────
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
