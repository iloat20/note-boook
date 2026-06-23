# 架构去重第一阶段：消除架构裂缝

> **日期**: 2026-06-24
> **类型**: 纯重构（不改变功能行为）
> **目标**: 消除项目中四类一致性裂缝，让已设计好但未落地的抽象（feedback/errors/pageMixin）贯通，提升架构优雅度。

---

## 1. 背景与动机

项目已具备良好的分层骨架（storageCore → models → services → pages），缓存/性能/异步鲁棒性均有持续投入。但存在四类「同一意图被实现 N 遍」的架构裂缝，破坏了一致性：

1. **删除确认逻辑重复 5 处** —— `showModal → 确认 → (动画) → 删除 → reload` 模式散落在 history/detail/index，动画定时器命名各异。
2. **子包页面 pageMixin 采用不一致** —— detail/record/dividend 手写 navBar 数据、各自用不同方式消费 dirty flag，与三个 tab 页风格割裂。
3. **表单逻辑双份实现** —— record.js (Page) 与 quick-record.js (Component) 重复费用计算、卖出校验、自动拉价（防抖+去重）、市场检测。
4. **CLAUDE.md 文档与代码脱节** —— 引用不存在的 `utils/constants/config.js` 与 `errorCodes.js`，与权威的 AGENTS.md 及实际代码冲突。

### 1.1 设计原则

- **只消除重复、不改变行为**：每一项完成后，功能行为必须与现状完全一致。
- **不碰 WXML**：本次只做 JS 层逻辑重构，不动模板结构、动画字段名。
- **YAGNI 边界**：不触碰计算逻辑（xirr/feeCalculator）、不统一错误处理风格、不补测试——这些属于后续阶段。

### 1.2 依赖顺序

```
① confirmDelete  ──┐
② pageMixin 统一 ──┼──→ 各自独立可提交，建议按编号顺序
③ tradeForm 抽取 ──┤
④ 文档修正 ────────┘
```

四项无强依赖，均可独立提交、独立验证。编号顺序仅为降低 PR 评审认知负荷。

---

## 2. 模块一：`confirmDelete` helper

### 2.1 问题

当前 5 处删除入口各自手写 `wx.showModal` 样板：

| 文件 | 函数 | 动画字段 | 动画延迟 |
|------|------|----------|----------|
| `pages/history/history.js` | `batchDelete` | 无 | 无（直接 loading） |
| `pages/history/history.js` | `showActions` | `dissolvingId` | 400ms |
| `packageDetail/pages/detail/detail.js` | `showTransactionActions` | `disTransId` | 400ms |
| `packageDetail/pages/detail/detail.js` | `showDividendActions` | `disDivId` | 400ms |
| `pages/index/index.js` | `onSwipeDelete` | `deletingId` | 400ms |

差异在「动画字段名」和「删除后回调」，相同的是 `showModal` 的标题/确认色/确认判定这层。

### 2.2 设计

新建 `utils/ui/confirmDialog.js`：

```javascript
// utils/ui/confirmDialog.js
/**
 * 确认删除弹窗。统一 history/detail/index 的删除确认入口。
 * 仅封装 wx.showModal 层；动画字段名和删除后回调由调用方处理
 * （各页面动画字段名不同，强统一会牵动 WXML，超出纯逻辑重构范围）。
 *
 * @param {Object} options
 * @param {string} [options.title="确认删除"]
 * @param {string} options.content        - 弹窗正文
 * @param {Function} options.onConfirm    - 用户确认后执行
 * @returns {void}
 */
function confirmDelete(options) {
  const { title = "确认删除", content, onConfirm } = options;
  wx.showModal({
    title,
    content,
    confirmText: "删除",
    confirmColor: "#FF3B30",
    success: (res) => {
      if (res.confirm && typeof onConfirm === "function") onConfirm();
    },
  });
}

module.exports = { confirmDelete };
```

设计要点：
- **同步调用，回调式**：不返回 Promise。原因是 `onConfirm` 内部往往要先 `setData(动画字段)` 再 `setTimeout`，Promise 化反而割裂。
- **不统一动画**：动画字段名差异留给调用方，本 helper 只消灭 `showModal` 样板（标题/确认色/确认判定，约 8 行/处）。

### 2.3 改造点

| 文件 | 函数 | 改动 |
|------|------|------|
| `utils/ui/confirmDialog.js` | — | **新建** |
| `history.js` | `batchDelete` | `wx.showModal({...})` → `confirmDelete({ content, onConfirm })` |
| `history.js` | `showActions` | 同上 |
| `detail.js` | `showTransactionActions` | 同上 |
| `detail.js` | `showDividendActions` | 同上 |
| `index.js` | `onSwipeDelete` | 同上 |

净效果：消除约 40 行重复的 `showModal` 样板。`showActionSheet`（编辑/删除二级菜单）保持原样，不在本次范围。

---

## 3. 模块二：子包页面接入 pageMixin

### 3.1 问题

| 页面 | navBar 初始化 | dirty 消费 |
|------|--------------|-----------|
| index/history/stats | `pageMixin.onLoadMixin` ✓ | `pageMixin.onShowMixin(this, N)` ✓ |
| detail | 手写 `getApp().getNavBarInfo()` | `pageMixin.consumeDirtyFlag()`（绕过 mixin 入口） |
| record | 手写 `getApp().getNavBarInfo()` | ✗ 不消费 |
| dividend | 手写 `getApp().getNavBarInfo()` | ✗ 不消费 |

三个子包页面都能复用 mixin，当前是「能复用却没复用」。

### 3.2 设计

扩展 `utils/ui/pageMixin.js`，新增子包页面专用入口：

```javascript
// utils/ui/pageMixin.js（新增导出）
/**
 * 子包页面 onShow 公共逻辑：消费 dirty 标记（不设 TabBar）。
 * 供 detail/record/dividend 等非 tab 页面使用。
 * @param {Object} page - 页面实例（this）
 * @returns {boolean} 数据是否需要刷新
 */
function onShowSubPackage(page) {
  return consumeDirtyFlag();
}
```

- **复用 `consumeDirtyFlag`**：子包页面不设 TabBar 选中态（tab 页才需要），其余与 tab 页一致。
- **record/dividend 接入 dirty 消费**：当从其他页面返回且数据变更时，刷新表单辅助数据。

### 3.3 record/dividend 的 dirty 刷新策略（关键）

record/dividend 是**表单页**，dirty 刷新必须遵守「不覆盖用户正在填写的字段」：

- **编辑态（`isEdit === true`）**：dirty 时**不刷新**——用户正在编辑某条记录，刷新会覆盖其修改。
- **新增态（`isEdit === false`）**：dirty 时刷新**辅助数据**：
  - record：`allStrategies`（策略标签列表，可能因其他页面新增自定义策略而变化）、卖出默认持仓数量。
  - dividend：`stockOptions`（股票下拉列表，可能因新增股票而变化）。
- **绝不刷新**：`code/name/price/quantity/fee/date/...` 等用户输入字段。

实现上，在 record/dividend 各自新增一个轻量的 `_refreshAuxData()` 方法。**保守策略：只刷新下拉列表/标签类辅助数据，绝不触碰用户输入字段。**

```javascript
// record.js
_refreshAuxData() {
  // 只刷策略标签列表（其他页面可能新增了自定义策略）
  // 不触碰 code/name/price/quantity/fee 等任何用户输入字段
  this.setData({ allStrategies: Strategy.getAll() });
}

// dividend.js
_refreshAuxData() {
  // 只刷股票下拉列表（其他页面可能新增了股票）
  // 不触碰 perShare/qty/shareQty/date/note 等输入字段
  this._loadStocks();
}
```

**明确边界**：SELL 默认数量（`_fillSellDefaults`）是 `onLoad` 的一次性行为，**dirty 刷新时不重新触发**——因为用户可能已手动改过 quantity，回填会覆盖其修改。dirty 刷新只更新下拉/标签类辅助数据。

### 3.4 改造点

| 文件 | 改动 |
|------|------|
| `pageMixin.js` | 新增并导出 `onShowSubPackage` |
| `detail.js` | data 用 `initPageData()`；`onLoad` 改 `onLoadMixin(this)`；`onShow` 改 `onShowSubPackage(this)` |
| `record.js` | data 用 `initPageData()`；`onLoad` 改 `onLoadMixin(this)`；新增 `onShow` 调 `onShowSubPackage` + `_refreshAuxData` |
| `dividend.js` | data 用 `initPageData()`；`onLoad` 改 `onLoadMixin(this)`；新增 `onShow` 调 `onShowSubPackage` + `_refreshAuxData`（刷新 stockOptions） |

---

## 4. 模块三：`tradeForm` 抽取（纯函数 + 工厂）

### 4.1 问题

record.js (Page) 与 quick-record.js (Component) 重复以下逻辑：

| 重复逻辑 | record.js | quick-record.js |
|----------|-----------|-----------------|
| 成交额/实际金额公式 | `_calcFee` 内联 | `_calcQrFee` 内联 |
| 卖出校验 | `submit` 内联 | `submitQuickRecord` 内联 |
| 自动拉价（防抖+去重+应用） | `_scheduleAutoFetch`/`_tryAutoFetch` | `_scheduleAutoFetch`/`_tryAutoFetch` |
| 市场检测 | `selectMarket`（显式切换） | `_detectMarket`（代码推断） |

差异在于：record 是 Page、quick-record 是 Component（`this` 语义不同），字段前缀不同（`code` vs `qrCode`）。

### 4.2 设计

新建 `utils/helpers/tradeForm.js`，提供**纯逻辑共享，不动各自的 Page/Component 结构**：

```javascript
// utils/helpers/tradeForm.js

/**
 * 计算成交额
 * @param {string|number} price
 * @param {string|number} qty
 * @returns {number}
 */
function calcTradeAmount(price, qty) {
  return (parseFloat(price) || 0) * (parseInt(qty, 10) || 0);
}

/**
 * 计算实际金额（买入加手续费，卖出减手续费）
 * @param {"BUY"|"SELL"} type
 * @param {number} tradeAmount
 * @param {number} fee
 * @returns {number}
 */
function calcActualAmount(type, tradeAmount, fee) {
  return type === "BUY" ? tradeAmount + fee : tradeAmount - fee;
}

/**
 * 卖出校验。返回 { ok: boolean, error?: string }。
 * @param {Object|null} stock  - 已存在的股票（Stock.getByCode 结果）
 * @param {number} qty         - 卖出数量
 * @param {Object} [opts]
 * @param {number} [opts.ignoreTransactionId] - 编辑时忽略某交易
 * @returns {{ ok: boolean, error?: string }}
 */
function checkSellable(stock, qty, opts = {}) {
  if (!stock) return { ok: false, error: "暂无可卖持仓" };
  const sellable = getSellableQuantity(stock.id, opts.ignoreTransactionId);
  if (parseInt(qty, 10) > sellable) return { ok: false, error: "卖出数量超过持仓" };
  return { ok: true };
}

/**
 * 自动拉价工厂。封装防抖 + 去重 + 请求 + 清锁的状态机。
 * 通过 config.apply 让调用方绑定自己的字段名。
 *
 * @param {Object} config
 * @param {Function} config.isValid   - (code) => boolean，代码是否有效
 * @param {Function} config.fetchPrice - (code) => Promise<{name, currentPrice}>
 * @param {Function} config.apply     - (result, code) => void，应用结果（各自 setData）
 * @param {Function} config.onDone    - () => void，请求结束回调（清除 loading 态等，可选）
 * @returns {{ scheduleFetch: Function, doFetch: Function, clear: Function }}
 */
function createAutoFetcher(config) {
  let timer = null;
  let fetchingCode = null;

  function doFetch(code) {
    if (!code || !config.isValid(code)) return;
    if (fetchingCode === code) return;
    fetchingCode = code;

    config.fetchPrice(code)
      .then((data) => {
        if (data) config.apply(data, code);
      })
      .catch(() => {})
      .then(() => {
        fetchingCode = null;
        if (config.onDone) config.onDone();
      });
  }

  function scheduleFetch(code, delay) {
    clear();
    if (!code || !config.isValid(code)) return;
    timer = setTimeout(() => doFetch(code), delay);
  }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  return { scheduleFetch, doFetch, clear };
}

module.exports = {
  calcTradeAmount,
  calcActualAmount,
  checkSellable,
  createAutoFetcher,
};
```

### 4.3 设计要点

- **`createAutoFetcher` 隔离字段差异**：record 调 `apply(data) => this.setData({name: data.name, price: ...})`，quick-record 调 `apply(data) => this.setData({qrName: ...})`。共享的是状态机，不是 setData。
- **`.catch(() => {})` 保留**：当前两处都是静默吞错（自动拉价失败不报错，符合「可选增强」语义）。错误处理统一留到第二阶段。
- **保留 `this._fetchTimer`/`this._afTimer` 清理**：工厂返回的 `clear()` 由各页面在 `onUnload`/`detached` 调用，定时器生命周期不变。
- **不抽市场检测**：record 是显式切换市场（用户点 tab），quick-record 是代码推断（`_detectMarket`），语义不同，不强抽。

### 4.4 改造点

| 文件 | 改动 |
|------|------|
| `tradeForm.js` | **新建**（4 个导出） |
| `record.js` | `_calcFee` 用 `calcTradeAmount`/`calcActualAmount`；`submit` 卖出校验用 `checkSellable`；`_scheduleAutoFetch`/`_tryAutoFetch` 用 `createAutoFetcher` |
| `quick-record.js` | `_calcQrFee` 同上；`submitQuickRecord` 卖出校验同上；`_scheduleAutoFetch`/`_tryAutoFetch` 用 `createAutoFetcher` |

净效果：消除约 60 行重复的防抖/去重/费用公式代码。字段名、setData 调用、Page/Component 结构均不变。

---

## 5. 模块四：CLAUDE.md 文档修正

### 5.1 问题

- `CLAUDE.md:104,146,211` 引用 `utils/constants/config.js`——**该文件不存在**（全仓 Glob 零结果）。
- `CLAUDE.md:103-107` 提到 `errorCodes.js`——**该文件不存在**。
- `CODE_REVIEW_REPORT.md` 的修复示例也引用了不存在的 `config.js`。
- AGENTS.md（权威）已正确指出「config.js does not exist — use constants/index.js」。

### 5.2 改造点

| 文件 | 改动 |
|------|------|
| `CLAUDE.md` | `config.js` → `index.js`；删除 `errorCodes.js`，改为 `errors.js` 的 `AppError` 子类；同步「GOTCHAS」段落 |
| `CODE_REVIEW_REPORT.md` | 修复示例中的 `config.js` 引用 |

实际配置位置：`utils/constants/index.js`（导出 `MARKETS/TRANSACTION_TYPE/FEE_CONFIG/DEFAULT_STRATEGIES/TIMING_CONFIG`）。错误类型：`utils/errors.js`（`AppError` 基类 + `ValidationError/NotFoundError/NetworkError/CalculationError` 子类，错误码在 `AppError.code` 字段）。

---

## 6. 验证策略

每项改动后执行：

1. **Lint 通过**：`npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`
2. **测试不回归**：`npm test`（现有 4 个测试：memory/portfolio/stockPrice/colorRhythm）
3. **行为核对**（人工，覆盖改动路径）：
   - 删除：history 单条/批量删除、detail 删交易/分红、index 删股票——流程与提示不变
   - 详情页：从记录页返回 detail，价格/持仓刷新正常
   - 表单：record 新增/编辑交易、quick-record 快速添加——费用、卖出校验、自动拉价行为不变
   - 分红：dividend 新增/编辑——股票下拉列表 dirty 后更新

---

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `createAutoFetcher` 行为与原 `_tryAutoFetch` 细微差异（如清锁时机） | 工厂内 `.then().catch().then()` 保证 fetchingCode 清除；保留 `onDone` 回调清除 loading 态 |
| record/dividend dirty 刷新误覆盖用户输入 | `_refreshAuxData` 白名单机制：只刷 `allStrategies`/`stockOptions`，不碰输入字段；编辑态完全不刷新 |
| detail `onShowSubPackage` 改动影响现有 `_dataLoaded` 逻辑 | detail 已用 `consumeDirtyFlag() || !_dataLoaded`，`onShowSubPackage` 直接返回 `consumeDirtyFlag()` 结果，逻辑等价 |

---

## 8. 不在本次范围（后续阶段）

- 统一错误处理风格（推广 `feedback.catchError`，删除 `.catch(()=>{})`，xirr 抛 `CalculationError`）——第二阶段
- 魔法数字收敛到 constants——第二阶段
- xirr/feeCalculator/positionCalculator 补测试——第三阶段（TDD）
- markdown.js 转义补全——第三阶段
- positionCalculator `else` 改 `else if (SELL)`——第三阶段
- 时区策略统一——第三阶段
