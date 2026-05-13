// utils/format.js
// Shared number/date formatting helpers

function fmt(num) {
  if (isNaN(num)) return '0.00'
  const n = parseFloat(num)
  if (isNaN(n)) return '0.00'
  const parts = n.toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+$)/g, ',')
  return parts.join('.')
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

module.exports = { fmt, fmtDate, fmtTime, fmtShortDate }
