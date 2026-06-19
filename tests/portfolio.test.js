/**
 * Portfolio correctness tests for closed positions and sell validation helpers.
 */

const { MARKETS } = require('../utils/constants/index')
const { Stock, Transaction, PriceCache } = require('../utils/models')
const { getTotalStats, getPositionSummary, getPortfolioPositions, getSellableQuantity } = require('../utils/services')

let _mockStorage = {}

describe('Portfolio calculations', () => {
  beforeEach(() => {
    jest.resetModules()
    _mockStorage = {}
    global.wx = {
      getStorageSync: jest.fn((key) => _mockStorage[key] || null),
      setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value })
    }
  })

  test('should include realized PnL when position is fully closed', () => {
    const stock = Stock.save(Stock.create('600000', '浦发银行', MARKETS.A_SHARE))
    Transaction.save(Transaction.create(stock.id, 'BUY', 10, 100, 1, '2026-01-01T00:00:00.000Z'))
    Transaction.save(Transaction.create(stock.id, 'SELL', 12, 100, 1, '2026-01-02T00:00:00.000Z'))

    const stats = getTotalStats()

    expect(stats.realizedPnL).toBe(198)
    expect(stats.totalPnL).toBe(198)
    expect(getPositionSummary()).toHaveLength(0)
    expect(getPortfolioPositions()).toHaveLength(1)
  })

  test('should return sellable quantity when excluding edited sell transaction', () => {
    const stock = Stock.save(Stock.create('600000', '浦发银行', MARKETS.A_SHARE))
    Transaction.save(Transaction.create(stock.id, 'BUY', 10, 100, 1, '2026-01-01T00:00:00.000Z'))
    const sell = Transaction.save(Transaction.create(stock.id, 'SELL', 12, 60, 1, '2026-01-02T00:00:00.000Z'))

    expect(getSellableQuantity(stock.id)).toBe(40)
    expect(getSellableQuantity(stock.id, sell.id)).toBe(100)
  })

  test('should mark data dirty via appStore when price cache changes', () => {
    var appStore = require('../utils/state/appStore')
    appStore.commit('MARK_CLEAN')
    expect(appStore.getState('dataDirty')).toBe(false)

    // re-require PriceCache after resetModules to get fresh module references
    var freshPriceCache = require('../utils/models').PriceCache
    freshPriceCache.set(1, 12.34)

    expect(appStore.getState('dataDirty')).toBe(true)
  })
})
