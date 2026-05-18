/**
 * Portfolio correctness tests for closed positions and sell validation helpers.
 */

let _mockStorage = {}

describe('Portfolio calculations', () => {
  let storage

  beforeEach(() => {
    jest.resetModules()
    _mockStorage = {}
    global.wx = {
      getStorageSync: jest.fn((key) => _mockStorage[key] || null),
      setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value })
    }
    global.getApp = jest.fn(() => ({ globalData: { dataDirty: false } }))
    storage = require('../utils/storage')
  })

  test('should include realized PnL when position is fully closed', () => {
    const stock = storage.Stock.save(storage.Stock.create('600000', '浦发银行', storage.MARKETS.A_SHARE))
    storage.Transaction.save(storage.Transaction.create(stock.id, 'BUY', 10, 100, 1, '2026-01-01T00:00:00.000Z'))
    storage.Transaction.save(storage.Transaction.create(stock.id, 'SELL', 12, 100, 1, '2026-01-02T00:00:00.000Z'))

    const stats = storage.getTotalStats()

    expect(stats.realizedPnL).toBe(198)
    expect(stats.totalPnL).toBe(198)
    expect(storage.getPositionSummary()).toHaveLength(0)
    expect(storage.getPortfolioPositions()).toHaveLength(1)
  })

  test('should return sellable quantity when excluding edited sell transaction', () => {
    const stock = storage.Stock.save(storage.Stock.create('600000', '浦发银行', storage.MARKETS.A_SHARE))
    storage.Transaction.save(storage.Transaction.create(stock.id, 'BUY', 10, 100, 1, '2026-01-01T00:00:00.000Z'))
    const sell = storage.Transaction.save(storage.Transaction.create(stock.id, 'SELL', 12, 60, 1, '2026-01-02T00:00:00.000Z'))

    expect(storage.getSellableQuantity(stock.id)).toBe(40)
    expect(storage.getSellableQuantity(stock.id, sell.id)).toBe(100)
  })

  test('should mark app data dirty when price cache changes', () => {
    const app = { globalData: { dataDirty: false } }
    global.getApp = jest.fn(() => app)

    storage.PriceCache.set(1, 12.34)

    expect(app.globalData.dataDirty).toBe(true)
  })
})
