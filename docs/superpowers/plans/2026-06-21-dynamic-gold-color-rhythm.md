# 动态金色节奏色彩体系 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把散落的硬编码金色收口进 `--xhs-gold-*` 令牌，并在令牌层上建一套分层叠加的动态金色节奏系统（时间层 + 数据层 + 事件层 + 交互层），让首页金色随时间/盈亏/事件/操作动态调整。

**Architecture:** 离散场景枚举 + CSS `transition` 平滑过渡（非连续插值、无 RAF 循环）。新增两个 `utils/` 模块（纯数据常量 + 调度器），通过页面根容器 `style` 注入 CSS 变量。第一期只接入 `pages/index/`。

**Tech Stack:** 微信小程序原生（WXML/WXSS/JS）、CommonJS、Jest（Node 环境，`babel-jest` transform）、Biome 2.5.0（Tab 缩进 JS / 2 空格 WXSS / 双引号 / 100 字符行宽）。

## Global Constraints

（所有 task 隐式继承以下约束，源自 spec 与 AGENTS.md）

- **Module system**：CommonJS `require()` / `module.exports`，禁 ES modules。
- **Naming**：文件 `camelCase.js`；组件 `kebab-case/` 目录。
- **Code style**：JS 用 Tab 缩进 + 双引号；WXSS 用 2 空格缩进；行宽 100。
- **Test layout**：测试放 `tests/xxx.test.js`（项目既有约定，**不是** `utils/services/__tests__/`）；`jest.config.js` 的 `testMatch` 是 `**/tests/**/*.test.js`。
- **Test pattern**：Jest Node 环境；用相对路径 `require("../utils/...")`；如需 mock `wx`，用 `jest.mock` 或全局 `global.wx`。
- **Color tokens**：所有新增/收口的金色必须经 `var(--xhs-gold-* …)` 引用，**禁止再写硬编码金色字面量**。
- **Dynamic CSS vars**：基线默认值声明在 `app.wxss` 的 `page` 选择器内，保证 JS 没跑界面也正确（渐进增强）。
- **No dark mode / No page tint / No 常驻动画 / No 盈亏分级**（spec §3.2 明确排除）。
- **Commit style**：中文 conventional commits（如 `feat:`/`fix:`/`refactor:`/`test:`/`style:`/`docs:`）。
- **Lint command**：`npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`；自动修：`npx biome check --write --unsafe …`。
- **Test command**：`npm test`（等价 `jest --config jest.config.js`）。

---

## File Structure

新建/修改文件清单与职责：

| 文件 | 操作 | 职责 |
|---|---|---|
| `utils/constants/colorRhythm.js` | 新建 | 纯数据：4 时段色阶表 + 3 档 glow 表 + TIME_RANGES。无逻辑、无副作用 |
| `utils/services/colorRhythm.js` | 新建 | 调度器：`getTimePhase` / `getProfitPhase` / `buildGoldVars` / `applyToPage` / `startTimer` / `stopTimer` |
| `tests/colorRhythm.test.js` | 新建 | Jest 单测：纯函数 + 定时器清理 |
| `app.wxss` | 修改 | ① 收口层新增 `--xhs-gold-*` 令牌族；② 动态层基线默认值；③ 持仓卡 `transition`；④ `.gold-shimmer`/`.long-press-glow` keyframes |
| `pages/index/index.wxss` | 修改 | 把 6 处硬编码金色替换为 `var(--xhs-gold-*)`；持仓卡 `:active` 涟漪 `::after` |
| `components/market-tag/index.wxss` | 修改 | 港股 border 旧值 `rgba(255,149,0,0.12)` → `var(--xhs-gold-bg)` |
| `utils/constants/market.js` | 修改 | 港股色 `#FF9500` → `#FFB800`（与 CSS 对齐） |
| `pages/index/index.js` | 修改 | 接入 `colorRhythm`：`onLoad` 启动、`onUnload` 清理、`_loadData` 末尾重算盈亏档 |
| `pages/index/index.wxml` | 修改 | 根容器绑定 `style="{{goldVars}}"` |

---

## Task 1: 色阶常量表

**Files:**
- Create: `utils/constants/colorRhythm.js`
- Test: `tests/colorRhythm.test.js`

**Interfaces:**
- Consumes: 无（纯数据模块）
- Produces:
  - `TIME_PHASES: { morning: GoldVarSet, noon: GoldVarSet, dusk: GoldVarSet, night: GoldVarSet }`，其中 `GoldVarSet = { '--xhs-gold-time': string, '--xhs-gold-time-bg': string, '--xhs-gold-time-halo': string }`
  - `PROFIT_PHASES: { up: GlowVarSet, flat: GlowVarSet, down: GlowVarSet }`，其中 `GlowVarSet = { '--xhs-card-glow-opacity': string, '--xhs-card-glow-blur': string }`
  - `TIME_RANGES: { morning: [number, number], noon: [number, number], dusk: [number, number] }`（左闭右开区间，`night` 为兜底）
  - `PROFIT_PHASE_NAMES: Array<string>` = `['up','flat','down']`
  - `TIME_PHASE_NAMES: Array<string>` = `['morning','noon','dusk','night']`

- [ ] **Step 1: 写失败测试 `tests/colorRhythm.test.js`**

```js
/**
 * colorRhythm 常量表 + 调度器 测试
 */

const {
	TIME_PHASES,
	PROFIT_PHASES,
	TIME_RANGES,
	TIME_PHASE_NAMES,
	PROFIT_PHASE_NAMES,
} = require("../utils/constants/colorRhythm");

describe("colorRhythm constants", () => {
	test("TIME_PHASES 包含四个时段，每个时段含 3 个变量", () => {
		expect(TIME_PHASE_NAMES).toEqual(["morning", "noon", "dusk", "night"]);
		for (const phase of TIME_PHASE_NAMES) {
			expect(TIME_PHASES[phase]).toBeDefined();
			expect(Object.keys(TIME_PHASES[phase]).sort()).toEqual(
				[
					"--xhs-gold-time",
					"--xhs-gold-time-bg",
					"--xhs-gold-time-halo",
				].sort(),
			);
		}
	});

	test("PROFIT_PHASES 包含三档，每档含 2 个变量", () => {
		expect(PROFIT_PHASE_NAMES).toEqual(["up", "flat", "down"]);
		for (const phase of PROFIT_PHASE_NAMES) {
			expect(PROFIT_PHASES[phase]).toBeDefined();
			expect(Object.keys(PROFIT_PHASES[phase]).sort()).toEqual(
				["--xhs-card-glow-opacity", "--xhs-card-glow-blur"].sort(),
			);
		}
	});

	test("TIME_RANGES 为左闭右开区间", () => {
		expect(TIME_RANGES.morning).toEqual([5, 9]);
		expect(TIME_RANGES.noon).toEqual([9, 16]);
		expect(TIME_RANGES.dusk).toEqual([16, 19]);
	});

	test("时段色值均为合法 CSS color（#hex 或 rgba）", () => {
		const colorRe = /^(#[0-9A-Fa-f]{6}|rgba?\([^)]+\))$/;
		for (const phase of TIME_PHASE_NAMES) {
			for (const v of Object.values(TIME_PHASES[phase])) {
				expect(colorRe.test(v)).toBe(true);
			}
		}
	});

	test("盈利档 opacity 递减：up > flat > down", () => {
		const up = Number.parseFloat(PROFIT_PHASES.up["--xhs-card-glow-opacity"]);
		const flat = Number.parseFloat(PROFIT_PHASES.flat["--xhs-card-glow-opacity"]);
		const down = Number.parseFloat(PROFIT_PHASES.down["--xhs-card-glow-opacity"]);
		expect(up).toBeGreaterThan(flat);
		expect(flat).toBeGreaterThan(down);
	});
});
```

- [ ] **Step 2: 运行测试，确认失败（模块不存在）**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: FAIL，报 `Cannot find module '../utils/constants/colorRhythm'`

- [ ] **Step 3: 实现 `utils/constants/colorRhythm.js`**

```js
// utils/constants/colorRhythm.js
// 动态金色节奏 — 色阶常量表（纯数据，无逻辑）
// 详见 docs/superpowers/specs/2026-06-21-dynamic-gold-color-rhythm-design.md

// 时段名称顺序（用于遍历与校验）
const TIME_PHASE_NAMES = ["morning", "noon", "dusk", "night"];

// 盈亏档名称顺序
const PROFIT_PHASE_NAMES = ["up", "flat", "down"];

// 时间段色阶表（运行时由 services/colorRhythm.js 写入页面根容器）
// 晨(暖金) / 午(亮金) / 暮(橙金) / 夜(沉金，浅夜 — 仅金调变深，背景仍亮)
const TIME_PHASES = {
	morning: {
		"--xhs-gold-time": "#FFD180",
		"--xhs-gold-time-bg": "rgba(255, 209, 128, 0.10)",
		"--xhs-gold-time-halo": "rgba(255, 209, 128, 0.10)",
	},
	noon: {
		"--xhs-gold-time": "#FFB800",
		"--xhs-gold-time-bg": "rgba(255, 184, 0, 0.10)",
		"--xhs-gold-time-halo": "rgba(255, 215, 0, 0.08)",
	},
	dusk: {
		"--xhs-gold-time": "#FF9A3C",
		"--xhs-gold-time-bg": "rgba(255, 154, 60, 0.10)",
		"--xhs-gold-time-halo": "rgba(255, 154, 60, 0.12)",
	},
	night: {
		"--xhs-gold-time": "#E08500",
		"--xhs-gold-time-bg": "rgba(224, 133, 0, 0.10)",
		"--xhs-gold-time-halo": "rgba(224, 133, 0, 0.14)",
	},
};

// 盈亏档 glow 强度（数据层）
// 盈利↑ 金光增强 / 持平 中性 / 亏损↓ 金光收敛
const PROFIT_PHASES = {
	up: {
		"--xhs-card-glow-opacity": "0.22",
		"--xhs-card-glow-blur": "16px",
	},
	flat: {
		"--xhs-card-glow-opacity": "0.10",
		"--xhs-card-glow-blur": "8px",
	},
	down: {
		"--xhs-card-glow-opacity": "0.04",
		"--xhs-card-glow-blur": "4px",
	},
};

// 时段区间（小时，左闭右开）；night 为兜底（不在表中）
const TIME_RANGES = {
	morning: [5, 9],
	noon: [9, 16],
	dusk: [16, 19],
};

module.exports = {
	TIME_PHASE_NAMES,
	PROFIT_PHASE_NAMES,
	TIME_PHASES,
	PROFIT_PHASES,
	TIME_RANGES,
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: PASS（5 个 test 全过）

- [ ] **Step 5: Lint**

Run: `npx biome check utils/constants/colorRhythm.js tests/colorRhythm.test.js`
Expected: 无报错（若有格式问题，先 `npx biome check --write --unsafe utils/constants/colorRhythm.js tests/colorRhythm.test.js`）

- [ ] **Step 6: Commit**

```bash
git add utils/constants/colorRhythm.js tests/colorRhythm.test.js
git commit -m "feat: 新增动态金色节奏色阶常量表"
```

---

## Task 2: 调度器（纯函数部分）

**Files:**
- Create: `utils/services/colorRhythm.js`
- Modify: `tests/colorRhythm.test.js`

**Interfaces:**
- Consumes: `utils/constants/colorRhythm.js`（Task 1 产出的 `TIME_PHASES` / `PROFIT_PHASES` / `TIME_RANGES`）
- Produces:
  - `getTimePhase(date?: Date): "morning" | "noon" | "dusk" | "night"` — 纯函数
  - `getProfitPhase(profitRate: number): "up" | "flat" | "down"` — 纯函数
  - `buildGoldVars(timePhase: string, profitPhase: string): Object<string, string>` — 返回扁平 CSS 变量对象（时间层 + 数据层合并，**不**含 `--xhs-card-glow-color`，那个由 WXSS 基线声明为 `var(--xhs-gold-time)`）

- [ ] **Step 1: 在 `tests/colorRhythm.test.js` 末尾追加纯函数测试**

```js
const {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
} = require("../utils/services/colorRhythm");

describe("getTimePhase", () => {
	// 用构造 Date(0,0,0,h,m) 固定小时，避免时区干扰
	function atHour(h) {
		return new Date(2026, 5, 15, h, 30); // 2026-06-15 h:30
	}

	test("晨段 [5, 9)", () => {
		expect(getTimePhase(atHour(5))).toBe("morning");
		expect(getTimePhase(atHour(8))).toBe("morning");
	});
	test("午段 [9, 16)", () => {
		expect(getTimePhase(atHour(9))).toBe("noon");
		expect(getTimePhase(atHour(15))).toBe("noon");
	});
	test("暮段 [16, 19)", () => {
		expect(getTimePhase(atHour(16))).toBe("dusk");
		expect(getTimePhase(atHour(18))).toBe("dusk");
	});
	test("夜段（兜底）", () => {
		expect(getTimePhase(atHour(19))).toBe("night");
		expect(getTimePhase(atHour(23))).toBe("night");
		expect(getTimePhase(atHour(0))).toBe("night");
		expect(getTimePhase(atHour(4))).toBe("night");
	});
	test("边界值：左闭右开", () => {
		expect(getTimePhase(atHour(9))).toBe("noon"); // 9 归午，不归晨
		expect(getTimePhase(atHour(16))).toBe("dusk"); // 16 归暮，不归午
		expect(getTimePhase(atHour(19))).toBe("night"); // 19 归夜，不归暮
	});
});

describe("getProfitPhase", () => {
	test("盈利 → up", () => {
		expect(getProfitPhase(0.01)).toBe("up");
		expect(getProfitPhase(12.5)).toBe("up");
	});
	test("持平 → flat", () => {
		expect(getProfitPhase(0)).toBe("flat");
	});
	test("亏损 → down", () => {
		expect(getProfitPhase(-0.01)).toBe("down");
		expect(getProfitPhase(-50)).toBe("down");
	});
	test("NaN 容错 → flat", () => {
		expect(getProfitPhase(Number.NaN)).toBe("flat");
	});
});

describe("buildGoldVars", () => {
	test("合并时间层 + 数据层变量", () => {
		const vars = buildGoldVars("noon", "up");
		expect(vars["--xhs-gold-time"]).toBe("#FFB800");
		expect(vars["--xhs-card-glow-opacity"]).toBe("0.22");
	});
	test("共 5 个 key（时间 3 + 数据 2）", () => {
		const vars = buildGoldVars("dusk", "flat");
		expect(Object.keys(vars).length).toBe(5);
	});
	test("night + down 组合正确", () => {
		const vars = buildGoldVars("night", "down");
		expect(vars["--xhs-gold-time"]).toBe("#E08500");
		expect(vars["--xhs-card-glow-opacity"]).toBe("0.04");
	});
});
```

- [ ] **Step 2: 运行测试，确认失败（模块未导出函数）**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: FAIL，报 `Cannot find module '../utils/services/colorRhythm'`

- [ ] **Step 3: 实现 `utils/services/colorRhythm.js` 的纯函数部分**

```js
// utils/services/colorRhythm.js
// 动态金色节奏调度器
// 详见 docs/superpowers/specs/2026-06-21-dynamic-gold-color-rhythm-design.md

const {
	TIME_PHASES,
	PROFIT_PHASES,
	TIME_RANGES,
} = require("../constants/colorRhythm");

/**
 * 根据 Date 判定时段
 * @param {Date} [date] 默认当前时间
 * @returns {"morning" | "noon" | "dusk" | "night"}
 */
function getTimePhase(date = new Date()) {
	const h = date.getHours();
	if (h >= TIME_RANGES.morning[0] && h < TIME_RANGES.morning[1]) return "morning";
	if (h >= TIME_RANGES.noon[0] && h < TIME_RANGES.noon[1]) return "noon";
	if (h >= TIME_RANGES.dusk[0] && h < TIME_RANGES.dusk[1]) return "dusk";
	return "night";
}

/**
 * 根据盈亏率判定 glow 档位
 * @param {number} profitRate 盈亏率（百分比或小数均可，符号决定档位）
 * @returns {"up" | "flat" | "down"}
 */
function getProfitPhase(profitRate) {
	if (Number.isNaN(profitRate)) return "flat";
	if (profitRate > 0) return "up";
	if (profitRate < 0) return "down";
	return "flat";
}

/**
 * 合并时间层 + 数据层变量为扁平对象
 * 注：--xhs-card-glow-color 由 WXSS 基线声明为 var(--xhs-gold-time)，此处不输出
 * @param {string} timePhase
 * @param {string} profitPhase
 * @returns {Object<string, string>}
 */
function buildGoldVars(timePhase, profitPhase) {
	return {
		...TIME_PHASES[timePhase],
		...PROFIT_PHASES[profitPhase],
	};
}

module.exports = {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: PASS（所有 describe 全过）

- [ ] **Step 5: Lint**

Run: `npx biome check utils/services/colorRhythm.js tests/colorRhythm.test.js`
Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add utils/services/colorRhythm.js tests/colorRhythm.test.js
git commit -m "feat: colorRhythm 调度器纯函数（时段/盈亏/变量合成）"
```

---

## Task 3: 调度器（副作用部分：applyToPage / startTimer / stopTimer）

**Files:**
- Modify: `utils/services/colorRhythm.js`
- Modify: `tests/colorRhythm.test.js`

**Interfaces:**
- Consumes: Task 2 的 `getTimePhase` / `buildGoldVars`；全局 `wx.setData` 通过页面实例访问
- Produces:
  - `applyToPage(pageCtx, vars)`: 调 `pageCtx.setData({ goldVars: vars })`，注入到页面根容器。`pageCtx` 是页面实例（`this`），必须有 `setData`。无返回值。
  - `startTimer(pageCtx, options?)`: 启动每分钟轮询，重新算时段并 `applyToPage`。返回 `timerId`（数字）。`options.onTick` 可选回调，便于测试注入。
  - `stopTimer(timerId)`: 调 `clearInterval`。`timerId` 无效时静默返回。无返回值。

- [ ] **Step 1: 追加副作用测试到 `tests/colorRhythm.test.js`**

```js
const {
	applyToPage,
	startTimer,
	stopTimer,
} = require("../utils/services/colorRhythm");

describe("applyToPage", () => {
	test("调用 setData 写入 goldVars", () => {
		const received = {};
		const fakePage = {
			setData(payload) {
				Object.assign(received, payload);
			},
		};
		applyToPage(fakePage, { "--xhs-gold-time": "#FFB800" });
		expect(received.goldVars).toEqual({ "--xhs-gold-time": "#FFB800" });
	});

	test("pageCtx 没有 setData 时不抛错（防御）", () => {
		expect(() => applyToPage({}, {})).not.toThrow();
	});
});

describe("startTimer / stopTimer", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test("startTimer 返回 timerId（数字）", () => {
		const id = startTimer({ setData() {} });
		expect(typeof id).toBe("number");
		stopTimer(id);
	});

	test("每分钟触发 onTick 回调", () => {
		const calls = [];
		const id = startTimer({ setData() {} }, { onTick: () => calls.push(1) });
		jest.advanceTimersByTime(60 * 1000);
		expect(calls.length).toBe(1);
		jest.advanceTimersByTime(60 * 1000);
		expect(calls.length).toBe(2);
		stopTimer(id);
	});

	test("stopTimer 后不再触发", () => {
		const calls = [];
		const id = startTimer({ setData() {} }, { onTick: () => calls.push(1) });
		stopTimer(id);
		jest.advanceTimersByTime(120 * 1000);
		expect(calls.length).toBe(0);
	});

	test("stopTimer 对无效 id 不抛错", () => {
		expect(() => stopTimer(null)).not.toThrow();
		expect(() => stopTimer(undefined)).not.toThrow();
		expect(() => stopTimer(99999)).not.toThrow();
	});

	test("轮询时通过当前时段调用 setData", () => {
		const received = [];
		const fakePage = {
			setData(payload) {
				received.push(payload.goldVars["--xhs-gold-time"]);
			},
		};
		// 锁定时间为 12:00 → noon → #FFB800
		jest.spyOn(Date, "now").mockReturnValue(new Date(2026, 5, 15, 12, 0).getTime());
		const id = startTimer(fakePage);
		jest.advanceTimersByTime(60 * 1000);
		expect(received).toContain("#FFB800");
		Date.now.mockRestore();
		stopTimer(id);
	});
});
```

- [ ] **Step 2: 运行测试，确认失败（函数未导出）**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: FAIL，报 `applyToPage is not a function` 之类

- [ ] **Step 3: 实现副作用函数，更新 `utils/services/colorRhythm.js`**

在 Task 2 文件**末尾**（`module.exports` 之前）追加：

```js
const TIMER_INTERVAL_MS = 60 * 1000; // 每分钟轮询

/**
 * 把 CSS 变量对象注入页面（写入 goldVars，供根容器 style 绑定）
 * @param {Object} pageCtx 页面实例（this），需有 setData
 * @param {Object<string, string>} vars 扁平 CSS 变量对象
 */
function applyToPage(pageCtx, vars) {
	if (!pageCtx || typeof pageCtx.setData !== "function") return;
	pageCtx.setData({ goldVars: vars });
}

/**
 * 启动每分钟轮询：重算时段并 applyToPage
 * @param {Object} pageCtx 页面实例
 * @param {{ profitPhase?: string, onTick?: Function }} [options]
 *   - profitPhase: 锁定盈亏档（轮询只重算时段，盈亏档由持仓数据刷新驱动）
 *   - onTick: 每次轮询触发的回调（便于测试）
 * @returns {number} timerId
 */
function startTimer(pageCtx, options = {}) {
	const profitPhase = options.profitPhase || "flat";
	function tick() {
		try {
			const vars = buildGoldVars(getTimePhase(), profitPhase);
			applyToPage(pageCtx, vars);
		} catch (e) {
			console.error("[colorRhythm] tick error:", e);
		}
		if (typeof options.onTick === "function") {
			try {
				options.onTick();
			} catch (_) {}
		}
	}
	return setInterval(tick, TIMER_INTERVAL_MS);
}

/**
 * 停止轮询（防泄漏，呼应 commit 8f75819）
 * @param {number} timerId
 */
function stopTimer(timerId) {
	if (timerId == null) return;
	try {
		clearInterval(timerId);
	} catch (_) {}
}
```

更新 `module.exports`：

```js
module.exports = {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
	applyToPage,
	startTimer,
	stopTimer,
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: PASS（所有 describe 全过）

- [ ] **Step 5: Lint**

Run: `npx biome check utils/services/colorRhythm.js tests/colorRhythm.test.js`
Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add utils/services/colorRhythm.js tests/colorRhythm.test.js
git commit -m "feat: colorRhythm 副作用（applyToPage/定时器/清理）"
```

---

## Task 4: app.wxss 收口层 + 动态基线

**Files:**
- Modify: `app.wxss`（`page` 选择器，当前约第 6-132 行；新增 keyframes 追加到文件末尾）

**Interfaces:**
- Consumes: 现有 `--xhs-market-hk`（`app.wxss:55`）、`--xhs-dividend-dark`（`app.wxss:43`）
- Produces: 新增令牌族 `--xhs-gold-*`（11 个）+ 动态层基线默认值（6 个）+ keyframes

- [ ] **Step 1: 在 `app.wxss` 的 `page { }` 内，紧跟 `Market Tags` 段之后（约第 59 行后）新增"金色令牌族"**

定位锚点：现有代码块尾部是 `--xhs-market-us-bg: rgba(175, 82, 222, 0.08);`（`app.wxss:58`）。

```css
  /* ── Gold Token Family (收口层) ── */
  /* 权威金族：以 market-hk #FFB800 为锚点统一散落金色 */
  --xhs-gold: #FFB800;
  --xhs-gold-light: #FFCF40;
  --xhs-gold-dark: #E08500;
  --xhs-gold-deep: #D4A017;
  --xhs-gold-bg: rgba(255, 184, 0, 0.10);
  --xhs-gold-bg-2: rgba(255, 184, 0, 0.16);
  --xhs-gold-halo: rgba(255, 215, 0, 0.08);
  --xhs-gold-50: #FFF8E1;
  --xhs-gold-100: #FFE082;
  --xhs-card-cream-from: #FFFEFB;
  --xhs-card-cream-to: #FFFCF5;

  /* ── Dynamic Gold Rhythm Baseline (动态层默认值) ── */
  /* 渐进增强：即便 JS 没跑，界面也正确（默认=午段+持平） */
  --xhs-gold-time: var(--xhs-gold);
  --xhs-gold-time-bg: var(--xhs-gold-bg);
  --xhs-gold-time-halo: var(--xhs-gold-halo);
  --xhs-card-glow-opacity: 0.10;
  --xhs-card-glow-blur: 8px;
  --xhs-card-glow-color: var(--xhs-gold-time);
```

- [ ] **Step 2: 在 `app.wxss` 文件末尾追加 keyframes**

```css
/* ═══ 动态金色节奏 — 事件级 & 交互级动画 ═══ */

/* 事件级流光：1.5s 扫过，结束即消（.gold-shimmer 由 JS toggle） */
@keyframes goldShimmer {
	0% {
		background-position: -150% 0;
		opacity: 0;
	}
	20% {
		opacity: 1;
	}
	100% {
		background-position: 250% 0;
		opacity: 0;
	}
}

.gold-shimmer::after {
	content: '';
	position: absolute;
	inset: 0;
	background: linear-gradient(
		105deg,
		transparent 30%,
		rgba(255, 215, 0, 0.35) 50%,
		transparent 70%
	);
	background-size: 200% 100%;
	animation: goldShimmer 1.5s ease-out forwards;
	pointer-events: none;
	z-index: 2;
}

/* 长按高光：金光持续增强（.long-press-glow 由 JS toggle） */
.long-press-glow {
	box-shadow:
		0 0 0 2px var(--xhs-gold-time),
		0 4px 16px rgba(255, 184, 0, 0.25) !important;
}
```

- [ ] **Step 3: 校验语法**

小程序 WXSS 无法在 CLI 单独编译，采用人工 + Biome 格式校验：

Run: `npx biome format app.wxss 2>&1 || echo "biome 对 wxss 格式支持有限，手动核对大括号配对"`
Expected: 无致命错误（biome 对 wxss 格式支持有限，重点人工核对 `{}` 配对、`var(--xhs-gold-*)` 拼写）

- [ ] **Step 4: Commit**

```bash
git add app.wxss
git commit -m "style: app.wxss 新增金色令牌族 + 动态节奏基线 + 流光动画"
```

---

## Task 5: 修复 market-tag 港股 border 旧值

**Files:**
- Modify: `components/market-tag/index.wxss:29`

**Interfaces:** 无（纯样式替换，对组件外部无影响）

- [ ] **Step 1: 替换 `index.wxss:29` 的硬编码**

定位：`.market-hk { ... border: 1px solid rgba(255, 149, 0, 0.12); }`（第 29 行）

old:
```css
  border: 1px solid rgba(255, 149, 0, 0.12);
```

new:
```css
  border: 1px solid var(--xhs-gold-bg);
```

- [ ] **Step 2: Lint**

Run: `npx biome check components/market-tag/index.wxss`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add components/market-tag/index.wxss
git commit -m "fix: market-tag 港股 border 旧橙值同步为金色令牌"
```

---

## Task 6: 修复 market.js 港股色与 CSS 对齐

**Files:**
- Modify: `utils/constants/market.js:18`

**Interfaces:**
- Consumes: 无
- Produces: `getMarketColor` 港股返回值 `#FF9500` → `#FFB800`（其他市场不变）

- [ ] **Step 1: 替换 `market.js:18`**

定位：`[MARKETS.HK_SHARE]: "#FF9500",`（第 18 行）

old:
```js
		[MARKETS.HK_SHARE]: "#FF9500",
```

new:
```js
		[MARKETS.HK_SHARE]: "#FFB800",
```

- [ ] **Step 2: 运行全量测试，确认未破坏现有用例**

Run: `npm test`
Expected: PASS（无回归）

- [ ] **Step 3: Lint**

Run: `npx biome check utils/constants/market.js`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add utils/constants/market.js
git commit -m "fix: market.js 港股色与 CSS 令牌对齐（#FF9500 → #FFB800）"
```

---

## Task 7: pages/index/index.wxss 收口金色

**Files:**
- Modify: `pages/index/index.wxss`（第 58 / 80 / 145 / 152 / 158 / 160-163 行）

**Interfaces:** 无（纯样式替换）

- [ ] **Step 1: 替换汇总卡片径向光晕（`index.wxss:58`）**

old:
```css
  background: radial-gradient(circle, rgba(255, 215, 0, 0.08) 0%, transparent 70%);
```

new:
```css
  background: radial-gradient(circle, var(--xhs-gold-time-halo) 0%, transparent 70%);
```

- [ ] **Step 2: 替换 `.summary-value` 深金字色（`index.wxss:80`）**

old:
```css
  color: #D4A017;
```

new:
```css
  color: var(--xhs-gold-deep);
```

- [ ] **Step 3: 替换 `.share-btn` 浅金底（`index.wxss:145`）**

old:
```css
  background: #FFF8E1;
```

new:
```css
  background: var(--xhs-gold-50);
```

- [ ] **Step 4: 替换 `.share-btn:active` 金色（`index.wxss:152`）**

old:
```css
  background: #FFE082;
```

new:
```css
  background: var(--xhs-gold-100);
```

- [ ] **Step 5: 替换持仓卡渐变（`index.wxss:158`）**

old:
```css
  background: linear-gradient(135deg, #FFFEFB 0%, #FFFCF5 100%);
```

new:
```css
  background: linear-gradient(135deg, var(--xhs-card-cream-from) 0%, var(--xhs-card-cream-to) 100%);
```

- [ ] **Step 6: 替换持仓卡金边 + 阴影，接入数据层 glow（`index.wxss:160-163`）**

定位：`.position-card` 的 `border` 和 `box-shadow`（第 160-163 行）

old:
```css
  border: 1px solid rgba(255, 184, 0, 0.08);
  box-shadow:
    0 2px 8px rgba(255, 184, 0, 0.05),
    0 4px 16px rgba(255, 184, 0, 0.02);
```

new（金边用收口令牌；阴影用数据层动态 glow）:
```css
  border: 1px solid var(--xhs-gold-bg);
  box-shadow:
    0 2px 8px rgba(255, 184, 0, var(--xhs-card-glow-opacity)),
    0 0 var(--xhs-card-glow-blur) rgba(255, 184, 0, var(--xhs-card-glow-opacity));
```

> 说明：`--xhs-card-glow-color` 已在基线声明为 `var(--xhs-gold-time)`，此处 rgba 用 255,184,0 作为中性金底（夜间深沉感由 opacity 调控）。未来如需更精确可改为 `color-mix`，但小程序兼容性有限，本期保持 rgba。

- [ ] **Step 7: 在 `.position-card` 的 `transition` 增加金调过渡属性**

定位：`index.wxss:169`（现有 `transition: var(--xhs-transition-slow);`）

old:
```css
  transition: var(--xhs-transition-slow);
```

new（追加 border-color / box-shadow 的 500ms ease，让数据层切换平滑）:
```css
  transition: var(--xhs-transition-slow),
    border-color 0.5s ease,
    box-shadow 0.5s ease;
```

- [ ] **Step 8: Lint**

Run: `npx biome check pages/index/index.wxss`
Expected: 无报错

- [ ] **Step 9: Commit**

```bash
git add pages/index/index.wxss
git commit -m "refactor: 首页金色硬编码收口进 --xhs-gold-* 令牌"
```

---

## Task 8: pages/index/index.wxml 绑定动态变量

**Files:**
- Modify: `pages/index/index.wxml:1`（根容器）

**Interfaces:** 无（绑定 Task 9 注入的 `goldVars`）

- [ ] **Step 1: 在根容器 `style` 注入 `goldVars`**

定位：`index.wxml:1`

old:
```xml
<view class="page-container {{entranceDone ? '' : 'page-entrance'}}" style="padding-top: {{statusBarHeight + navBarHeight}}px;">
```

new:
```xml
<view class="page-container {{entranceDone ? '' : 'page-entrance'}}" style="padding-top: {{statusBarHeight + navBarHeight}}px; {{goldVars}}">
```

> 说明：小程序 `style` 内联 `--xxx: value` 形式的 CSS 变量可被该节点及其后代通过 `var()` 引用。`goldVars` 是扁平对象如 `{ "--xhs-gold-time": "#FFB800", … }`，经 setData 后会被小程序序列化为 `--xhs-gold-time:#FFB800;...` 拼入 style。即便 `goldVars` 为空对象，`{{goldVars}}` 输出 `[object Object]` 是已知风险——所以 Task 9 必须保证 `goldVars` 是**已序列化的字符串**。

**修正**：为避免 `[object Object]`，`goldVars` 应为字符串。Task 9 的 `applyToPage` 改为输出字符串（见 Task 9 修正）。

- [ ] **Step 2: Commit（与 Task 9 合并提交，或单独提交 wxml）**

本 step 的有效性依赖 Task 9 的 `goldVars` 序列化方式，故本 task 的 commit 建议放在 Task 9 之后合并；若单独提交，先标记 WIP。

```bash
# 暂不单独 commit，留待 Task 9 一起验证后提交
```

---

## Task 9: colorRhythm 序列化 goldVars 为字符串 + 首页接入

**Files:**
- Modify: `utils/services/colorRhythm.js`（`applyToPage` 改为序列化）
- Modify: `tests/colorRhythm.test.js`（更新断言）
- Modify: `pages/index/index.js`（接入 onLoad/onUnload/_loadData）
- Modify: `pages/index/index.wxml:1`（Task 8 的根容器绑定）

**Interfaces:**
- Consumes: Task 3 的调度器
- Produces: `goldVars` 在页面 data 中为**字符串**（如 `"--xhs-gold-time:#FFB800;--xhs-card-glow-opacity:0.22"`）

- [ ] **Step 1: 在 `colorRhythm.js` 新增序列化函数，更新 `applyToPage`**

在 Task 3 文件的 `module.exports` 之前新增：

```js
/**
 * 把扁平 CSS 变量对象序列化为 style 内联字符串
 * 例: { "--xhs-gold-time": "#FFB800" } → "--xhs-gold-time:#FFB800;"
 * @param {Object<string, string>} vars
 * @returns {string}
 */
function stringifyGoldVars(vars) {
	if (!vars || typeof vars !== "object") return "";
	return Object.keys(vars)
		.map((k) => `${k}:${vars[k]};`)
		.join("");
}

/**
 * 把 CSS 变量序列化后注入页面（写入 goldVars 字符串，供根容器 style 绑定）
 * @param {Object} pageCtx 页面实例（this），需有 setData
 * @param {Object<string, string>} vars 扁平 CSS 变量对象
 */
function applyToPage(pageCtx, vars) {
	if (!pageCtx || typeof pageCtx.setData !== "function") return;
	pageCtx.setData({ goldVars: stringifyGoldVars(vars) });
}
```

> 注意：原 Task 3 的 `applyToPage` 直接写入对象，此处**替换**为字符串序列化版。删除 Task 3 里旧的 `applyToPage` 函数体，保留新的。`module.exports` 追加 `stringifyGoldVars`。

更新 `module.exports`：
```js
module.exports = {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
	stringifyGoldVars,
	applyToPage,
	startTimer,
	stopTimer,
};
```

- [ ] **Step 2: 更新测试断言**

在 `tests/colorRhythm.test.js` 的 `describe("applyToPage")` 内，把对象断言改为字符串断言：

old:
```js
		applyToPage(fakePage, { "--xhs-gold-time": "#FFB800" });
		expect(received.goldVars).toEqual({ "--xhs-gold-time": "#FFB800" });
```

new:
```js
		applyToPage(fakePage, { "--xhs-gold-time": "#FFB800" });
		expect(received.goldVars).toBe("--xhs-gold-time:#FFB800;");
```

并新增 `stringifyGoldVars` 的 describe：

```js
const { stringifyGoldVars } = require("../utils/services/colorRhythm");

describe("stringifyGoldVars", () => {
	test("对象序列化为 style 字符串", () => {
		expect(stringifyGoldVars({ "--xhs-gold-time": "#FFB800", "--xhs-card-glow-opacity": "0.22" }))
			.toBe("--xhs-gold-time:#FFB800;--xhs-card-glow-opacity:0.22;");
	});
	test("空对象 → 空字符串", () => {
		expect(stringifyGoldVars({})).toBe("");
	});
	test("非对象 → 空字符串（防御）", () => {
		expect(stringifyGoldVars(null)).toBe("");
		expect(stringifyGoldVars(undefined)).toBe("");
	});
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- tests/colorRhythm.test.js`
Expected: PASS

- [ ] **Step 4: 接入 `pages/index/index.js`**

**4a. 顶部 require 区追加（在现有 require 块末尾，约 `index.js:16` 之后）**：

```js
const colorRhythm = require("../../utils/services/colorRhythm");
```

**4b. `data` 块追加 `goldVars`（在 `index.js:107` 的 `tabAnimating: false,` 之后，闭合 `}` 之前）**：

```js
		// 动态金色节奏：根容器 style 内联 CSS 变量（序列化字符串）
		goldVars: "",
```

**4c. `onLoad` 末尾初始化 + 启动定时器（`index.js:133` 的 `}` 之前，即 `if (isTradingTime()...)` 块之后）**：

old（`index.js:131-134` 区段）:
```js
		if (isTradingTime() || hasNoPrice) {
			this._fetchPrices({ silent: true });
		}
	},
```

new:
```js
		if (isTradingTime() || hasNoPrice) {
			this._fetchPrices({ silent: true });
		}

		// 初始化动态金色节奏（时间层 + 数据层盈亏档）
		this._initColorRhythm();
	},

	/**
	 * 初始化动态金色节奏：首次注入 + 启动每分钟轮询
	 */
	_initColorRhythm() {
		const profitPhase = colorRhythm.getProfitPhase(this.data.totalPnLPercent);
		colorRhythm.applyToPage(
			this,
			colorRhythm.buildGoldVars(colorRhythm.getTimePhase(), profitPhase),
		);
		this._crTimer = colorRhythm.startTimer(this, { profitPhase });
	},
```

**4d. `_loadData` 末尾重算盈亏档（在 setData 汇总之后）**：

定位 `index.js:323-347` 的 `const setDataUpdates = { ... }` 之后、`this.setData(setDataUpdates)`（在 setDataUpdates 构建之后调用）。

> ⚠ 需先确认 `this.setData(setDataUpdates)` 的确切调用行。

在 `setData(setDataUpdates)` 调用之后追加（同一 try 块内）：

```js
			// 持仓数据刷新后重算盈亏档（数据层），不影响时间层轮询
			const newProfitPhase = colorRhythm.getProfitPhase(
				setDataUpdates.totalPnLPercent,
			);
			colorRhythm.applyToPage(
				this,
				colorRhythm.buildGoldVars(colorRhythm.getTimePhase(), newProfitPhase),
			);
```

**4e. `onUnload` 追加清理（`index.js:152-157`）**：

old:
```js
	onUnload() {
		// 清理定时器
		if (this._animTimer) clearTimeout(this._animTimer);
		if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
		if (this._tabTimer) clearTimeout(this._tabTimer);
	},
```

new:
```js
	onUnload() {
		// 清理定时器
		if (this._animTimer) clearTimeout(this._animTimer);
		if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
		if (this._tabTimer) clearTimeout(this._tabTimer);
		// 清理色彩节奏轮询（防泄漏，呼应 8f75819）
		if (this._crTimer) {
			colorRhythm.stopTimer(this._crTimer);
			this._crTimer = null;
		}
	},
```

- [ ] **Step 5: 确认 wxml 根容器绑定（Task 8 已完成）**

确认 `index.wxml:1` 已含 `{{goldVars}}`。

- [ ] **Step 6: 运行全量测试**

Run: `npm test`
Expected: PASS（无回归）

- [ ] **Step 7: Lint**

Run: `npx biome check pages/index/index.js utils/services/colorRhythm.js tests/colorRhythm.test.js`
Expected: 无报错

- [ ] **Step 8: Commit**

```bash
git add utils/services/colorRhythm.js tests/colorRhythm.test.js pages/index/index.js pages/index/index.wxml
git commit -m "feat: 首页接入动态金色节奏（时间×盈亏分层叠加）"
```

---

## Task 10: 文档与验收

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-dynamic-gold-color-rhythm.md`（本计划本身，已在创建）
- Modify: `AGENTS.md`（可选，在 Architecture 段补充 colorRhythm 说明）

- [ ] **Step 1: 在 `AGENTS.md` 的 "State Management" 段后追加一节**

```markdown
### Dynamic Color Rhythm (动态金色节奏)

- `utils/constants/colorRhythm.js` — 4 时段色阶表 + 3 档 glow 强度（纯数据）
- `utils/services/colorRhythm.js` — 调度器：`getTimePhase`/`getProfitPhase`/`buildGoldVars`/`applyToPage`/`startTimer`/`stopTimer`
- 四层叠加：时间层（晨午暮夜，每分钟轮询）× 数据层（盈亏档）+ 事件级 shimmer + 交互级 :active
- 页面接入：`onLoad` 调 `_initColorRhythm`，`onUnload` 调 `stopTimer`，根容器 `style` 绑定 `{{goldVars}}`
- 详见 `docs/superpowers/specs/2026-06-21-dynamic-gold-color-rhythm-design.md`
```

- [ ] **Step 2: 全量测试最终确认**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Lint 全量**

Run: `npx biome check pages/ utils/ components/ packageDetail/ packageRecord/`
Expected: 无报错

- [ ] **Step 4: 手动验收清单（需在微信开发者工具中执行）**

| 验收项 | 操作 | 预期 |
|---|---|---|
| 基线兜底 | 改系统时间到不同时段，首页金调随之变化（晨暖/午亮/暮橙/夜沉） | 金色字、持仓卡金边/阴影明暗变化 |
| 数据层 | 持仓整体盈利 vs 亏损 | 盈利时金光更亮（opacity 0.22），亏损时收敛（0.04） |
| 过渡平滑 | 切换时段/盈亏时观察卡片 | 500ms ease 平滑过渡，无突跳 |
| 硬编码消除 | 全局搜索 `#D4A017`/`#FFF8E1`/`#FFE082`/`#FF9500`/`rgba(255, 149, 0` | 仅剩注释或本计划文档引用，代码中无硬编码 |
| 防泄漏 | 频繁进出首页，用开发者工具 Memory 面板观察 | 无定时器泄漏（`_crTimer` 被清理） |
| 兼容兜底 | 临时把 `colorRhythm.applyToPage` 注释掉（模拟 JS 没跑） | 界面仍是正确的午段+持平金色（基线默认值生效） |

- [ ] **Step 5: Commit 文档**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md 补充动态金色节奏架构说明"
```

---

## Self-Review

（写完计划后自检结果）

**1. Spec coverage（spec 各章节 → task 映射）**

| Spec 章节 | 覆盖 task |
|---|---|
| §4.1 收口层令牌（11 个 `--xhs-gold-*`） | Task 4（app.wxss 新增）+ Task 7（index.wxss 引用） |
| §4.2 时间层 4 套 + 数据层 3 档色值 | Task 1（colorRhythm.js 常量表） |
| §4.3 CSS 变量写入机制（基线默认值 + setData 注入） | Task 4（基线）+ Task 9（applyToPage 序列化注入） |
| §5 信号源计算逻辑（4 个函数） | Task 2（getTimePhase/getProfitPhase/buildGoldVars）+ Task 3（startTimer/stopTimer/applyToPage） |
| §6 JS 模块划分（constants + services） | Task 1 + Task 2 + Task 3 |
| §7.1 新建 3 文件 | Task 1（constants）+ Task 2/3（services）+ 各 Task 的 test |
| §7.2 收口硬编码（app.wxss / index.wxss / market-tag / market.js） | Task 4 + Task 7 + Task 5 + Task 6 |
| §7.3 页面接入（index.js / index.wxml） | Task 8 + Task 9 |
| §7.4 测试 | Task 1/2/3/9（colorRhythm.test.js） |
| §10 风险点 1（setData 注入兼容性） | Task 8/9 改为字符串序列化 + Task 4 基线兜底 |
| §10 风险点 2（轮询电量） | Task 3 startTimer 每 60s + Task 9 onUnload 清理 |
| §10 风险点 3（:active 性能） | 未单独做涟漪 ::after（spec §7.2 提到但本期聚焦金色节奏，涟漪属交互层增强，可在第 2 期；Task 7 已加 transition 让 :active 阴影切换平滑） |
| §11 测试策略 | Task 1/2/3/9 全覆盖 |

**遗漏处理**：spec §7.2 提到"持仓卡加 :active 涟漪 ::after"，但涟漪需新 keyframe + wxml 事件钩子，工作量与风险超出第 1 期核心（金色节奏）。本期 Task 7 仅用 transition 让现有 :active 阴影切换平滑，**涟漪 ::after 推迟到第 2 期**。这与 spec §9 分期表一致（第 1 期 = 收口 + index 接入 + 核心模块）。

**2. Placeholder scan**：无 TBD/TODO/「类似 Task N」省略；所有代码块完整。

**3. Type consistency**：
- `goldVars` 类型：Task 3 最初为对象，Task 9 修正为字符串——所有引用点（Task 8 wxml `{{goldVars}}`、Task 9 index.js `data.goldVars`、Task 9 applyToPage）统一为字符串 ✓
- `applyToPage(pageCtx, vars)`：Task 3 与 Task 9 签名一致（`vars` 仍是扁平对象，序列化在函数内部）✓
- `startTimer(pageCtx, options)`：Task 3 与 Task 9 一致，`options.profitPhase` / `options.onTick` ✓
- `stopTimer(timerId)`：Task 3 与 Task 9 index.js 调用一致 ✓
- 令牌名：`--xhs-gold-time` / `--xhs-gold-time-bg` / `--xhs-gold-time-halo` / `--xhs-card-glow-opacity` / `--xhs-card-glow-blur` / `--xhs-card-glow-color` 在 Task 1/4/7 跨文件一致 ✓

**4. 顺序依赖**：Task 1→2→3 是模块构建链（不可乱序）；Task 4 是 wxss 基线（Task 7/9 依赖其令牌存在）；Task 5/6 独立可并行；Task 8+9 必须配对（wxml 绑定 + js 序列化）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-dynamic-gold-color-rhythm.md`. Two execution options:

1. **Subagent-Driven (recommended)** — 每个 task 派发独立 subagent，task 间两阶段 review，迭代快
2. **Inline Execution** — 在当前会话按 batch 执行，带 checkpoint

Which approach?
