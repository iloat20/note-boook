# 年度报告分享改造设计（2026-07-14）

## 背景与目标

原年度报告浮层（`components/annual-report/`）顶部固定栏有 3 个按钮：左侧 `✕ 退出`，右侧独立的 `📷 保存图片` 与 `分享`（`open-type="share"`，微信原生链接卡片）。

问题：
- "保存图片" 与 "分享" 是两个割裂的入口，认知成本高。
- "分享" 走原生链接卡片，不带图，与持仓截图分享（图片分享）体验不一致。

目标（用户确认）：
1. **保存图片并入分享**：点「分享」生成报告图片后，弹出「保存到相册 / 转发给朋友」面板，不再单独留保存按钮。
2. **顶部只留 退出 + 分享 两个按钮，且固定在最上面**（常驻可见，滚动时不消失）。

## 方案

### 1. 顶部栏精简（`annual-report.wxml`）
- 左侧 `✕ 退出`（`bindtap="onClose"`，不变）。
- 右侧仅一个 `分享` 按钮（`bindtap="onShare"`，普通 view，不再用 `open-type="share"`）。
- 删除原独立的「保存图片」按钮与 `open-type="share"` 按钮；生成中显示「生成中...」。
- `.ar-top-bar` 本就是 `position: fixed`，位于 `top: statusBarHeight + navBarHeight`（避让微信胶囊），固定属性不变。

### 2. 分享逻辑合并（`annual-report.js`）
- 移除 `onExportImage` / `_saveToAlbum`，合并为 `onShare`：
  1. `exporting` 防抖 → 用离屏 canvas（`#arCanvas`）+ 现有 `_drawReport` 画报告 → `wx.canvasToTempFilePath` 出临时图。
  2. 出图后调用 `showShareActions(tempFilePath)`（来自 `utils/render/shareHelper`）。

### 3. 复用分享面板（`utils/render/shareHelper.js`）
- 把私有的 `_showShareActions` 重命名为 **导出** 的 `showShareActions(imagePath)`，`sharePortfolio` 改为调用它；年度报告组件 `require` 复用同一套面板与相册授权/去设置逻辑，不重复实现。

### 4. 页面侧（`pages/stats/stats.js`）
- 浮层内分享改为图片分享，不再触发原生链接卡片。
- 保留 `onShareAppMessage`（微信右上角「…」菜单分享 stats 页链接，作为兜底，无副作用）。

### 5. 样式（`annual-report.wxss`）
- `.ar-export-btn` 系列改名为 `.ar-share-btn` 系列（含 `.ar-share-text`，移除 `.ar-export-icon`）。
- `.ar-top-bar` 增加一层极淡顶部渐隐背景（`linear-gradient` 从 `rgba(250,250,252,0.96)` 到透明），避免滚动内容在按钮缝隙处穿帮，同时保证退出/分享常驻可读。

## 校验
- `npx biome lint` 改动文件 0 error / 0 warning。
- `npm test`：21 套件 / 145 用例全绿（canvas 逻辑走 mock wx，行为不变；无回归）。

## 风险与注意
- 图片分享依赖 `wx.shareImageMessage`，低版本基础库可能不支持；`showShareActions` 已对此降级为「保存到相册并提示手动转发」。
- `open-type="share"` 移除后，浮层内不再有原生分享卡片入口；若需链接分享可走微信「…」菜单（仍由 `onShareAppMessage` 提供）。
