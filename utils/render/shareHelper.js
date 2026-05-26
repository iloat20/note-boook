/**
 * 持仓截图分享助手
 * 从 index.js 提取，减少页面文件大小
 */

const { renderPortfolioCard } = require('./canvasRenderer')
const { toast, success, hideLoading, loading } = require('../ui/feedback')

/**
 * 生成持仓分享卡片截图
 * @param {Object} page - 页面实例（this）
 */
function sharePortfolio(page) {
  let positions = page.data.positions
  if (!positions || positions.length === 0) {
    toast('暂无持仓数据')
    return
  }

  loading('生成截图中...')

  const windowInfo = wx.getWindowInfo()
  const canvasWidth = windowInfo.screenWidth || 375
  const canvasHeight = windowInfo.screenHeight || 667

  let query = wx.createSelectorQuery()
  query.select('#shareCanvas').fields({ node: true, size: true }).exec(function (res) {
    if (!res || !res[0] || !res[0].node) {
      hideLoading()
      toast('生成失败')
      return
    }

    let canvas = res[0].node
    let ctx = canvas.getContext('2d')
    let dpr = wx.getWindowInfo().pixelRatio || 2
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    ctx.scale(dpr, dpr)

    let now = new Date()
    let dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

    let cardData = {
      dpr: dpr,
      date: dateStr,
      totalMarketValue: page.data.totalMarketValue,
      totalPnL: page.data.totalPnL,
      totalPnLPercent: page.data.totalPnLPercent,
      positionCount: positions.length,
      positions: positions.slice(0, 5).map(function (p) {
        return {
          market: p.market,
          name: p.name,
          code: p.code,
          floatingPnL: p.floatingPnL
        }
      })
    }

    renderPortfolioCard(ctx, canvas, cardData, canvasWidth, canvasHeight)

    setTimeout(function () {
      wx.canvasToTempFilePath({
        canvas: canvas,
        x: 0,
        y: 0,
        width: canvasWidth * dpr,
        height: canvasHeight * dpr,
        destWidth: canvasWidth * dpr,
        destHeight: canvasHeight * dpr,
        success: function (fileRes) {
          hideLoading()
          _showShareActions(fileRes.tempFilePath)
        },
        fail: function () {
          hideLoading()
          toast('生成失败')
        }
      })
    }, 100)
  })
}

/**
 * 显示分享操作面板
 * @param {string} imagePath - 截图临时路径
 */
function _showShareActions(imagePath) {
  wx.showActionSheet({
    itemList: ['保存到相册', '转发给朋友'],
    success: function (res) {
      if (res.tapIndex === 0) {
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: function () {
            wx.saveImageToPhotosAlbum({
              filePath: imagePath,
              success: function () { success('已保存到相册') },
              fail: function () { toast('保存失败') }
            })
          },
          fail: function () {
            wx.showModal({
              title: '需要权限',
              content: '请在设置中允许保存到相册',
              confirmText: '去设置',
              success: function (modalRes) {
                if (modalRes.confirm) wx.openSetting()
              }
            })
          }
        })
      } else if (res.tapIndex === 1) {
        wx.shareImageMessage && wx.shareImageMessage({
          imageUrl: imagePath,
          success: function () { success('分享成功') },
          fail: function () {
            wx.saveImageToPhotosAlbum({
              filePath: imagePath,
              success: function () { toast('已保存到相册，请手动分享') }
            })
          }
        })
      }
    }
  })
}

module.exports = {
  sharePortfolio
}
