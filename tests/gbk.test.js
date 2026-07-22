// tests/gbk.test.js
// 覆盖 gbk.js 的 decodeGBK：空值/字符串透传/GBK 解码/降级 latin-1/ArrayBuffer 输入。

const { decodeGBK } = require("../utils/helpers/gbk");

describe("decodeGBK", () => {
	test("null / undefined → 空字符串", () => {
		expect(decodeGBK(null)).toBe("");
		expect(decodeGBK(undefined)).toBe("");
	});

	test("字符串原样透传", () => {
		expect(decodeGBK("hello")).toBe("hello");
		expect(decodeGBK("中文")).toBe("中文");
	});

	test("GBK 字节解码为 UTF-8（TextDecoder 支持 gb18030 时）", () => {
		// "中" 的 GBK 编码为 0xD6 0xD0
		const bytes = new Uint8Array([0xd6, 0xd0]);
		expect(decodeGBK(bytes)).toBe("中");
	});

	test("接受 ArrayBuffer 输入", () => {
		const buf = new Uint8Array([0xd6, 0xd0]).buffer;
		expect(decodeGBK(buf)).toBe("中");
	});

	test("TextDecoder(gb18030) 不可用时降级到 latin-1 逐字节", () => {
		const original = global.TextDecoder;
		// 模拟运行环境不支持 gb18030：构造时会抛出
		global.TextDecoder = function (encoding) {
			if (encoding === "gb18030") {
				return { decode: () => { throw new Error("unsupported"); } };
			}
			return original ? new original(encoding) : { decode: () => "" };
		};
		try {
			const bytes = new Uint8Array([0xd6, 0xd0]);
			const result = decodeGBK(bytes);
			// latin-1 降级：每个字节 → 对应 char code
			expect(result).toBe(String.fromCharCode(0xd6) + String.fromCharCode(0xd0));
		} finally {
			global.TextDecoder = original;
		}
	});
});
