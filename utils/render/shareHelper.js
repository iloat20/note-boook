/**
 * 持仓截图分享助手
 * 从 index.js 提取，减少页面文件大小
 */

const { renderPortfolioCard } = require("./canvasRenderer");
const { toast, success, hideLoading, loading } = require("../ui/feedback");

/**
 * 生成持仓分享卡片截图
 * @param {Object} page - 页面实例（this）
 */
function sharePortfolio(page) {
	const positions = page.data.positions;
	if (!positions || positions.length === 0) {
		toast("暂无持仓数据");
		return;
	}

	loading("生成截图中...");

	const windowInfo = wx.getWindowInfo();
	const canvasWidth = windowInfo.screenWidth || 375;
	const canvasHeight = windowInfo.screenHeight || 667;

	const query = wx.createSelectorQuery();
	query
		.select("#shareCanvas")
		.fields({ node: true, size: true })
		.exec((res) => {
			if (!res?.[0]?.node) {
				hideLoading();
				toast("生成失败");
				return;
			}

			const canvas = res[0].node;
			const ctx = canvas.getContext("2d");
			const dpr = wx.getWindowInfo().pixelRatio || 2;
			canvas.width = canvasWidth * dpr;
			canvas.height = canvasHeight * dpr;
			ctx.scale(dpr, dpr);

			const now = new Date();
			const dateStr =
				now.getFullYear() +
				"-" +
				String(now.getMonth() + 1).padStart(2, "0") +
				"-" +
				String(now.getDate()).padStart(2, "0");

			const cardData = {
				dpr: dpr,
				date: dateStr,
				totalMarketValue: page.data.totalMarketValue,
				totalPnL: page.data.totalPnL,
				totalPnLPercent: page.data.totalPnLPercent,
				positionCount: positions.length,
				positions: positions.slice(0, 5).map((p) => ({
					market: p.market,
					name: p.name,
					code: p.code,
					floatingPnL: p.floatingPnL,
				})),
			};

			renderPortfolioCard(ctx, canvas, cardData, canvasWidth, canvasHeight);

			setTimeout(() => {
				wx.canvasToTempFilePath({
					canvas: canvas,
					x: 0,
					y: 0,
					width: canvasWidth * dpr,
					height: canvasHeight * dpr,
					destWidth: canvasWidth * dpr,
					destHeight: canvasHeight * dpr,
					success: (fileRes) => {
						hideLoading();
						_showShareActions(fileRes.tempFilePath);
					},
					fail: () => {
						hideLoading();
						toast("生成失败");
					},
				});
			}, 100);
		});
}

/**
 * 显示分享操作面板
 * @param {string} imagePath - 截图临时路径
 */
function _showShareActions(imagePath) {
	wx.showActionSheet({
		itemList: ["保存到相册", "转发给朋友"],
		success: (res) => {
			if (res.tapIndex === 0) {
				wx.authorize({
					scope: "scope.writePhotosAlbum",
					success: () => {
						wx.saveImageToPhotosAlbum({
							filePath: imagePath,
							success: () => {
								success("已保存到相册");
							},
							fail: () => {
								toast("保存失败");
							},
						});
					},
					fail: () => {
						wx.showModal({
							title: "需要权限",
							content: "请在设置中允许保存到相册",
							confirmText: "去设置",
							success: (modalRes) => {
								if (modalRes.confirm) wx.openSetting();
							},
						});
					},
				});
			} else if (res.tapIndex === 1) {
				wx.shareImageMessage?.({
					imageUrl: imagePath,
					success: () => {
						success("分享成功");
					},
					fail: () => {
						wx.saveImageToPhotosAlbum({
							filePath: imagePath,
							success: () => {
								toast("已保存到相册，请手动分享");
							},
						});
					},
				});
			}
		},
	});
}

module.exports = {
	sharePortfolio,
};
