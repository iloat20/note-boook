/**
 * Stock price batching tests.
 */

jest.mock("../api/request", () => {
	const mockRequest = jest.fn();
	mockRequest.get = jest.fn();
	return { request: mockRequest };
});

const { request } = require("../api/request");
const { fetchAllPrices } = require("../utils/services/stockPrice");

describe("Stock price batching", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.useRealTimers();
		jest.runOnlyPendingTimers();
		request.get.mockClear();
	});

	/**
	 * Helper: encode a string as ArrayBuffer (模拟 wx.request arraybuffer responseType)
	 */
	function toArrayBuffer(str) {
		const buf = Buffer.from(str, "utf8");
		return new Uint8Array(buf).buffer;
	}

	test("should split batch requests when stock count exceeds batch size", async () => {
		const requestUrls = [];
		const stocks = Array.from({ length: 41 }, (_, index) => ({
			id: index + 1,
			market: "A_SHARE",
			code: String(600000 + index),
		}));

		// Mock request.get to capture URLs and return proper ArrayBuffer
		request.get.mockImplementation((url, data, options) => {
			requestUrls.push(url);
			const symbols = url.split("q=")[1].split(",");
			// Build mock response matching Tencent API format (>= 35 fields)
			const lines = symbols.map((symbol) => {
				const code = symbol.replace(/^sh|^sz|^bj|^r_hk|^us\./, "").toUpperCase();
				const fields = Array(39).fill("0");
				fields[0] = "x";
				fields[1] = "name_" + code;
				fields[2] = code;
				fields[3] = "10";
				fields[4] = "9";
				fields[32] = "0";
				fields[33] = "0";
				fields[34] = "0";
				fields[36] = "0";
				fields[37] = "0";
				return "v_" + symbol + '="' + fields.join("~") + '"';
			});
			return Promise.resolve(toArrayBuffer(lines.join("\n")));
		});

		const result = await fetchAllPrices(stocks);

		expect(requestUrls).toHaveLength(2);
		expect(result).toHaveLength(41);
		expect(result.filter((item) => item.price === 10)).toHaveLength(41);
	});

	test("should handle empty stocks array", async () => {
		const result = await fetchAllPrices([]);
		expect(result).toEqual([]);
	});

	test("should handle single stock", async () => {
		request.get.mockImplementation((url, data, options) => {
			const responseData =
				'v_sh600000="x~name_600000~600000~10~9~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0"';
			return Promise.resolve(toArrayBuffer(responseData));
		});

		const stocks = [{ id: 1, market: "A_SHARE", code: "600000" }];
		const result = await fetchAllPrices(stocks);
		expect(result).toHaveLength(1);
		expect(result[0].price).toBe(10);
	});
});
