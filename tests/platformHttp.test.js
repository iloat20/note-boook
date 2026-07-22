// tests/platformHttp.test.js
// 验证 platform/http 的 DIP 接缝把 wx.request 的 success/fail 归一为 Promise。

let wxMock;

beforeEach(() => {
	wxMock = { request: jest.fn() };
	global.wx = wxMock;
});

const { request } = require("../utils/platform/http");

test("2xx 时 resolve res.data", async () => {
	wxMock.request.mockImplementation((opts) => {
		opts.success({ statusCode: 200, data: { ok: true } });
	});
	const data = await request({ url: "x" });
	expect(data).toEqual({ ok: true });
	expect(wxMock.request).toHaveBeenCalledWith(expect.objectContaining({ url: "x" }));
});

test("非 2xx 时 reject，携带 statusCode 与 data", async () => {
	wxMock.request.mockImplementation((opts) => {
		opts.success({ statusCode: 500, data: "err" });
	});
	await expect(request({ url: "x" })).rejects.toEqual({ statusCode: 500, data: "err" });
});

test("fail 时 reject，statusCode 为 0", async () => {
	wxMock.request.mockImplementation((opts) => {
		opts.fail({ errMsg: "network" });
	});
	await expect(request({ url: "x" })).rejects.toMatchObject({ statusCode: 0 });
});
