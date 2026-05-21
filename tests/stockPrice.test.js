/**
 * Stock price batching tests.
 */

jest.mock('../api/request', () => {
  const mockRequest = jest.fn()
  mockRequest.get = jest.fn()
  return { request: mockRequest, addInterceptor: jest.fn() }
})

const { request } = require('../api/request')
const { fetchAllPrices } = require('../utils/services/stockPrice')

describe('Stock price batching', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.useRealTimers()
    request.get.mockClear()
  })
  
  test('should split batch requests when stock count exceeds batch size', async () => {
    const requestUrls = []
    const stocks = Array.from({ length: 41 }, (_, index) => ({
      id: index + 1,
      market: 'A_SHARE',
      code: String(600000 + index)
    }))
    
    // Mock request.get to capture URLs and return mock data
    request.get.mockImplementation((url, data, options) => {
      requestUrls.push(url)
      const symbols = url.split('q=')[1].split(',')
      // 构建符合parseTencentData格式的mock数据（至少35个字段）
      const responseData = symbols.map((symbol) => {
        const code = symbol.replace(/^sh|^sz|^bj|^r_hk|^us\./, '').toUpperCase()
        // fields[2] = code, fields[3] = price
        const fields = ['x', 'name', code, '10', '9', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']
        return 'v_' + symbol + '="' + fields.join('~') + '"'
      }).join('\n')
      
      return Promise.resolve(responseData)
    })
    
    const result = await fetchAllPrices(stocks)
    
    expect(requestUrls).toHaveLength(2)
    expect(result).toHaveLength(41)
    expect(result.filter((item) => item.price === 10)).toHaveLength(41)
  })
})
