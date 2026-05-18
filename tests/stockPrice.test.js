/**
 * Stock price batching tests.
 */

describe('Stock price batching', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.useRealTimers()
  })

  test('should split batch requests when stock count exceeds batch size', async () => {
    const requestUrls = []
    global.wx = {
      request: jest.fn((opts) => {
        requestUrls.push(opts.url)
        const symbols = opts.url.split('q=')[1].split(',')
        const data = symbols.map((symbol) => {
          const code = symbol.replace(/^sh|^sz|^bj|^r_hk|^us\./, '').toUpperCase()
          return `v_${symbol}="x~name~${code}~10~9~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~11~9~0~0~1000";`
        }).join('\n')
        opts.success({ statusCode: 200, data })
      })
    }
    const { fetchAllPrices } = require('../utils/stockPrice')
    const stocks = Array.from({ length: 41 }, (_, index) => ({
      id: index + 1,
      market: 'A_SHARE',
      code: String(600000 + index)
    }))

    const result = await fetchAllPrices(stocks)

    expect(requestUrls).toHaveLength(2)
    expect(result).toHaveLength(41)
    expect(result.filter((item) => item.price === 10)).toHaveLength(41)
  })
})
