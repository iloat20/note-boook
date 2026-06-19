/**
 * dateRange.js — 日期范围计算
 */

var PERIOD_DAYS = { WEEK: 7, MONTH: 30, YEAR: 365 }

function getByPeriod(period) {
  var endDate = new Date()
  var days = PERIOD_DAYS[period] || 30
  var startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
  return { startDate: startDate, endDate: endDate }
}

function today() {
  var d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function weekRange(date) {
  date = date || new Date()
  var d = new Date(date)
  var day = d.getDay()
  var diff = d.getDate() - day + (day === 0 ? -6 : 1)
  var start = new Date(d.setDate(diff))
  start.setHours(0, 0, 0, 0)
  var end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

function monthRange(date) {
  date = date || new Date()
  var d = new Date(date)
  var start = new Date(d.getFullYear(), d.getMonth(), 1)
  var end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

function fullYear(year) {
  year = year || new Date().getFullYear()
  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31, 23, 59, 59, 999)
  }
}

module.exports = {
  getByPeriod: getByPeriod,
  today: today,
  weekRange: weekRange,
  monthRange: monthRange,
  fullYear: fullYear
}
