/**
 * 详情页空态渲染回归测试（结构性）。
 *
 * 根因：detail.wxml 中 `<empty-state wx:else>` 与它的 `wx:if="{{stock}}"`
 * （在 </scroll-view> 处）之间，隔着两个 `wx:if="{{showEditSheet}}"` 的 view。
 * 微信要求 wx:if / wx:elif / wx:else 必须紧邻兄弟节点，否则 wx:else 会错误绑定到
 * 最近的上一个 wx:if（即编辑抽屉），导致「资产不存在」空态在 showEditSheet===false
 * （几乎永远）时渲染，盖在真实内容上方。
 *
 * 该 bug 无法被纯 JS 测试发现（JS 数据始终正确），因此这里直接解析 wxml 文本，
 * 断言空态组件由 `!stock` 控制、且不存在被错误绑定的 wx:else。
 */

const fs = require("fs");
const path = require("path");

const WXML_PATH = path.join(__dirname, "..", "packageDetail", "pages", "detail", "detail.wxml");

function readWxml() {
	return fs.readFileSync(WXML_PATH, "utf-8");
}

test("空态 <empty-state> 由 !stock 控制，而非被错误绑定的 wx:else", () => {
	const wxml = readWxml();
	// 纯字符串截取 <empty-state ... /> 标签块，避免正则在转换环境下的怪异行为
	const start = wxml.indexOf("<empty-state");
	expect(start).toBeGreaterThan(-1);
	const end = wxml.indexOf("/>", start);
	const tag = wxml.slice(start, end + 2);

	// 根因修复：空态必须显式由 !stock 控制
	expect(tag).toContain('wx:if="{{!stock}}"');
	// 回归护栏：空态标签上绝不能再用会被错误绑定的 wx:else
	expect(tag).not.toContain("wx:else");
});

test("scroll-view 与 empty-state 的 stock 条件是互补的（不变量）", () => {
	const wxml = readWxml();
	expect(wxml).toContain('wx:if="{{stock}}"');
	expect(wxml).toContain('wx:if="{{!stock}}"');
});
