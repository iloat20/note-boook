// utils/helpers/recordView.js
// Pure helper — builds a display-ready record object from a raw Transaction or Dividend entity.
// Shared by history and stats pages to avoid duplicating the type-text / class / formatting logic.

const { fmt, fmtDate, fmtTime } = require("./format");
const { getMarketLabel, getMarketColor } = require("../constants/market");

/**
 * @param {Object} entity — raw Transaction or Dividend entity (must have .type, .date, .stockId)
 * @param {Object} stock — resolved Stock entity (code, name, market)
 * @param {Object} [options]
 * @param {string} [options.amountClassPrefix="detail-amount"] — CSS class prefix for amountClass
 * @param {string} [options.amountClassForBuy="loss"] — suffix for BUY amountClass
 * @param {string} [options.amountClassForSell="profit"] — suffix for SELL amountClass
 * @param {string} [options.amountClassForDividend="dividend"] — suffix for DIVIDEND amountClass
 * @param {boolean} [options.includeTypeBar=false] — whether to include typeBarClass field
 * @param {boolean} [options.includeDividendFields=false] — whether to include perShareAmount fields
 * @param {boolean} [options.includeJournalFields=false] — whether to include strategies/reason/hasJournal
 * @param {boolean} [options.includeFeeFields=false] — whether to include fee/feeText
 * @param {boolean} [options.includeStatsFields=false] — whether to include totalPnLText and dateText
 * @param {boolean} [options.grossAmount=false] — if true, amountText = fmt(price*qty) instead of fmt(Math.abs(net amount))
 * @returns {Object} display-ready record
 */
function buildRecordView(entity, stock, options = {}) {
	const {
		amountClassPrefix = "detail-amount",
		amountClassForBuy = "loss",
		amountClassForSell = "profit",
		amountClassForDividend = "dividend",
		includeTypeBar = false,
		includeDividendFields = false,
		includeJournalFields = false,
		includeFeeFields = false,
		includeStatsFields = false,
		grossAmount = false,
	} = options;

	const isDividend = entity.type === "DIVIDEND";
	const isBuy = !isDividend && entity.type === "BUY";

	// --- type text + tag class ---
	let typeText;
	let typeTagClass;
	let amountClass;
	let typeBarClass;

	if (isDividend) {
		typeText = "分红";
		typeTagClass = "tag type-tag tag-dividend";
		amountClass = `${amountClassPrefix} mono-num ${amountClassForDividend}`;
	} else if (isBuy) {
		typeText = "买入";
		typeTagClass = "tag type-tag tag-buy";
		amountClass = `${amountClassPrefix} mono-num ${amountClassForBuy}`;
	} else {
		typeText = "卖出";
		typeTagClass = "tag type-tag tag-sell";
		amountClass = `${amountClassPrefix} mono-num ${amountClassForSell}`;
	}

	if (includeTypeBar) {
		typeBarClass = isDividend
			? "record-type-bar bar-dividend"
			: `record-type-bar ${isBuy ? "bar-buy" : "bar-sell"}`;
	}

	// --- sort key (prefer precomputed _sortKey) ---
	const sortKey = entity._sortKey || new Date(entity.date).getTime();

	// --- stock info ---
	const market = stock ? stock.market : "";
	const marketLabel = stock ? getMarketLabel(stock.market) : "";
	const marketColor = stock ? getMarketColor(stock.market) : "";
	const code = stock ? stock.code : "-";
	const name = stock ? stock.name : "-";

	// --- date ---
	const dateObj = new Date(entity.date);
	const dateStr = fmtDate(dateObj);
	const timeStr = fmtTime(dateObj);

	// --- base record ---
	const record = {
		id: entity.id,
		stockId: entity.stockId,
		type: isDividend ? "DIVIDEND" : entity.type,
		typeText,
		typeTagClass,
		amountClass,
		market,
		marketLabel,
		marketColor,
		code,
		name,
		strategies: [],
	};

	if (includeTypeBar) {
		record.typeBarClass = typeBarClass;
	}

	record._sortKey = sortKey;

	if (isDividend) {
		// --- dividend-specific ---
		const quantity = parseFloat(entity.quantity) || 0;
		const totalAmount = entity.totalAmount;

		if (includeDividendFields) {
			record.perShareAmount = entity.perShareAmount;
			record.perShareAmountText = fmt(entity.perShareAmount);
		}

		record.quantity = quantity;
		record.amount = totalAmount;
		record.amountText = fmt(totalAmount);
		record.date = dateStr;
		record.time = timeStr;

		if (includeStatsFields) {
			record.dateText = entity.date ? fmtDate(new Date(entity.date)) : "-";
			record.totalPnLText = fmt(totalAmount);
		}
	} else {
		// --- transaction (BUY/SELL) ---
		const price = parseFloat(entity.price) || 0;
		const quantity = parseFloat(entity.quantity) || 0;
		const fee = parseFloat(entity.fee) || 0;
		const amount = isBuy ? -(price * quantity + fee) : price * quantity - fee;

		record.price = price;
		record.priceText = fmt(price);
		record.quantity = quantity;

		if (includeFeeFields) {
			record.fee = fee;
			record.feeText = fmt(fee);
		}

		record.amount = amount;
		record.amountText = grossAmount ? fmt(price * quantity) : fmt(Math.abs(amount));
		record.date = dateStr;
		record.time = timeStr;

		if (includeStatsFields) {
			record.dateText = entity.date ? fmtDate(new Date(entity.date)) : "-";
			record.totalPnLText = fmt(price * quantity);
		}

		if (includeJournalFields) {
			record.strategies = entity.strategies || [];
			record.reason = entity.reason || "";
			record.hasJournal = !!(entity.reason || entity.strategies?.length);
		}
	}

	return record;
}

module.exports = { buildRecordView };
