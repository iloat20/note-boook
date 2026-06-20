# 动态金色节奏色彩体系 · 设计文档

- **日期**：2026-06-21
- **状态**：已通过设计评审，待写实施计划
- **范围**：微信小程序 note-boook 的金色色彩系统动态化重构（第 1 期）

## 1. 背景与动机

### 1.1 现状问题

项目已有完整的 CSS 变量体系（`--xhs-*`，60+ 变量，集中定义于 `app.wxss`），但金色与渐变是**硬编码孤岛**，绕过了变量系统：

| 硬编码位置 | 值 | 问题 |
|---|---|---|
| `pages/index/index.wxss:80` | `.summary-value { color: #D4A017 }` | 孤儿深金色，无对应令牌 |
| `pages/index/index.wxss:145,152` | `.share-btn` `#FFF8E1` / `#FFE082` | Material 金色，无变量 |
| `pages/index/index.wxss:158` | 持仓卡渐变 `#FFFEFB → #FFFCF5` | 无变量 |
| `pages/index/index.wxss:160-163` | 卡片金边/阴影 `rgba(255,184,0,...)` | 等价 `--xhs-market-hk` 但未引用 |
| `pages/index/index.wxss:58` | 径向光晕 `rgba(255,215,0,0.08)` | 无变量 |
| `pages/index/index.wxss:71,90,114,122,128,132` | `#999999` / `#F0F0F0` 等 | 等价已有 `--xhs-*` 令牌但未引用 |
| `components/market-tag/index.wxss:29` | 港股 border `rgba(255,149,0,0.12)` | **过期值**（commit `2c594de` 已把 `255,149,0`→`255,184,0`，此处漏改） |
| `utils/constants/market.js:18` | `getMarketColor()` 港股返回 `#FF9500` | **旧橙值**（与 `app.wxss:55` 的 `#FFB800` 不同步） |

**港股色三处不同步**：`app.wxss:55`(`#FFB800`) vs `market-tag` border（旧值 `255,149,0`）vs `market.js`（旧橙 `#FF9500`）。

### 1.2 动态化机制现状

**完全没有**：
- 无 dark mode、无主题切换、无 `data-theme` 属性
- 无季节色、无场景化色彩
- WXML 中零动态内联样式，所有颜色来自静态 class
- `stats` 页 5 个 `cover-*` 渐变是按卡片语义固定，非动态切换

### 1.3 设计目标

把散落的金色收口进令牌，并在令牌层上建一套**分层叠加的动态金色节奏系统**——四类信号源各管一层，互不干扰，叠加形成综合色彩节奏，体现 2026 年"金色可动态切换的渐变体系"趋势。

## 2. 核心决策（评审记录）

| # | 决策点 | 选定 | 理由 |
|---|--------|------|------|
| 1 | 信号源范围 | **E：时间 + 行为 + 数据 + 页面** 综合 | 全维度动态化 |
| 2 | 节奏形态 | **C+D：离散枚举 + 过渡动画 + 关键卡片流光** | 既稳又有惊艳感 |
| 3 | 信号合成模型 | **C：分层叠加**（各信号作用不同变量层） | 互不干扰、可独立调 |
| 4 | 时间段粒度 | **B：四段（晨/午/暮/夜）** | 节奏清晰，4 套色阶即可 |
| 5 | 夜间深度 | **A：浅夜**（仅金调变深，背景仍亮） | 聚焦金色节奏，不越界做 dark mode |
| 6 | 流光范围 | **B：事件级 + 交互反馈**（无常驻） | 可控能耗，用户能感知"色在响应" |
| 7 | 数据层范围 | **B：盈利增强 / 亏损收敛**（双向，3 档） | 双向反馈，金光明暗传达盈亏 |
| 8 | 页面语义层 | **A：不做页面 tint** | 聚焦时间/数据/事件/交互四层 |
| 9.1 | 色阶规模 | 4 套（时间）× 3 变量 + 3 档（数据）× 3 变量，分层正交无需枚举 12 种组合 | glow color 复用 gold-time，叠加靠 CSS 自然完成 |
| 9.2 | 时间切换时机 | **onShow + 每分钟轮询** | 跨段停留也能感知节奏 |

## 3. 架构总览

四类信号源各管一层独立变量，互不干扰：

```
┌─────────────────────────────────────────────────────────────┐
│                    动态金色节奏系统                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  信号源(4类)          作用层(独立变量)        视觉效果         │
│  ─────────────────   ──────────────────    ──────────────   │
│  ① 时间段             --xhs-gold-time-*      整页金调冷暖      │
│     (晨/午/暮/夜)     4套色阶                                 │
│                                                             │
│  ② 持仓盈亏           --xhs-card-glow-*     持仓卡金边/光晕   │
│     (盈/平/亏)        3档强度               明暗             │
│                                                             │
│  ③ 事件级             一次性 shimmer         1.5s 流光扫过    │
│     (涨停/分红/新高)   CSS keyframes         结束即消         │
│                                                             │
│  ④ 用户交互           局部 ::after 涟漪      按下/长按金光    │
│     (按下/长按/下拉)   :active 态            局部扩散         │
│                                                             │
│  [时间层 × 数据层 叠加] → 持仓卡最终呈现                       │
│  [事件层 / 交互层]     → 瞬时增强, 不改变基础调性              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

技术形态: 离散场景枚举 + CSS transition 平滑过渡
         (非连续插值, 无RAF循环)
```

### 3.1 四层各自的生命周期

| 层 | 触发 | 过渡 |
|----|------|------|
| 时间层 | `onShow` + 每分钟轮询 | 切段时 500ms ease |
| 数据层 | 持仓数据变化时重算 | 500ms ease |
| 事件层 | 事件触发即播 1.5s，自动清除 | CSS keyframes |
| 交互层 | CSS `:active` 原生驱动 | 无需 JS |

### 3.2 明确排除范围

- ❌ 不做 dark mode（决策 5：A，夜段仅金调变深，背景仍亮）
- ❌ 不做页面级 tint（决策 8：A）
- ❌ 不做常驻流光动画（决策 6：B）
- ❌ 不做连续色值插值（决策 2：C，离散枚举）
- ❌ 不做盈亏分级调参（决策 7：B，仅 3 档）

## 4. 令牌体系与色值

### 4.1 第 1 步：收口层令牌（修复现状不一致）

以 `app.wxss` 现有的 `--xhs-market-hk: #FFB800` 作为权威金色锚点，新增一组金色令牌族：

| 新增令牌 | 值 | 用途 |
|---|---|---|
| `--xhs-gold` | `#FFB800` | 权威金（= 现有 `--xhs-market-hk`） |
| `--xhs-gold-light` | `#FFCF40` | 提亮金（暗处用） |
| `--xhs-gold-dark` | `#E08500` | 沉金（= 现有 `--xhs-dividend-dark`） |
| `--xhs-gold-deep` | `#D4A017` | 深金文字（收口 `index.wxss:80`） |
| `--xhs-gold-bg` | `rgba(255,184,0,0.10)` | 金色背景底 |
| `--xhs-gold-bg-2` | `rgba(255,184,0,0.16)` | 金色背景底加强 |
| `--xhs-gold-halo` | `rgba(255,215,0,0.08)` | 金色光晕 |
| `--xhs-gold-50` | `#FFF8E1` | 浅金底色（收口 `index.wxss:145`） |
| `--xhs-gold-100` | `#FFE082` | 金色按钮（收口 `index.wxss:152`） |
| `--xhs-card-cream-from` | `#FFFEFB` | 持仓卡渐变起（收口 `index.wxss:158`） |
| `--xhs-card-cream-to` | `#FFFCF5` | 持仓卡渐变止 |

### 4.2 第 2 步：动态层令牌

**时间层 · 4 套金调**（决策 4：B）

| 变量名（运行时由 JS 写入） | 晨 `[5,9)` | 午 `[9,16)` | 暮 `[16,19)` | 夜 `[19,5)` |
|---|---|---|---|---|
| `--xhs-gold-time` | `#FFD180` | `#FFB800` | `#FF9A3C` | `#E08500` |
| `--xhs-gold-time-bg` | `rgba(255,209,128,0.10)` | `rgba(255,184,0,0.10)` | `rgba(255,154,60,0.10)` | `rgba(224,133,0,0.10)` |
| `--xhs-gold-time-halo` | `rgba(255,209,128,0.10)` | `rgba(255,215,0,0.08)` | `rgba(255,154,60,0.12)` | `rgba(224,133,0,0.14)` |

时段锚点（小时）：`morning=[5,9)`，`noon=[9,16)`，`dusk=[16,19)`，`night=[19,5)`

**数据层 · 3 档 glow 强度**（决策 7：B）

| 变量名 | 盈利 ↑ | 持平 | 亏损 ↓ |
|---|---|---|---|
| `--xhs-card-glow-opacity` | `0.22` | `0.10` | `0.04` |
| `--xhs-card-glow-blur` | `16px` | `8px` | `4px` |
| `--xhs-card-glow-color` | `var(--xhs-gold-time)` | `var(--xhs-gold-time)` | `var(--xhs-gold-time)` |

**关键设计**：`--xhs-card-glow-color` 复用时间层的 `--xhs-gold-time`，所以"时间 × 数据"两层自然叠加，**无需枚举 12 种组合**（决策 9.1）。

### 4.3 第 3 步：CSS 变量写入机制

**WXSS 基线**（`app.wxss` 的 `page` 选择器，`:root` 等价）：

```css
page {
  /* 动态层默认值（即便 JS 没跑，界面也正确 = 渐进增强） */
  --xhs-gold-time: var(--xhs-gold);
  --xhs-gold-time-bg: var(--xhs-gold-bg);
  --xhs-gold-time-halo: var(--xhs-gold-halo);
  --xhs-card-glow-opacity: 0.10;
  --xhs-card-glow-blur: 8px;
  --xhs-card-glow-color: var(--xhs-gold-time);

  /* 所有引用动态变量的元素自动跟随 */
}

/* 持仓卡：声明 transition，切换时平滑过渡 */
.position-card {
  transition: background-color 0.5s ease,
              border-color 0.5s ease,
              box-shadow 0.5s ease;
}
```

**JS 运行时改写**（每页 `onLoad` / `onShow` / 每分钟轮询）：

```js
// 注入到具体 page 根容器, 不污染全局
this.setData({
  goldVars: {
    '--xhs-gold-time': '#FF9A3C',
    '--xhs-card-glow-opacity': '0.22',
    // ...
  }
})
```

### 4.4 设计原则

1. **基线兜底**：WXSS 里给所有动态变量设默认值，即便 JS 没跑，界面也是正确的（渐进增强）
2. **分层正交**：时间变量和数据变量各自独立，组合时靠 CSS 自然叠加（glow color 引用 time），不用 JS 算最终色
3. **过渡在 CSS 层**：`transition` 声明在元素上，JS 只改值，过渡由小程序引擎处理，无 RAF 循环

## 5. 信号源计算逻辑

```
① 时间段判定  colorRhythm.getTimePhase()
─────────────────────────────────────────────
输入: Date.now()
输出: 'morning' | 'noon' | 'dusk' | 'night'
规则:
  h ∈ [5,9)   → morning
  h ∈ [9,16)  → noon
  h ∈ [16,19) → dusk
  else        → night
纯函数, 无副作用, 可单测

② 盈亏档位判定  colorRhythm.getProfitPhase(profitRate)
─────────────────────────────────────────────
输入: 持仓盈亏率 (浮点)
输出: 'up' | 'flat' | 'down'
规则:
  profitRate > 0    → up
  profitRate === 0  → flat
  profitRate < 0    → down
纯函数, 可单测

③ 事件触发  colorRhythm.triggerEvent(type, element)
─────────────────────────────────────────────
类型: 'limit-up' | 'dividend' | 'new-high'
行为: 给指定元素加 .gold-shimmer class
     1.5s 后自动移除 (setTimeout, 需记录清理)
非纯: 有定时器副作用

④ 交互反馈  纯 CSS, 无 JS
─────────────────────────────────────────────
持仓卡 :active → 局部 ::after 金光涟漪
长按 → 加 .long-press-glow class (JS 仅 toggle class)
下拉刷新 → 顶部金线 (已有刷新逻辑挂载)
```

## 6. JS 模块划分

遵循项目 `storageCore → models → services` 分层。

### 6.1 新建：`utils/constants/colorRhythm.js`

职责：四时段 × 各变量的色值映射表（纯数据，无逻辑）。

```js
module.exports = {
  TIME_PHASES: {
    morning: { '--xhs-gold-time': '#FFD180', /* ... */ },
    noon:    { '--xhs-gold-time': '#FFB800', /* ... */ },
    dusk:    { '--xhs-gold-time': '#FF9A3C', /* ... */ },
    night:   { '--xhs-gold-time': '#E08500', /* ... */ },
  },
  PROFIT_PHASES: {
    up:   { '--xhs-card-glow-opacity': '0.22', '--xhs-card-glow-blur': '16px' },
    flat: { '--xhs-card-glow-opacity': '0.10', '--xhs-card-glow-blur': '8px' },
    down: { '--xhs-card-glow-opacity': '0.04', '--xhs-card-glow-blur': '4px' },
  },
  TIME_RANGES: {
    morning: [5, 9],
    noon:    [9, 16],
    dusk:    [16, 19],
    // night 为兜底
  },
}
```

### 6.2 新建：`utils/services/colorRhythm.js`

职责：动态色彩节奏的总调度器。

```js
const { TIME_PHASES, PROFIT_PHASES, TIME_RANGES } = require('../constants/colorRhythm')

function getTimePhase(date = new Date()) { /* ... */ }   // 纯函数
function getProfitPhase(profitRate) { /* ... */ }          // 纯函数
function buildGoldVars(timePhase, profitPhase) { /* ... */ } // 返回对象
function applyToPage(pageCtx, vars) { /* ... */ }          // setData 注入
function startTimer(pageCtx) { /* ... */ }                 // 返回 timerId
function stopTimer(timerId) { /* ... */ }                  // 清理防泄漏

module.exports = {
  getTimePhase, getProfitPhase, buildGoldVars,
  applyToPage, startTimer, stopTimer,
}
```

### 6.3 页面接入示例（`pages/index/index.js`）

```js
const cr = require('../../utils/services/colorRhythm')

onLoad() {
  cr.applyToPage(this, cr.buildGoldVars(
    cr.getTimePhase(),
    cr.getProfitPhase(this.data.totalProfitRate)
  ))
  this._crTimer = cr.startTimer(this)
}

onUnload() {
  cr.stopTimer(this._crTimer)  // 防泄漏（呼应 commit 8f75819）
}

refreshPositions() {
  // ... 持仓刷新 ...
  cr.applyToPage(this, cr.buildGoldVars(
    cr.getTimePhase(),
    cr.getProfitPhase(newProfitRate)
  ))
}
```

### 6.4 为什么不做成全局 store

- 色彩节奏是**页面级视觉**，不同页面接入深度不同（index 详情更丰富、history 列表式）
- 注入到页面根容器（`page` 或顶层 view），作用域隔离，不污染其他页面
- 遵循项目现有模式：`pageMixin` 已是页面级混入，色彩节奏与之间构

## 7. 受影响文件清单

### 7.1 新建文件（3 个）

| 文件 | 内容 |
|---|---|
| `utils/constants/colorRhythm.js` | 四时段 × 变量色阶映射表 + 三档 glow + TIME_RANGES（纯数据） |
| `utils/services/colorRhythm.js` | `getTimePhase` / `getProfitPhase` / `buildGoldVars` / `applyToPage` / `startTimer` / `stopTimer`（调度器） |
| `utils/services/__tests__/colorRhythm.test.js` | 纯函数单测 + 定时器清理验证 |

### 7.2 收口硬编码（修复现状不一致）

**`app.wxss`**：
- 新增 `--xhs-gold-*` / `--xhs-card-cream-*` / `--xhs-gold-halo` / `--xhs-gold-deep` / 动态层变量基线默认值
- 新增 `.gold-shimmer` / `.long-press-glow` keyframes
- `--xhs-market-hk` 等保持，派生新族

**`pages/index/index.wxss`**：
- `:80` `.summary-value #D4A017` → `var(--xhs-gold-deep)`
- `:58` 径向光晕 `rgba(255,215,0,0.08)` → `var(--xhs-gold-halo)`
- `:145,152` share-btn `#FFF8E1` / `#FFE082` → `var(--xhs-gold-*)`
- `:158` 持仓卡渐变硬编码 → `var(--xhs-card-cream-*)`
- `:160-163` 卡片金边 / 阴影 → `var(--xhs-card-glow-*)`
- 持仓卡加 `transition` + `:active` 涟漪 `::after`

**`components/market-tag/index.wxss`**：
- `:29` 港股 border `rgba(255,149,0,0.12)` → `var(--xhs-gold-bg)`
- 修复：旧橙值未跟随 `2c594de` 提亮

**`utils/constants/market.js`**：
- `:18` 港股色 `#FF9500` → 改为读取统一金色源
- 修复：JS 层与 CSS 层脱节

### 7.3 页面接入（动态节奏注入）

**`pages/index/index.js`**：
- `onLoad`：初始化色彩节奏 + 启动每分钟轮询
- `onUnload`：清理定时器
- `refreshPositions`：持仓刷新后重算盈亏档
- `data` 增加 `goldVars` 绑定到根容器 style

**`pages/index/index.wxml`**：
- 根容器绑定 `style="{{goldVars}}"` 注入动态变量
- 持仓卡加 `:active` class / 长按事件钩子

### 7.4 测试

- 新建 `utils/services/__tests__/colorRhythm.test.js`
- `package.json` 的 test 覆盖范围已含 `utils/**/*.js`，无需改

## 8. 刻意不改的范围（边界控制）

| 范围 | 理由 |
|---|---|
| `stats` 页 5 个封面渐变（`stats.wxss:133-137`） | 卡片局部语义色（投资/回本/盈亏/收益率/分红），非金色节奏层 |
| `annual-report` 组件 | 独立色系（金银铜奖牌），与 `--xhs-*` 脱节是历史现状，不蔓延 |
| `detail` / `dividend` / `record` 页 | 第 1 期只接入 `index`，稳定后再推广 |
| Canvas 渲染层（`canvasRenderer` / `shareHelper`） | ECharts / 分享图不接入动态色，避免渲染层复杂度爆炸 |
| dark mode | 决策 5：A，不做 |

## 9. 实施分期

| 期 | 范围 | 验证 |
|---|---|---|
| **第 1 期（本 spec）** | 收口 + index 页接入 + 核心模块 | 四层节奏在首页完整可感知、硬编码消除、测试通过 |
| 第 2 期（后续 spec） | 推广到 detail / history / record 页 | 复用第 1 期模块，各页接入 `applyToPage` |
| 第 3 期（后续 spec） | 事件级信号源细化 | 涨停 / 分红 / 新高 的具体业务事件接入 |

## 10. 风险点

| # | 风险 | 缓解 |
|---|------|------|
| 1 | 小程序 `setData` 注入 CSS 变量的兼容性 | 验证 wx 基础库版本对 `style` 内 `var()` 注入的支持；兜底：WXSS 基线默认值保证 JS 没跑也不崩 |
| 2 | 每分钟轮询的电量影响 | `setInterval` 1 分钟，成本极低，`onUnload` 清理 |
| 3 | `:active` 涟漪在列表滚动时的性能 | 涟漪只在单卡 `:active` 时触发，不常驻，风险可控 |

## 11. 测试策略

遵循项目 Jest 模式（`utils/**/*.js`，Node 环境，全局 mock `wx` API）：

- `getTimePhase(date)`：mock 不同 `Date`，覆盖四个时段边界（4/5/8/9/15/16/18/19/23 时）
- `getProfitPhase(rate)`：正/零/负三档
- `buildGoldVars(time, profit)`：输出快照测试，验证时间×数据叠加正确
- `startTimer` / `stopTimer`：定时器创建/清理配对验证（防泄漏）
