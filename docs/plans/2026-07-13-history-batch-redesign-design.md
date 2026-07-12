# 流水页「全部 / 转入 / 转出 + 批量」UI 重做设计

> 日期：2026-07-13
> 状态：Design Approved（待实现）
> 范围：纯 UI/UX 重做（不新增批量操作类型，保留 全选 + 删除）

## 1. 背景与目标

### 当前问题
流水页（`pages/history/`）存在两处明显的设计割裂与两个交互硬伤：

1. **筛选区语言不统一**：`全部/转入/转出` 用 `liquid-slider` 胶囊滑块，而「批量」入口与策略筛选挤在同一行**下划线 chips** 里，风格脱节。
2. **批量栏空间脱节**：批量操作是一条 `position:fixed` 的**底部通栏白条**（`z-index:998`），与顶部筛选在视觉/空间上割裂，且未使用全站毛玻璃语言。
3. **全选只覆盖可见项**（`history.js` `toggleSelectAll` 仅遍历 `this.data.groupedHistory`，即当前展开页）。
4. **切换筛选清空选择**（`_applyFilters` 在 `selectedIds.length>0` 时整体清空）。

### 目标（用户确认）
- ✅ 视觉一致性：筛选区与批量栏统一到现有毛玻璃 / XHS feed 设计语言（`--xhs-*` 变量体系）。
- ✅ 交互硬伤修复：全选跨页、切筛选保留选择并重算。
- ✅ 版式重构：吸顶筛选 + 右上「选择」按钮 + 底部毛玻璃胶囊批量栏。

### 非目标（本设计不做）
- 不新增批量操作类型（导出 / 打标签 / 标记结清等）。
- 不动 `recordView.js` 的类型文案（转入/转出/其他收益）与数据层（models/services）。
- 不做批量录入（对应可用性报告 P0「批量交易模板」，另行立项）。

## 2. 版式方向（已选：方案 A）

**吸顶分段筛选 + 右上「选择」按钮 + 底部毛玻璃胶囊批量栏。**

## 3. 布局规范

### 3.1 顶部筛选区（吸顶 + 统一语言）
- 保留 `liquid-slider`（`filterTabs: 全部/转入/转出`），外层包**吸顶容器**：
  - `position: sticky; top: <导航栏高度>`（由 `pageMixin` 提供的 `statusBarHeight + navBarHeight`）。
  - 背景 `var(--xhs-bg)` + 轻微 `backdrop-filter: blur(...)`，与导航栏玻璃质感呼应。
- 右侧新增**「选择」按钮**（方框图标 `batch-icon` + 文字），与分段同一行右对齐；点击 `toggleSelectMode()` 进入批量态，按钮态切换为「取消」。取代原埋在策略 chips 里的 `chip-batch` 入口。
- **策略筛选降级为次级行**：分段下方一行横滑 chips（`activeStrategies`），仅 `length>0` 时显示；用更小更淡的次级 chip 样式，与分段拉开层级。
- 搜索栏保持在标题下、随页面滚动（不吸顶），避免三层吸顶过挤。

### 3.2 列表 & 选择态视觉
- 进入 `selectMode`：卡片左移露出左侧 checkbox 列（沿用 `.record-checkbox`），选中态 `.record-card-selected` 用 `var(--xhs-primary-bg)` 浅底。
- checkbox 沿用 `.xhs-checkbox`（毛玻璃圆角勾选，主色 `var(--xhs-primary)`），保持全站一致。
- 列表在 `scroll-view` 内滚动；吸顶筛选在顶部、批量栏在底部浮层**互不遮挡**。底部占位高度随新栏高微调（原 `300rpx` → 匹配胶囊栏高度 + 安全区）。

### 3.3 底部毛玻璃批量栏（全新）
- 替换现有 `.batch-bar`（纯白通栏 + 上边框）→ **浮起胶囊条**：
  - `position: fixed; bottom: calc(104rpx + env(safe-area-inset-bottom)); left/right: var(--page-margin);`
  - `border-radius: var(--xhs-radius-pill)`
  - 背景 `rgba(255,255,255,.72) + backdrop-filter: blur(20rpx)` + 阴影 `var(--xhs-elevation-3)`，与导航栏同款玻璃。
- 布局：`[全选 ☑]   [已选 N · 共 M]   [删除]   [取消]`
  - 删除 = 主色胶囊按钮（`.batch-btn-delete`）；取消 = 文字按钮。
  - 全选勾选态：`N === M` 时勾选；否则空/半选。
- 进场：`slide-up`（已有 keyframe）+ 轻微 `scale`；退出：`slide-down` 收起（新增 keyframe 或复用）。

## 4. 交互逻辑修复（核心功能设计）

### 4.1 全选跨页 / 跨筛选
- `toggleSelectAll()` 改为遍历 **`this._allGroupedHistory`**（当前筛选后的全量结果，含未展开页），收集所有 `id` → `selectedIds` / `selectedTypeMap`。
- 效果：全选 = 当前筛选（全部 / 转入 / 转出）下**全部**记录，无论是否展开。
- 搜索关键词存在时，全选针对搜索结果集（`_allGroupedHistory` 已含搜索过滤）。

### 4.2 切筛选不清空、重算全选态
- `_applyFilters()` 删除"清空选择"逻辑（现 lines 114–117）。
- 筛选后重算 `selectAll`：取当前筛选内全部 id 集合，若 `selectedIds` 包含其中每一个 → `selectAll = true`，否则 `false`。
- 跨筛选已选 id 保留并计入"已选 N"（如「全部」下选了若干，切到「转出」仅显示转出项的选中态，但 N 仍含全部已选）。

### 4.3 删除安全
- `batchDelete()` 保留"只删当前筛选/可见范围内 id"的保护（防误删不在当前视图的记录）。
- 因全选已限定当前筛选，删除范围 = `selectedIds` 中属于当前筛选的 id。
- 确认文案：`确定要删除选中的 N 条记录吗？`

## 5. 涉及文件

| 文件 | 改动 |
|------|------|
| `pages/history/history.wxml` | 筛选区加吸顶容器 + 右上「选择」按钮；策略降次级行；底部批量栏改胶囊结构 |
| `pages/history/history.wxss` | 吸顶容器、选择按钮、次级 chip、毛玻璃胶囊批量栏、slide-down 动效 |
| `pages/history/history.js` | `toggleSelectAll` 遍历 `_allGroupedHistory`；`_applyFilters` 去掉清空、加重算 `selectAll`；「选择」按钮态 |
| `styles/common.wxss` | 如需新增玻璃/胶囊 token（优先复用现有 `--xhs-*`） |
| `components/liquid-slider` | 不修改（仅外层包裹吸顶） |

## 6. 测试 / 回归

- `npm test`（127 用例）不受影响（仅改 history 页面 UI + selectMode 逻辑，models/services 不变）。
- 建议补 1–2 个针对 `toggleSelectAll`（跨页全选数量）、切筛选后 `selectAll` 重算的 Jest 测试（mock `wx`）。
- `npx biome lint pages/ utils/ components/ packageDetail/ packageRecord/` 通过。
- 手动验证清单：
  1. 三档筛选下点「全选」→ 数量 = 该筛选全量（含未展开页）。
  2. 「全部」全选后切「转出」→ 转出项保持选中、已选 N 正确、全选勾选态按转出重算。
  3. 底部批量栏为毛玻璃胶囊、与导航栏质感一致；进场/退场动效正常。
  4. 删除只删当前筛选范围内记录，确认文案数量正确。

## 7. 后续（可选，不在本设计）
- 批量操作扩展（导出 / 打标签 / 标记结清）。
- 批量录入（可用性报告 P0）。
- 资金流水追踪（P1）。
