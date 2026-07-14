# 资产卡片左滑手势修复设计

日期：2026-07-12
范围：核心阈值修复 + 误触抑制 + 滚动自动收起（不含速度吸附）

## 背景

资产列表（`pages/index`）的卡片支持左滑，露出「编辑 / 转出 / 删除」三个操作按钮，
手势逻辑在 `utils/ui/touchGestureMixin.js`。用户反馈「滑动功能不完善」。

审查发现一个**必现逻辑 bug**：松手吸附阈值判断写反，导致任何左滑都直接全开、拖回也关不上。

## 根因

`touchGestureMixin.js` 的 `_swipeOnTouchEnd`：

```js
const threshold = Math.abs(maxOffset) * 0.4; // 正数，如 79
const offset = p.swipeOffset || 0;           // 负数，如 -20
const newOffset = offset < threshold ? maxOffset : 0;
```

`offset`（负）永远 `< threshold`（正）→ 恒成立 → 任何左滑都吸附到 `maxOffset`（全开），
无法回弹关闭。注释意图是「越过 40% 才打开」，应为 `offset < -threshold`。

## 设计

### ① 核心修复（必做）
`_swipeOnTouchEnd` 改为 `offset < -threshold ? maxOffset : 0`：
拖过 40% 吸附打开，否则回弹关闭。符合 iOS 邮件列表直觉。

### ② 误触抑制（稳健）
水平滑动结束后的「尾随 tap」会误触卡片 `bindtap`（进详情页）。
- mixin 在 `_swipeOnTouchStart` 重置 `this._swipeInterceptTap = false`；
- 在 `_swipeOnTouchEnd`（确定发生水平滑动时）置 `this._swipeInterceptTap = true`；
- 页面 `goToDetail` 开头消费该标记：`if (this._swipeInterceptTap) { this._swipeInterceptTap = false; return; }`
- 纯点击（无移动）不会置位，正常进详情不受影响。

### ③ 滚动自动收起（稳健）
列表滚动时悬着的菜单不收起，观感脏。
- mixin 新增公开方法 `_onSwipeScroll()`，内部调用已有 `_closeAllSwipes()`；
- 首页 `scroll-view` 绑定 `bindscroll="_onSwipeScroll"`。

### 不改动
- 跟手拖动、方向锁定、菜单宽度测量、`_closeAllSwipes` 自动收起其它卡片 —— 保持。
- 速度吸附（快速轻扫也开）本次不做（YAGNI，用户已选不含）。

## 影响面

| 文件 | 改动 |
|------|------|
| `utils/ui/touchGestureMixin.js` | 阈值修正 + 新增 `_swipeInterceptTap` 标记 + 新增 `_onSwipeScroll` + 头部约定注释 |
| `pages/index/index.wxml` | `scroll-view` 加 `bindscroll="_onSwipeScroll"` |
| `pages/index/index.js` | `goToDetail` 开头加 `_swipeInterceptTap` 守卫 |

## 验证

- `npm test` 全过（现有用例不应受影响）
- `biome lint` 无新增
- 手动（微信开发者工具）：
  1. 左滑一点点 → 应回弹关闭，不进详情
  2. 左滑过 40% → 吸附全开
  3. 全开后右拖 / 点卡片主体 → 收起
  4. 菜单打开时滚动列表 → 自动收起
  5. 直接点卡片（不滑）→ 正常进详情
