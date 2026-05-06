﻿// utils/feeCalculator.js
// Fee calculation with shared constants — getFeeBreakdown is canonical
var constants = require("./constants")
var MARKETS = constants.MARKETS
var TRANSACTION_TYPE = constants.TRANSACTION_TYPE
var FEE_CONFIG = constants.FEE_CONFIG

function _calcAShare(type, amount) {
  var config = FEE_CONFIG.A_SHARE
  var commission = amount * config.commissionRate
  if (commission < config.commissionMin) commission = config.commissionMin
  var stampDuty = 0
  if (type === TRANSACTION_TYPE.SELL) {
    stampDuty = amount * config.stampDutyRate
    stampDuty = Math.round(stampDuty * 100) / 100
  }
  var transferFee = amount * config.transferFeeRate
  if (transferFee < config.transferFeeMin) transferFee = config.transferFeeMin
  transferFee = Math.round(transferFee * 100) / 100
  return { commission: commission, stampDuty: stampDuty, transferFee: transferFee }
}

function _calcHKShare(type, amount) {
  var config = FEE_CONFIG.HK_SHARE
  var commission = amount * config.commissionRate
  if (commission < config.commissionMin) commission = config.commissionMin
  var stampDuty = amount * config.stampDutyRate
  stampDuty = Math.round(stampDuty)
  var transactionLevy = amount * config.transactionLevyRate
  var transactionFee = amount * config.transactionFeeRate
  if (transactionFee < config.transactionFeeMin) transactionFee = config.transactionFeeMin
  var clearingFee = amount * config.clearingFeeRate
  if (clearingFee < config.clearingFeeMin) clearingFee = config.clearingFeeMin
  return { commission: commission, stampDuty: stampDuty, transactionLevy: transactionLevy, transactionFee: transactionFee, clearingFee: clearingFee }
}

function _calcUSShare(type, amount, quantity) {
  var config = FEE_CONFIG.US_SHARE
  var commission = config.commissionPerTrade
  var secFee = 0
  var tafFee = 0
  if (type === TRANSACTION_TYPE.SELL) {
    secFee = amount * config.secFeeRate
    if (secFee > 21.84) secFee = 21.84
    tafFee = quantity * config.tafFeePerShare
  }
  return { commission: commission, secFee: secFee, tafFee: tafFee }
}

function getFeeBreakdown(market, type, price, quantity) {
  price = parseFloat(price) || 0
  quantity = parseInt(quantity) || 0
  if (price <= 0 || quantity <= 0) return { total: 0, items: [] }
  var amount = price * quantity

  switch (market) {
    case MARKETS.A_SHARE: {
      var config = FEE_CONFIG.A_SHARE
      var a = _calcAShare(type, amount)
      var total = a.commission + a.stampDuty + a.transferFee
      return {
        total: parseFloat(total.toFixed(2)),
        items: [
          { name: "佣金", value: a.commission, rate: (config.commissionRate * 100).toFixed(4) + "%", min: config.commissionMin },
          { name: "印花税", value: a.stampDuty, rate: type === TRANSACTION_TYPE.SELL ? (config.stampDutyRate * 100).toFixed(2) + "%" : "0%", note: "仅卖出时收取" },
          { name: "过户费", value: a.transferFee, rate: (config.transferFeeRate * 100).toFixed(4) + "%" }
        ]
      }
    }
    case MARKETS.HK_SHARE: {
      var config2 = FEE_CONFIG.HK_SHARE
      var h = _calcHKShare(type, amount)
      var total2 = h.commission + h.stampDuty + h.transactionLevy + h.transactionFee + h.clearingFee
      return {
        total: parseFloat(total2.toFixed(2)),
        items: [
          { name: "佣金", value: h.commission, rate: (config2.commissionRate * 100).toFixed(3) + "%", min: config2.commissionMin },
          { name: "印花税", value: h.stampDuty, rate: (config2.stampDutyRate * 100).toFixed(2) + "%" },
          { name: "交易征费", value: h.transactionLevy, rate: (config2.transactionLevyRate * 100).toFixed(4) + "%" },
          { name: "交易费", value: h.transactionFee, rate: (config2.transactionFeeRate * 100).toFixed(3) + "%", min: config2.transactionFeeMin },
          { name: "中央结算费", value: h.clearingFee, rate: (config2.clearingFeeRate * 100).toFixed(3) + "%", min: config2.clearingFeeMin }
        ]
      }
    }
    case MARKETS.US_SHARE: {
      var config3 = FEE_CONFIG.US_SHARE
      var u = _calcUSShare(type, amount, quantity)
      var total3 = u.commission + u.secFee + u.tafFee
      return {
        total: parseFloat(total3.toFixed(2)),
        items: [
          { name: "佣金", value: u.commission, note: "每笔固定收费" },
          { name: "SEC费", value: u.secFee, rate: (config3.secFeeRate * 100).toFixed(6) + "%", note: "仅卖出时收取，上限21.84" },
          { name: "TAF费", value: u.tafFee, note: "每股$" + config3.tafFeePerShare + "，仅卖出时收取" }
        ]
      }
    }
    default:
      return { total: 0, items: [] }
  }
}

function calculateFee(market, type, price, quantity) {
  return getFeeBreakdown(market, type, price, quantity).total
}

module.exports = { calculateFee: calculateFee, getFeeBreakdown: getFeeBreakdown }
