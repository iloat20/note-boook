# 股票详情页 UI 全局重排设计

## 概述

对 `packageDetail/pages/detail/` 进行全局 UI 重排，将原有 5 个扁平卡片压缩为 "Hero 区 → 数据面板 → 列表区" 三个视觉层次，与首页金色汇总卡风格保持一致。

## 设计原则

- 沿用项目设计令牌系统（app.wxss CSS 变量），不新增令牌
- 沿用现有动画系统（animate-stagger 错帧入场）
- 卡片统一使用 `--page-margin` 左右边距、`--xhs-radius-md` 圆角、`--xhs-elevation-2` 阴影
- 编辑模式交互逻辑不变，仅视觉层调整

## 1. Hero 区（标题栏 + 价格 + 总盈亏合并）

### 布局

返回按钮悬浮左上角（56rpx 圆形，不变）。股票信息三层纵向排列：

- **第一行**：`[market-tag] 股票名称  股票代码  [编辑按钮]` 横排。编辑按钮移到行尾，pill 形状，比现有更低调
- **第二行**：当前价格，`--xhs-font-5xl`（80rpx），`--xhs-weight-bold`，`--xhs-title` 色，`letter-spacing: -0.02em`，作为页面视觉锚点
- **第三行**：总盈亏金额（`--xhs-font-2xl`，44rpx，加粗，盈亏着色）+ 收益率 badge（pill，盈亏着色背景）

### 背景

Hero 卡片加微妙暖色渐变底色，与首页 summary-card 的 `radial-gradient` 装饰风格呼应：

- 盈利：暖金色调渐变（`radial-gradient` 从右上，`rgba(255,215,0,0.08)` 到透明）
- 亏损：冷绿色调（`radial-gradient` 从右上，`rgba(0,170,0,0.06)` 到透明）
- 平盘：默认白底无渐变

### 间距

卡片内 padding：上方 40rpx、下方 36rpx、左右 `--page-margin`。与下方数据面板间距 `--xhs-space-lg`（32rpx）。

### 入场动画

`animate-stagger stagger-delay-1`

## 2. 数据面板（持仓摘要 + 盈亏明细合并）

合并原有两个独立卡片为一个 "数据面板" 卡片。

### 上半部分：持仓摘要

2 列 grid 布局，每格 label 在上、value 在下：

- 左列：持股数量、持仓市值
- 右列：平均成本、当前价格
- label：`--xhs-font-xs`，`--xhs-caption` 色
- value：`--xhs-font-xl`（36rpx），`--xhs-weight-bold`，`--xhs-title` 色
- 带货币单位前缀（¥/HK$/$）和 "股" 后缀，后缀用 `--xhs-font-sm` `--xhs-caption` 色

### 分割

中间 `1px solid var(--xhs-divider)` 水平分割线，左右各留 `--page-margin` 内边距。

### 下半部分：盈亏明细

横向 4 等分 grid：浮动盈亏 / 已实现盈亏 / 分红收入 / 总盈亏。

- 每格纵向排列：label（`--xhs-font-xs`，`--xhs-caption` 色）在上，value（`--xhs-font-lg`，30rpx）在下
- 盈亏着色：盈利 `--xhs-profit`，亏损 `--xhs-loss`，分红 `--xhs-dividend`
- 总盈亏格 value 字号提升到 `--xhs-font-xl`（36rpx）突出

### 编辑模式

编辑模式在面板底部展开（分割线 + input 区域 + 保存/取消按钮），样式与现有 edit-actions 一致，不变。

### 间距

与下方交易记录卡片间距 `--xhs-space-md`（24rpx）。

### 入场动画

`animate-stagger stagger-delay-2`

## 3. 交易记录列表

### 卡片 header

保持不变：标题 "交易记录" + 右侧 "添加" pill 按钮。

### 记录条目

每条记录改为两到三行式卡片布局：

- **第一行**：左侧 `[买入/卖出标签] + 日期`，右侧 `单价`（`--xhs-font-md`，加粗，买入红色/卖出绿色）+ `总金额`（`--xhs-font-sm`，`--xhs-caption` 色，在价格下方）
- **第二行**：左侧 `数量`（`--xhs-font-sm`），右侧 `手续费`（`--xhs-font-xs`，`--xhs-caption-light` 色，仅 fee > 0 时显示）
- **第三行**（条件）：策略标签 + 交易理由，用 `--xhs-bg-secondary` 浅灰底色条包裹，圆角 `--xhs-radius-sm`，内边距 `12rpx 16rpx`，和数据行视觉分离

### 条目间距

记录之间从 `1px divider` 改为 `8rpx` 间距 + 极细分割线（`1px solid var(--xhs-divider)`），让每条记录有独立的 "块" 感。第一条记录无上边框。

### 删除动画

保持现有 dissolve-out 动画不变（400ms slide-right + fade + height collapse）。

### 入场动画

`animate-stagger stagger-delay-3`

## 4. 分红记录列表

### 卡片 header

保持不变：标题 "分红记录" + 右侧 "添加" pill 按钮。

### 记录条目

每条分红记录三行布局：

- **第一行**：`[分红标签] + 日期`
- **第二行**：`每股分红 × 股数`（`--xhs-font-sm`，`--xhs-caption` 色）
- **第三行**：总金额（`--xhs-font-xl`，加粗，`--xhs-dividend` 金色）

### 条目间距

同交易记录：`8rpx` 间距 + 极细分割线。

### 删除动画

保持现有 dissolve-out 动画不变。

### 入场动画

`animate-stagger stagger-delay-4`

## 5. 策略复盘

### 布局

每条策略改为紧凑行：

- 左侧：策略 pill 标签（`--xhs-primary-bg` 背景，`--xhs-primary` 色）
- 右侧：上下两行 — 上面盈亏金额（`--xhs-font-md`，加粗，盈亏着色），下面笔数（`--xhs-font-xs`，`--xhs-caption` 色）

### 间距

行间距从 12rpx 加到 16rpx，行间 `1px solid var(--xhs-divider)` 分割线保持不变。

### 入场动画

`animate-stagger stagger-delay-5`

## 6. 页面整体节奏

从上到下：

```
Hero 区（渐变背景）
  └─ --xhs-space-lg (32rpx)
数据面板（白卡）
  └─ --xhs-space-md (24rpx)
交易记录（白卡）
  └─ --xhs-space-md (24rpx)
分红记录（白卡）
  └─ --xhs-space-md (24rpx)
策略复盘（白卡，条件渲染）
  └─ 底部留白 60px
```

所有卡片统一：`--page-margin` 左右边距、`--xhs-radius-md` 圆角、`--xhs-elevation-2` 阴影。

## 7. 不变的部分

- 编辑模式 JS 逻辑不变
- 数据获取和计算逻辑不变
- quick-record 组件交互不变
- 导航返回逻辑不变
- 策略标签组件（strategy-tags）不变
- 空状态组件（empty-state）不变
- 底部 spacer 保持 60px

## 8. 影响范围

- `packageDetail/pages/detail/detail.wxml` — 模板重构
- `packageDetail/pages/detail/detail.wxss` — 样式重构
- `packageDetail/pages/detail/detail.js` — 可能需新增 Hero 背景色计算逻辑（根据盈亏状态设置 CSS 变量或 class）
- 不新增组件，不修改组件接口
