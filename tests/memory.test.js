/**
 * 内存预算与性能相关路径的单元测试
 * 测试 LRU 缓存淘汰、请求并发控制等内存/性能优化逻辑
 */

// Mock wx API
global.wx = {
  getStorageSync: jest.fn((key) => {
    return _mockStorage[key] || null
  }),
  setStorageSync: jest.fn((key, value) => {
    _mockStorage[key] = value
  }),
  request: jest.fn((opts) => {
    // 模拟异步请求
    setTimeout(() => {
      if (opts.success) {
        opts.success({ statusCode: 200, data: '="test~name~100~99~98~1000~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~101~102~0~0~100000"' })
      }
    }, 10)
  })
}

let _mockStorage = {}

beforeEach(() => {
  _mockStorage = {}
  jest.clearAllMocks()
})

describe('Storage LRU Cache', () => {
  // 需要重新加载模块以重置内部状态
  let storage

  beforeEach(() => {
    // 清除模块缓存，重新加载以重置 _memCache
    jest.resetModules()
    global.wx = {
      getStorageSync: jest.fn((key) => _mockStorage[key] || null),
      setStorageSync: jest.fn((key, value) => { _mockStorage[key] = value })
    }
    storage = require('../utils/storage')
  })

  test('getData returns data from wx.getStorageSync on cache miss', () => {
    _mockStorage['test_key'] = [1, 2, 3]
    const result = storage.getData('test_key')
    expect(result).toEqual([1, 2, 3])
    expect(global.wx.getStorageSync).toHaveBeenCalledWith('test_key')
  })

  test('getData caches result and avoids repeated wx.getStorageSync calls', () => {
    _mockStorage['test_key'] = [1, 2, 3]
    storage.getData('test_key')
    storage.getData('test_key')
    // 第二次调用应该从缓存读取，不再调用 wx.getStorageSync
    expect(global.wx.getStorageSync).toHaveBeenCalledTimes(1)
  })

  test('saveData updates both cache and wx.setStorageSync', () => {
    storage.saveData('test_key', [4, 5, 6])
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('test_key', [4, 5, 6])
    // 读取时应该从缓存获取
    const result = storage.getData('test_key')
    expect(result).toEqual([4, 5, 6])
  })

  test('LRU cache evicts oldest entries when exceeding MAX_MEM_CACHE (50)', () => {
    // 填充 50 个条目
    for (let i = 0; i < 50; i++) {
      _mockStorage[`key_${i}`] = [i]
      storage.getData(`key_${i}`)
    }

    // 第 51 个条目应该触发淘汰
    _mockStorage['key_50'] = [50]
    storage.getData('key_50')

    // 验证最早插入的 key_0 应该被淘汰（再次读取会从 wx.getStorageSync 获取）
    global.wx.getStorageSync.mockClear()
    _mockStorage['key_0'] = [0]
    storage.getData('key_0')
    expect(global.wx.getStorageSync).toHaveBeenCalledWith('key_0')
  })

  test('LRU promotes accessed items to end of cache', () => {
    // 填充 50 个条目
    for (let i = 0; i < 50; i++) {
      _mockStorage[`key_${i}`] = [i]
      storage.getData(`key_${i}`)
    }

    // 访问 key_0，使其成为最近使用
    storage.getData('key_0')

    // 插入第 51 个条目，应该淘汰 key_1（而不是 key_0）
    _mockStorage['key_50'] = [50]
    storage.getData('key_50')

    // key_0 应该仍在缓存中（不触发 wx.getStorageSync）
    global.wx.getStorageSync.mockClear()
    storage.getData('key_0')
    expect(global.wx.getStorageSync).not.toHaveBeenCalled()
  })

  test('clearMemCache empties the cache', () => {
    _mockStorage['test_key'] = [1, 2, 3]
    storage.getData('test_key')
    storage.clearMemCache()

    // 清除后再次读取应该从 wx.getStorageSync 获取
    global.wx.getStorageSync.mockClear()
    storage.getData('test_key')
    expect(global.wx.getStorageSync).toHaveBeenCalledWith('test_key')
  })

  test('getDataCopy returns shallow copy of array data', () => {
    _mockStorage['test_key'] = [1, 2, 3]
    const copy = storage.getDataCopy('test_key')
    expect(copy).toEqual([1, 2, 3])
    // 修改拷贝不应影响原始数据
    copy.push(4)
    const original = storage.getData('test_key')
    expect(original).toEqual([1, 2, 3])
  })

  test('getDataCopy returns shallow copy of object data', () => {
    _mockStorage['test_key'] = { a: 1, b: 2 }
    const copy = storage.getDataCopy('test_key')
    expect(copy).toEqual({ a: 1, b: 2 })
    // 修改拷贝不应影响原始数据
    copy.c = 3
    const original = storage.getData('test_key')
    expect(original).toEqual({ a: 1, b: 2 })
  })
})

describe('Cache Size Constants', () => {
  test('MAX_MEM_CACHE is 50', () => {
    const storageContent = require('fs').readFileSync(
      require('path').join(__dirname, '../utils/storage.js'), 'utf8'
    )
    expect(storageContent).toContain('const MAX_MEM_CACHE = 50')
  })

  test('MAX_POSITION_CACHE is 100', () => {
    const storageContent = require('fs').readFileSync(
      require('path').join(__dirname, '../utils/storage.js'), 'utf8'
    )
    expect(storageContent).toContain('const MAX_POSITION_CACHE = 100')
  })

  test('MAX_HEATMAP_CACHE is 50', () => {
    const storageContent = require('fs').readFileSync(
      require('path').join(__dirname, '../utils/storage.js'), 'utf8'
    )
    expect(storageContent).toContain('const MAX_HEATMAP_CACHE = 50')
  })
})
