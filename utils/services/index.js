/**
 * Services 模块统一导出
 */

const positionService = require("./positionService");
const statsService = require("./statsService");
const stockPrice = require("./stockPrice");

module.exports = {
	// Position services
	calculatePosition: positionService.calculatePosition,
	getSellableQuantity: positionService.getSellableQuantity,
	batchCalculatePositions: positionService.batchCalculatePositions,
	getAllPositions: positionService.getAllPositions,
	getPortfolioPositions: positionService.getPortfolioPositions,
	getPositionSummary: positionService.getPositionSummary,
	getClearedPositions: positionService.getClearedPositions,

	// Stats services
	getStrategyStats: statsService.getStrategyStats,
	getTotalStats: statsService.getTotalStats,

	// Stock price services
	fetchStockPrice: stockPrice.fetchStockPrice,
	fetchAllPrices: stockPrice.fetchAllPrices,
};
