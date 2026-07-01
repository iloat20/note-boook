# 性能优化实施规划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面优化微信小程序性能，消除数据冗余、优化动画、节流行情刷新、防护缓存污染、精简渲染资源。

**Architecture:** 基于 PERFORMANCE_AUDIT.md v2 的 5 步优化方案。第 1、2 步已完成（代码中已实现），本规划聚焦第 3、4、5 步的实际改动。

**Tech Stack:** 微信小程序（WXML/WXSS/JS）、wx.setStorageSync、LRU Cache

---

## 当前状态分析

| 步骤 | 状态 | 说明 |
|------|------|------|
| 1. 数据冗余 | ✅ 已完成 | `positions`/`_allPositions` 已移至 `this._positionsCache`/`this._allPositionsCache` |
| 2. 动画优化 | ✅ 已完成 | `animationHelper.js` 已简化为单次 setData |
| 3. onShow 节流 | ❌ 待实施 | 每次返回 tab 都触发 `force: true` 行情刷新 |
| 4. 缓存不可变性 | ❌ 待实施 | `getData()` 返回引用，外部可污染缓存 |
| 5. 渲染资源优化 | ❌ 待实施 | canvas 常驻、分包预加载过激、stagger 动画 |

---

## Task 1: onShow 行情刷新节流

**Files:**
- Modify: `pages/index/index.js:137-150`

- [ ] **Step 1: 添加最小间隔节流**

在 `onShow` 方法中添加 30s 节流逻辑：

```javascript
async onShow() {
  if (pageMixin.onShowMixin(this, 0)) {
    await this._loadData();
    // 添加/修改交易后自动获取一次现价，不区分交易时段，强制忽略缓存
    if (this._positionsCache && this._positionsCache.length > 0) {
      this._fetchPrices({ silent: true, force: true });
    }
  } else if (isTradingTime()) {
    // 交易时段正常刷新现价（带 30s 节流）
    if (this._positionsCache && this._positionsCache.length > 0) {
      const now = Date.now();
      if (now - (this._lastFetchAt || 0) > 30000) {
        this._fetchPrices({ silent: true });
        this._lastFetchAt = now;
      }
    }
  }
},
```

- [ ] **Step 2: 验证**

在微信开发者工具中测试：
1. 从详情页返回持仓 tab，观察 Network 面板
2. 30s 内多次切换 tab，确认不重复请求
3. 30s 后切回，确认正常刷新

---

## Task 2: 缓存不可变性防护

**Files:**
- Modify: `utils/storageCore/core.js:86-115`
- Create: `tests/storageFreeze.test.js`

- [ ] **Step 1: 修改 getData 返回冻结视图**

```javascript
function getData(key) {
  let data;
  if (_memCache.has(key)) {
    data = _memCache.get(key);
  } else {
    data = wx.getStorageSync(key);
    if (
      data === undefined ||
      data === null ||
      data === "" ||
      (Array.isArray(data) && data.length === 0)
    ) {
      if (key === PRICE_KEY) {
        data = {};
      } else {
        data = [];
      }
    }
    _memCache.set(key, data);
  }
  // 返回冻结的只读视图，防止外部修改污染缓存
  if (Array.isArray(data)) {
    Object.freeze(data);
    data.forEach((item) => {
      if (item && typeof item === "object") Object.freeze(item);
    });
  } else if (data && typeof data === "object") {
    Object.freeze(data);
  }
  return data;
}
```

- [ ] **Step 2: 修改 upsertAndSave 先复制再修改**

```javascript
function upsertAndSave(key, item, dirtyTags) {
  if (!item || item.id == null) {
    console.error("[upsertAndSave] Invalid item:", item);
    return item;
  }
  const list = getData(key).slice(); // slice 创建可写副本
  const index = list.findIndex((x) => x.id === item.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...item };
  } else {
    list.push(item);
  }
  saveData(key, list);
  if (dirtyTags) markDataDirty(dirtyTags, item.id);
  return item;
}
```

- [ ] **Step 3: 修改 deleteAndSave 先复制再修改**

```javascript
function deleteAndSave(key, id, dirtyTags) {
  const list = getData(key).slice(); // slice 创建可写副本
  const newList = list.filter((x) => x.id !== id);
  saveData(key, newList);
  if (dirtyTags) markDataDirty(dirtyTags, id);
}
```

- [ ] **Step 4: 创建 freeze 测试**

```javascript
// tests/storageFreeze.test.js
const core = require("../utils/storageCore/core");

describe("getData freeze", () => {
  beforeEach(() => {
    core.clearMemCache();
    wx.setStorageSync("test_key", [{ id: 1, name: "test" }]);
  });

  test("returns frozen array", () => {
    const data = core.getData("test_key");
    expect(Object.isFrozen(data)).toBe(true);
  });

  test("returns frozen objects inside array", () => {
    const data = core.getData("test_key");
    expect(Object.isFrozen(data[0])).toBe(true);
  });

  test("throws on direct mutation", () => {
    const data = core.getData("test_key");
    expect(() => {
      data.push({ id: 2 });
    }).toThrow(TypeError);
  });

  test("throws on object mutation", () => {
    const data = core.getData("test_key");
    expect(() => {
      data[0].name = "mutated";
    }).toThrow(TypeError);
  });
});

describe("upsertAndSave with frozen data", () => {
  beforeEach(() => {
    core.clearMemCache();
    wx.setStorageSync("test_key", []);
  });

  test("can upsert after freeze", () => {
    core.upsertAndSave("test_key", { id: 1, name: "a" });
    const data = core.getData("test_key");
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("a");
  });

  test("can update existing item", () => {
    core.upsertAndSave("test_key", { id: 1, name: "a" });
    core.upsertAndSave("test_key", { id: 1, name: "b" });
    const data = core.getData("test_key");
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("b");
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
npm test
```

预期：所有测试通过

- [ ] **Step 6: Commit**

```bash
git add utils/storageCore/core.js tests/storageFreeze.test.js
git commit -m "feat: getData returns frozen view to prevent cache pollution"
```

---

## Task 3: canvas 按需挂载

**Files:**
- Modify: `pages/index/index.wxml:173`
- Modify: `pages/index/index.js` (onSharePortfolio 相关)

- [ ] **Step 1: 修改 canvas 为 wx:if 按需挂载**

找到 `index.wxml` 中的 canvas 标签，添加 `wx:if`：

```xml
<canvas
  wx:if="{{generatingShare}}"
  type="2d"
  id="shareCanvas"
  style="position: fixed; left: -9999px; top: -9999px; width: 750px; height: 600px;"
/>
```

- [ ] **Step 2: 修改 onSharePortfolio 设置生成状态**

```javascript
onSharePortfolio() {
  this.setData({ generatingShare: true });
  _ensureShareModule();
  // 等待 canvas 挂载
  setTimeout(() => {
    _sharePortfolio(this);
  }, 50);
},
```

- [ ] **Step 3: 在分享完成后重置状态**

在 `shareHelper.js` 的分享完成回调中（或 `onSharePortfolio` 中），添加：

```javascript
// 分享完成后重置
this.setData({ generatingShare: false });
```

- [ ] **Step 4: 验证**

在微信开发者工具中测试分享功能正常

---

## Task 4: 分包预加载收敛

**Files:**
- Modify: `app.json:13-20`

- [ ] **Step 1: 修改 preloadRule**

```json
"preloadRule": {
  "pages/index/index": {
    "packages": ["packageDetail"]
  }
}
```

移除 `history` 和 `stats` 的预加载规则。

- [ ] **Step 2: 验证**

1. 首次进入小程序，观察 Network 面板
2. 确认只下载主包 + packageDetail
3. 进入流水/统计页时按需加载 packageRecord

---

## Task 5: 入场动画精简

**Files:**
- Modify: `pages/index/index.wxml:21,31,65,74`

- [ ] **Step 1: 移除列表项的 stagger 动画**

在 `index.wxml` 中，移除 `scroll-container` 的 stagger class：

```xml
<!-- 修改前 -->
<scroll-view wx:if="{{positionCount > 0}}" class="scroll-container {{tabAnimating ? 'tab-content-exit' : ''}} {{entranceDone ? '' : 'animate-stagger stagger-delay-4'}}" ...>

<!-- 修改后 -->
<scroll-view wx:if="{{positionCount > 0}}" class="scroll-container {{tabAnimating ? 'tab-content-exit' : ''}}" ...>
```

- [ ] **Step 2: 保留 summary 区 fade-in**

确认 summary-card 的 `stagger-delay-2` 保留，只移除列表的 stagger。

- [ ] **Step 3: 验证**

1. 首屏加载时观察动画效果
2. summary 卡片有 fade-in，列表直接显示

---

## 实施顺序

| 顺序 | Task | 改动文件 | 验证方式 |
|------|------|----------|----------|
| 1 | onShow 节流 | `index.js` | 手动验证 |
| 2 | 缓存不可变性 | `core.js` + 测试 | `npm test` |
| 3 | canvas 按需挂载 | `index.wxml`, `index.js` | 手动验证分享 |
| 4 | 分包预加载 | `app.json` | 手动验证首屏 |
| 5 | 入场动画 | `index.wxml` | 手动验证动画 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| freeze 导致现有代码报错 | upsertAndSave/deleteAndSave 已改为先 slice |
| canvas 挂载延迟影响分享 | setTimeout 50ms 等待渲染 |
| 分包加载延迟 | packageDetail 仍预加载，只有 packageRecord 按需 |
