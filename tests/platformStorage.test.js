// tests/platformStorage.test.js
// 验证 platform/storage 的 DIP 接缝确实把调用转发到 wx 存储 API。

let wxMock;

beforeEach(() => {
	wxMock = {
		getStorageSync: jest.fn(() => "v"),
		setStorageSync: jest.fn(),
		removeStorageSync: jest.fn(),
	};
	global.wx = wxMock;
});

const { getStorageSync, setStorageSync, removeStorageSync } = require("../utils/platform/storage");

test("getStorageSync 转发到 wx.getStorageSync", () => {
	expect(getStorageSync("k")).toBe("v");
	expect(wxMock.getStorageSync).toHaveBeenCalledWith("k");
});

test("setStorageSync 转发到 wx.setStorageSync", () => {
	setStorageSync("k", 1);
	expect(wxMock.setStorageSync).toHaveBeenCalledWith("k", 1);
});

test("removeStorageSync 转发到 wx.removeStorageSync", () => {
	removeStorageSync("k");
	expect(wxMock.removeStorageSync).toHaveBeenCalledWith("k");
});
