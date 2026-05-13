// utils/market.js
// Market label/color/validation helpers — shared across all pages

const { MARKETS } = require('./constants')

function getMarketLabel(market) {
  const labels = {
    [MARKETS.A_SHARE]: 'A股',
    [MARKETS.HK_SHARE]: '港股',
    [MARKETS.US_SHARE]: '美股'
  }
  return labels[market] || ''
}

function getMarketColor(market) {
  const colors = {
    [MARKETS.A_SHARE]: '#3B82F6',
    [MARKETS.HK_SHARE]: '#F97316',
    [MARKETS.US_SHARE]: '#A855F7'
  }
  return colors[market] || '#64748B'
}

function validateStockCode(code, market) {
  switch (market) {
    case MARKETS.A_SHARE:
      return /^\d{6}$/.test(code)
    case MARKETS.HK_SHARE:
      return /^(hk|HK)?\d{1,5}$/.test(code)
    case MARKETS.US_SHARE:
      return /^[A-Za-z]{1,5}$/.test(code)
    default:
      return false
  }
}

function formatStockCode(code, market) {
  switch (market) {
    case MARKETS.HK_SHARE:
      var num = code.replace(/^(hk|HK)/, '')
      return num.padStart(5, '0')
    case MARKETS.US_SHARE:
      return code.toUpperCase()
    default:
      return code
  }
}

module.exports = { getMarketLabel, getMarketColor, validateStockCode, formatStockCode }
