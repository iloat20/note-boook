# 年度报告（年度资产复盘）重做 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `components/annual-report/` 从「投资年报」重做为「年度资产复盘」——去除所有投资用语，砍掉风险/月度/个股/标签四块，改为 封面 + 年度资产总览 + 资产持有画像 + 真·导出（canvas 长图 + 微信转发）。

**Architecture:** 抽三个纯函数到 `utils/helpers/annualReport.js`（持有画像 / 全历史流水 / 组装契约），`pages/stats/stats.js` 的 `onOpenAnnualReport` 改为调用它们产出新数据契约；组件 wxml/wxss 重写四块结构；`onExportImage` 用 canvas 2D 真导出，页面加 `onShareAppMessage` 支持转发。

**Tech Stack:** 微信小程序原生（WXML/WXSS/JS，CommonJS）；Jest + mock wx（Node）；设计变量 `--xhs-*`。

> **工作树说明**：与历史页重做一致，**不另开 git worktree**，直接在当前工作树实现（工作树已有大量未提交改动，基于陈旧 HEAD 开 worktree 反而危险）。每任务独立 commit。

---

## Task 1: 纯函数 `computeAssetHoldingPortrait`

**Files:**
- Create: `utils/helpers/annualReport.js`
- Test: `tests/annualReport.test.js`

**Step 1: 写失败测试（先只放本函数，后面两个函数同文件补）**

`tests/annualReport.test.js`：
```js
const { computeAssetHoldingPortrait } = require("../utils/helpers/annualReport");

const NOW = new Date("2026-07-13").getTime();

describe("computeAssetHoldingPortrait", () => {
	test("无交易时返回 null", () => {
		expect(computeAssetHoldingPortrait([], {}, NOW)).toEqual({
			longest: null, shortest: null, mostActive: null,
		});
	});
	test("按首记日排最久/最短，按记录数排变动最多", () => {
		const tx = [
			{ stockId: "A", date: "2026-01-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
			{ stockId: "A", date: "2026-03-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
			{ stockId: "B", date: "2026-06-01", type: "BUY", price: 1, quantity: 1, fee: 0 },
		];
		const stockMap = { A: { name: "资产甲" }, B: { name: "资产乙" } };
		const r = computeAssetHoldingPortrait(tx, stockMap, NOW);
		expect(r.longest.name).toBe("资产甲");
		expect(r.shortest.name).toBe("资产乙");
		expect(r.mostActive.name).toBe("资产甲");
		expect(r.mostActive.count).toBe(2);
	});
	test("缺 name 时回退到 id", () => {
		const r = computeAssetHoldingPortrait([{ stockId: "Z", date: "2026-01-01" }], {}, NOW);
		expect(r.longest.name).toBe("Z");
	});
});
```

**Step 2: 运行测试确认失败**
Run: `cd /c/Users/Administrator/Downloads/work/note-boook && npx jest tests/annualReport.test.js 2>&1 | tail -8`
Expected: FAIL，`Cannot find module '../utils/helpers/annualReport'`

**Step 3: 最小实现（仅本函数，另两个先占位导出空对象）**

`utils/helpers/annualReport.js`：
```js
function computeAssetHoldingPortrait(txList, stockMap, now) {
	const groups = {};
	(txList || []).forEach((t) => {
		const id = t.stockId;
		const ts = new Date(t.date).getTime();
		if (!groups[id]) groups[id] = { firstDate: ts, count: 0 };
		groups[id].count += 1;
		if (ts < groups[id].firstDate) groups[id].firstDate = ts;
	});
	const entries = Object.keys(groups).map((id) => {
		const g = groups[id];
		const days = Math.max(0, Math.floor((now - g.firstDate) / 86400000));
		const name = (stockMap && stockMap[id] && stockMap[id].name) || id;
		return { id, name, days, count: g.count };
	});
	if (entries.length === 0) return { longest: null, shortest: null, mostActive: null };
	const byDaysAsc = [...entries].sort((a, b) => a.days - b.days);
	const byCountDesc = [...entries].sort((a, b) => b.count - a.count);
	return {
		longest: { name: byDaysAsc[byDaysAsc.length - 1].name, days: byDaysAsc[byDaysAsc.length - 1].days },
		shortest: { name: byDaysAsc[0].name, days: byDaysAsc[0].days },
		mostActive: { name: byCountDesc[0].name, count: byCountDesc[0].count },
	};
}

module.exports = { computeAssetHoldingPortrait, computeAllTimeAssetFlow: () => ({}), assembleAnnualReport: () => ({}) };
```

**Step 4: 运行测试确认通过**
Run: `npx jest tests/annualReport.test.js 2>&1 | tail -8`
Expected: PASS（3 例）

**Step 5: 提交**
```bash
git add utils/helpers/annualReport.js tests/annualReport.test.js
git commit -m "feat(annual-report): 新增 computeAssetHoldingPortrait 纯函数 + 测试"
```

---

## Task 2: 纯函数 `computeAllTimeAssetFlow`

**Files:**
- Modify: `utils/helpers/annualReport.js`、`tests/annualReport.test.js`

**Step 1: 在测试文件追加 describe 块**
```js
const { computeAllTimeAssetFlow } = require("../utils/helpers/annualReport");

describe("computeAllTimeAssetFlow", () => {
	test("买入入流入、卖出入流出、分红入流入", () => {
		const tx = [
			{ stockId: "A", type: "BUY", price: 10, quantity: 100, fee: 5 },
			{ stockId: "A", type: "SELL", price: 12, quantity: 100, fee: 5 },
		];
		const div = [{ stockId: "A", totalAmount: 50 }];
		const r = computeAllTimeAssetFlow(tx, div, () => 1);
		expect(r.allInflow).toBeCloseTo(1055, 5);   // 1000+5+50
		expect(r.allOutflow).toBeCloseTo(1195, 5);  // 1200-5
		expect(r.endingAsset).toBeCloseTo(-140, 5);
	});
	test("rateResolver 按 stock 生效", () => {
		const tx = [{ stockId: "H", type: "BUY", price: 10, quantity: 1, fee: 0 }];
		const r = computeAllTimeAssetFlow(tx, [], (id) => (id === "H" ? 2 : 1));
		expect(r.allInflow).toBeCloseTo(20, 5);
	});
});
```

**Step 2: 运行确认失败**（computeAllTimeAssetFlow 当前返回 `{}`，取属性 undefined → 测试报错）

**Step 3: 实现函数并修正 module.exports**
在 `annualReport.js` 中加：
```js
function computeAllTimeAssetFlow(txList, dividendList, rateResolver) {
	const rateOf = rateResolver || (() => 1);
	let allInflow = 0;
	let allOutflow = 0;
	(txList || []).forEach((t) => {
		const r = rateOf(t.stockId) || 1;
		const amt = t.price * t.quantity * r;
		if (t.type === "BUY") allInflow += amt + t.fee * r;
		else if (t.type === "SELL") allOutflow += amt - t.fee * r;
	});
	(dividendList || []).forEach((d) => {
		const r = rateOf(d.stockId) || 1;
		allInflow += (d.totalAmount || 0) * r;
	});
	return { allInflow, allOutflow, endingAsset: allInflow - allOutflow };
}
```
并把文件底部 `module.exports` 改为：
```js
module.exports = { computeAssetHoldingPortrait, computeAllTimeAssetFlow, assembleAnnualReport: () => ({}) };
```

**Step 4: 运行确认通过** → PASS（含 Task1 共 5 例）

**Step 5: 提交**
```bash
git add utils/helpers/annualReport.js tests/annualReport.test.js
git commit -m "feat(annual-report): 新增 computeAllTimeAssetFlow 纯函数 + 测试"
```

---

## Task 3: 纯函数 `assembleAnnualReport`（组装新契约）

**Files:**
- Modify: `utils/helpers/annualReport.js`、`tests/annualReport.test.js`

**Step 1: 测试追加**
```js
const { assembleAnnualReport } = require("../utils/helpers/annualReport");

describe("assembleAnnualReport", () => {
	test("净变化为正 -> + 号 + 净增加", () => {
		const r = assembleAnnualReport({
			year: 2025, yearInflow: 82000, yearOutflow: 69000, endingAsset: 235000,
			holdingPortrait: { longest: { name: "X", days: 412 }, shortest: { name: "Y", days: 18 }, mostActive: { name: "Z", count: 37 } },
			fmt: (n) => `${Math.round(n)}`,
		});
		expect(r.netChange).toBe(13000);
		expect(r.netChangeSign).toBe("+");
		expect(r.conclusion).toBe("本年资产净增加");
		expect(r.inflowText).toBe("82000");
		expect(r.outflowText).toBe("69000");
		expect(r.endingAssetText).toBe("235000");
	});
	test("净变化为负 -> - 号 + 净减少", () => {
		const r = assembleAnnualReport({
			year: 2025, yearInflow: 100, yearOutflow: 300, endingAsset: 0,
			holdingPortrait: { longest: null, shortest: null, mostActive: null },
			fmt: (n) => `${Math.round(n)}`,
		});
		expect(r.netChangeSign).toBe("-");
		expect(r.conclusion).toBe("本年资产净减少");
	});
});
```

**Step 2: 运行确认失败**

**Step 3: 实现**
在 `annualReport.js` 加：
```js
function assembleAnnualReport(opts) {
	const { year, yearInflow, yearOutflow, endingAsset, holdingPortrait, fmt } = opts;
	const f = fmt || ((n) => `${n}`);
	const netChange = yearInflow - yearOutflow;
	return {
		year,
		netChange,
		netChangeSign: netChange >= 0 ? "+" : "-",
		netChangeText: f(Math.abs(netChange)),
		conclusion: netChange >= 0 ? "本年资产净增加" : "本年资产净减少",
		inflowText: f(yearInflow),
		outflowText: f(yearOutflow),
		endingAssetText: f(endingAsset),
		holdingPortrait,
	};
}
```
`module.exports` 改为导出全部三个。

**Step 4: 运行确认通过** → PASS（共 7 例）

**Step 5: 提交**
```bash
git add utils/helpers/annualReport.js tests/annualReport.test.js
git commit -m "feat(annual-report): 新增 assembleAnnualReport 纯函数 + 测试"
```

---

## Task 4: stats.js 数据构建重构（接新契约，删旧字段）

**Files:**
- Modify: `pages/stats/stats.js`（`onOpenAnnualReport` 中 169–331 行的数据构建段；顶部 import 增加 helpers）

**Step 1: 顶部 import 增加**
在 `stats.js` 第 9–14 行附近追加：
```js
const { computeAssetHoldingPortrait, computeAllTimeAssetFlow, assembleAnnualReport } = require("../../utils/helpers/annualReport");
```

**Step 2: 用新实现替换 `onOpenAnnualReport` 的 169–331 段**
将 169 行起（含 `const yearTx = ...` 到 331 行 `},` 的 setData 块）整体替换为：
```js
		const yearTx = Transaction.getByDateRange(yearStart, yearEnd);
		const rates = await getRates();
		const stockMap = buildStockMap(); // {stockId:{name,market}}
		const rateOf = (id) => {
			const m = stockMap[id] && stockMap[id].market;
			return getRate(m, rates) || getCachedRate(m) || 1;
		};

		// 本年流水（资产持有口径）
		let yearInflow = 0, yearOutflow = 0;
		yearTx.forEach((t) => {
			const r = rateOf(t.stockId);
			const amt = t.price * t.quantity * r;
			if (t.type === "BUY") yearInflow += amt + t.fee * r;
			else yearOutflow += amt - t.fee * r;
		});
		Dividend.getAll().forEach((d) => {
			const dd = new Date(d.date);
			if (dd >= yearStart && dd <= yearEnd) {
				const m = stockMap[d.stockId] && stockMap[d.stockId].market;
				const r = getRate(m, rates) || getCachedRate(m) || 1;
				yearInflow += d.totalAmount * r;
			}
		});

		// 全历史期末资产
		const { endingAsset } = computeAllTimeAssetFlow(
			Transaction.getAll(), Dividend.getAll(), rateOf,
		);

		// 资产持有画像（全历史）
		const holdingPortrait = computeAssetHoldingPortrait(
			Transaction.getAll(), stockMap, Date.now(),
		);

		const annualReportData = assembleAnnualReport({
			year, yearInflow, yearOutflow, endingAsset, holdingPortrait, fmt,
		});
		this.setData({ showAnnualReport: true, annualReportData });
```

**Step 3: 跑 lint 确认无错（避开预存 formatter/CRLF 噪音）**
Run: `npx biome lint pages/stats/stats.js`
Expected: 无 error（仅可能的预存 warning，非本任务引入）

**Step 4: 跑全量测试确认无回归**
Run: `npm test 2>&1 | tail -6`
Expected: PASS（原 138 + 7 新 = 145）

**Step 5: 提交**
```bash
git add pages/stats/stats.js
git commit -m "refactor(stats): 年度报告改用资产中性契约，移除 XIRR/胜率/个股/标签"
```

---

## Task 5: annual-report.wxml 重写四块结构

**Files:**
- Modify: `components/annual-report/annual-report.wxml`

**Step 1: 整体替换为新结构（移除资产概览 grid/资金流向/月度收益/收益最高/需要关注/标签分布 六段）**
```xml
<view wx:if="{{data}}" class="ar-overlay">
  <view class="ar-top-bar" style="top: {{statusBarHeight + navBarHeight}}px;">
    <view class="ar-close" bindtap="onClose">✕</view>
    <view class="ar-export-btn" bindtap="onExportImage" wx:if="{{!exporting}}">
      <text class="ar-export-icon">📷</text>
      <text class="ar-export-text">保存图片</text>
    </view>
    <view class="ar-export-btn ar-exporting" wx:if="{{exporting}}">
      <text class="ar-export-text">生成中...</text>
    </view>
    <button class="ar-export-btn" open-type="share" wx:if="{{!exporting}}">
      <text class="ar-export-text">分享</text>
    </button>
  </view>

  <scroll-view scroll-y class="ar-scroll">
    <view class="ar-scroll-spacer" style="height: {{statusBarHeight + navBarHeight}}px;"></view>
    <view class="ar-hero">
      <text class="ar-year">{{data.year}}</text>
      <text class="ar-title">年度资产复盘</text>
      <view class="ar-hero-pnl">
        <text class="ar-hero-sign">{{data.netChangeSign}}</text>
        <text class="ar-hero-value">{{data.netChangeText}}</text>
      </view>
      <text class="ar-hero-conclusion">{{data.conclusion}}</text>
    </view>

    <view class="ar-section">
      <text class="ar-section-title">年度资产总览</text>
      <view class="ar-grid">
        <view class="ar-grid-item">
          <text class="ar-grid-value">¥{{data.inflowText}}</text>
          <text class="ar-grid-label">年度流入</text>
        </view>
        <view class="ar-grid-item">
          <text class="ar-grid-value">¥{{data.outflowText}}</text>
          <text class="ar-grid-label">年度流出</text>
        </view>
        <view class="ar-grid-item">
          <text class="ar-grid-value {{data.netChange >= 0 ? 'ar-profit' : 'ar-loss'}}">¥{{data.netChangeText}}</text>
          <text class="ar-grid-label">年度净变化</text>
        </view>
        <view class="ar-grid-item">
          <text class="ar-grid-value">¥{{data.endingAssetText}}</text>
          <text class="ar-grid-label">期末资产</text>
        </view>
      </view>
    </view>

    <view class="ar-section" wx:if="{{data.holdingPortrait && data.holdingPortrait.longest}}">
      <text class="ar-section-title">资产持有画像</text>
      <view class="ar-portrait">
        <view class="ar-portrait-item">
          <text class="ar-portrait-name">{{data.holdingPortrait.longest.name}}</text>
          <text class="ar-portrait-value">{{data.holdingPortrait.longest.days}}天</text>
          <text class="ar-portrait-label">在册最久</text>
        </view>
        <view class="ar-portrait-item">
          <text class="ar-portrait-name">{{data.holdingPortrait.shortest.name}}</text>
          <text class="ar-portrait-value">{{data.holdingPortrait.shortest.days}}天</text>
          <text class="ar-portrait-label">在册最短</text>
        </view>
        <view class="ar-portrait-item">
          <text class="ar-portrait-name">{{data.holdingPortrait.mostActive.name}}</text>
          <text class="ar-portrait-value">{{data.holdingPortrait.mostActive.count}}笔</text>
          <text class="ar-portrait-label">变动最多</text>
        </view>
      </view>
    </view>

    <view class="ar-footer">
      <text class="ar-footer-text">茄子笔记本 · {{data.year}} 年度资产复盘</text>
    </view>

    <view style="height: 40px;"></view>
  </scroll-view>
</view>
```

**Step 2: 提交**
```bash
git add components/annual-report/annual-report.wxml
git commit -m "refactor(annual-report): wxml 重写四块结构，去除投资用语"
```

---

## Task 6: annual-report.wxss 重做样式

**Files:**
- Modify: `components/annual-report/annual-report.wxss`

**Step 1: 删除已废弃选择器**
删除 `.ar-grid-item` 中 6 宫格相关排版、以及 `.ar-flow*` / `.ar-chart*` / `.ar-rank*` / `.ar-strategy*` 全部规则（这些区块已从 wxml 移除）。

**Step 2: 把 `.ar-grid` 改为 2 列网格**
```css
.ar-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.ar-grid-item {
  flex: 0 0 calc(50% - 8rpx);
  background: var(--xhs-surface);
  border-radius: var(--xhs-radius-lg);
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.ar-grid-value {
  font-size: 36rpx;
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-text);
}
.ar-grid-label {
  font-size: 24rpx;
  color: var(--xhs-text-2);
}
```

**Step 3: 新增 `.ar-portrait` 三栏**
```css
.ar-portrait {
  display: flex;
  gap: 12rpx;
}
.ar-portrait-item {
  flex: 1;
  background: var(--xhs-surface);
  border-radius: var(--xhs-radius-lg);
  padding: 20rpx 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.ar-portrait-name {
  font-size: 24rpx;
  color: var(--xhs-text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-portrait-value {
  font-size: 30rpx;
  font-weight: var(--xhs-weight-semibold);
  color: var(--xhs-primary);
}
.ar-portrait-label {
  font-size: 22rpx;
  color: var(--xhs-text-2);
}
```

**Step 4: Hero 新增结论行样式**
```css
.ar-hero-conclusion {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--xhs-text-2);
}
```
（保留既有 `.ar-hero / .ar-year / .ar-title / .ar-hero-pnl / .ar-hero-sign / .ar-hero-value`）

**Step 5: 提交**
```bash
git add components/annual-report/annual-report.wxss
git commit -m "style(annual-report): 重做总览网格与持有画像样式"
```

---

## Task 7: annual-report.js 真·导出（canvas 长图 + 转发）

**Files:**
- Modify: `components/annual-report/annual-report.js`、`pages/stats/stats.js`（加 `onShareAppMessage`）

**Step 1: 组件 js 移除月度处理分支、实现 canvas 导出**
- `observers.data` 与 `_processData`：删除 `monthlyPnL` 相关逻辑（`data.monthlyPnL` 不再传入），保留 guard。
- `onExportImage` 重写：
  1. 取组件内 `<canvas type="2d" id="arCanvas">`（需在 wxml 加一个隐藏 canvas，宽高按内容估算，例如 width=750, height=估算）。
  2. `wx.createSelectorQuery().select('#arCanvas').fields({node:true,size:true})` 拿 node。
  3. 用 `canvas.getContext('2d')` 绘制：背景、Hero（年份/标题/净变化/结论）、总览四格、画像三栏、页脚。
  4. `wx.canvasToTempFilePath({canvas})` → `wx.saveImageToPhotosAlbum({filePath})`。
  5. 授权失败（`fail` 且 `errMsg` 含 `auth deny`）：`wx.showModal` 引导 `wx.openSetting`。
  6. 全程 `exporting` 状态位防重入，结束 `setData({exporting:false})`。
- 实现 `drawReport(ctx, data, width)` 私有方法集中绘制，便于维护。

**Step 2: wxml 增加隐藏 canvas（在 overlay 内，绝对定位移出屏幕）**
```xml
<canvas type="2d" id="arCanvas" class="ar-canvas"></canvas>
```
wxss:
```css
.ar-canvas { position: fixed; left: -9999px; top: 0; width: 750px; height: 1600px; }
```

**Step 3: 页面加转发**
`pages/stats/stats.js` 末尾（Page 对象内）加：
```js
	onShareAppMessage() {
		const d = this.data.annualReportData;
		return {
			title: d ? `我的 ${d.year} 年度资产复盘` : "我的年度资产复盘",
			path: "/pages/stats/stats",
		};
	},
```

**Step 4: 提交**
```bash
git add components/annual-report/annual-report.js components/annual-report/annual-report.wxml components/annual-report/annual-report.wxss pages/stats/stats.js
git commit -m "feat(annual-report): canvas 长图导出 + 微信转发卡片"
```

> 注：canvas 绘制与相册授权无法单测，属**真机/开发者工具手动验证项**（见 Task 8）。

---

## Task 8: 回归与真机验证

**Files:** 无新增，验证为主

**Step 1: 全量测试 + lint**
Run: `npm test 2>&1 | tail -6` → Expected: PASS（145 例）
Run: `npx biome lint utils/helpers/annualReport.js tests/annualReport.test.js pages/stats/stats.js components/annual-report/` → 无 error

**Step 2: 微信开发者工具手动验证清单**
- [ ] 打开统计页 → 年度资产复盘，封面显示「年份 + 年度资产复盘 + 净变化大数字 + 结论」
- [ ] 年度资产总览四格：流入/流出/净变化/期末资产，数值合理、无投资词
- [ ] 资产持有画像三栏：在册最久/最短/变动最多，显示资产名（无「代码/股票」字样）
- [ ] 全仓搜索「投资/持仓/盈亏/胜率/年化/个股/策略/分红/买入/卖出」在报告内**零命中**
- [ ] 点「保存图片」→ 生成中 → 相册出现长图（授权被拒时弹引导）
- [ ] 点「分享」或用右上角菜单「转发」→ 转发卡片标题正确
- [ ] 无旧板块残留（月度柱/收益最高/标签分布 均不渲染）

**Step 3: 收尾提交（若有微调）**
```bash
git add -A && git commit -m "chore(annual-report): 回归修复与验证微调" || echo "无改动"
```

---

## 范围之外（不做）
风险与胜率、月度收益曲线、个股排行、策略/标签盈亏、收益归因、ECharts 接入——均按用户确认取消。
