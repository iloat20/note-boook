// utils/format.js
// Shared number/date formatting helpers

function fmt(num) {
  if (isNaN(num)) return '0.00'
  return parseFloat(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtAbs(num) {
  if (isNaN(num)) return '0.00'
  return Math.abs(parseFloat(num)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtDate(date) {
  const d = new Date(date)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function fmtTime(date) {
  const d = new Date(date)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function fmtShortDate(date) {
  const d = new Date(date)
  return (d.getMonth() + 1) + '/' + d.getDate()
}

module.exports = { fmt, fmtAbs, fmtDate, fmtTime, fmtShortDate }
