// utils/constants.js
// Centralized constants for the stock trading app

const MARKETS = {
  A_SHARE: 'A_SHARE',
  HK_SHARE: 'HK_SHARE',
  US_SHARE: 'US_SHARE'
}

const TRANSACTION_TYPE = {
  BUY: 'BUY',
  SELL: 'SELL'
}

const FEE_CONFIG = {
  A_SHARE: {
    commissionRate: 0.00025,
    commissionMin: 5,
    stampDutyRate: 0.001,
    transferFeeRate: 0.00001,
    transferFeeMin: 0
  },
  HK_SHARE: {
    commissionRate: 0.0003,
    commissionMin: 3,
    stampDutyRate: 0.0013,
    transactionLevyRate: 0.0000278,
    transactionFeeRate: 0.00005,
    transactionFeeMin: 2,
    clearingFeeRate: 0.00002,
    clearingFeeMin: 2
  },
  US_SHARE: {
    commissionPerTrade: 0.99,
    secFeeRate: 0.0000278,
    tafFeePerShare: 0.000166
  }
}

module.exports = { MARKETS, TRANSACTION_TYPE, FEE_CONFIG }
