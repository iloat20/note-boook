const { Stock, Dividend } = require('../../utils/storage.js')

Page({
  data: {
    stockOptions: [], stockIdx: 0, stockText: '请选择股票',
    perShare: '', qty: '', date: '', note: '',
    perShareText: '0.00', totalText: '0.00',
    isEdit: false, editId: null
  },

  onLoad(o) {
    const n = new Date()
    this.setData({ date: `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })
    this._loadStocks()
    if (o && o.id) { this.data.isEdit = true; this.data.editId = parseInt(o.id); this._loadEdit(o.id) }
    this._preview()
  },

  _loadStocks() {
    const ss = Stock.getAll()
    this.setData({ stockOptions: ss.map(s => ({ label: `${s.code} ${s.name}`, stock: s })) })
  },

  _loadEdit(id) {
    const ds = Dividend.getAll()
    const d = ds.find(x => x.id === id)
    if (!d) return
    const s = Stock.getById(d.stockId)
    const dt = new Date(d.date)
    const idx = this.data.stockOptions.findIndex(o => o.stock && o.stock.id === d.stockId)
    this.setData({
      stockIdx: Math.max(idx, 0), stockText: s ? `${s.code} ${s.name}` : '请选择股票',
      perShare: String(d.perShareAmount), qty: String(d.quantity),
      date: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`,
      note: d.note || ''
    })
    this._preview()
  },

  selStock(e) {
    const i = parseInt(e.detail.value)
    const s = this.data.stockOptions[i]?.stock
    this.setData({ stockIdx: i, stockText: s ? `${s.code} ${s.name}` : '请选择股票' })
  },
  onPS(e) { this.setData({ perShare: e.detail.value }); this._preview() },
  onQty(e) { this.setData({ qty: e.detail.value }); this._preview() },
  onDate(e) { this.setData({ date: e.detail.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },

  _preview() {
    const ps = parseFloat(this.data.perShare) || 0
    const q = parseInt(this.data.qty) || 0
    const total = ps * q
    this.setData({ perShareText: this.f(ps), totalText: this.f(total) })
  },

  goBack() { wx.navigateBack() },

  submit() {
    const op = this.data.stockOptions[this.data.stockIdx]
    const s = op?.stock
    if (!s) { wx.showToast({ title: '请选择股票', icon: 'none' }); return }
    const { perShare:ps, qty:q, date:d, note:nt, isEdit } = this.data
    if (!ps || parseFloat(ps) <= 0) { wx.showToast({ title: '请输入有效分红金额', icon: 'none' }); return }
    if (!q || parseInt(q) <= 0) { wx.showToast({ title: '请输入有效数量', icon: 'none' }); return }
    if (!d) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }

    const dv = Dividend.create(s.id, ps, q, new Date(`${d}T00:00:00`).toISOString(), nt)
    if (isEdit) dv.id = this.data.editId
    Dividend.save(dv)
    wx.showToast({ title: isEdit ? '已修改' : '已添加', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 800)
  },

  f(num) { if (isNaN(num)) return '0.00'; return parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
})
