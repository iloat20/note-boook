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

const {
	getTimePhase,
	getProfitPhase,
	buildGoldVars,
	stringifyGoldVars,
	applyToPage,
	startTimer,
	stopTimer,
} = require("../utils/services/colorRhythm");

// ── 常量表 ──

describe("colorRhythm constants", () => {
	test("TIME_PHASES 包含四个时段，每个时段含 3 个变量", () => {
		expect(TIME_PHASE_NAMES).toEqual(["morning", "noon", "dusk", "night"]);
		for (const phase of TIME_PHASE_NAMES) {
			expect(TIME_PHASES[phase]).toBeDefined();
			expect(Object.keys(TIME_PHASES[phase]).sort()).toEqual(
				["--xhs-gold-time", "--xhs-gold-time-bg", "--xhs-gold-time-halo"].sort(),
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

// ── 纯函数 ──

describe("getTimePhase", () => {
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
		expect(getTimePhase(atHour(9))).toBe("noon");
		expect(getTimePhase(atHour(16))).toBe("dusk");
		expect(getTimePhase(atHour(19))).toBe("night");
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

// ── 序列化 ──

describe("stringifyGoldVars", () => {
	test("对象序列化为 style 字符串", () => {
		expect(
			stringifyGoldVars({
				"--xhs-gold-time": "#FFB800",
				"--xhs-card-glow-opacity": "0.22",
			}),
		).toBe("--xhs-gold-time:#FFB800;--xhs-card-glow-opacity:0.22;");
	});
	test("空对象 → 空字符串", () => {
		expect(stringifyGoldVars({})).toBe("");
	});
	test("非对象 → 空字符串（防御）", () => {
		expect(stringifyGoldVars(null)).toBe("");
		expect(stringifyGoldVars(undefined)).toBe("");
	});
});

// ── 副作用 ──

describe("applyToPage", () => {
	test("调用 setData 写入 goldVars 字符串", () => {
		const received = {};
		const fakePage = {
			setData(payload) {
				Object.assign(received, payload);
			},
		};
		applyToPage(fakePage, { "--xhs-gold-time": "#FFB800" });
		expect(received.goldVars).toBe("--xhs-gold-time:#FFB800;");
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

	test("startTimer 返回 timerId（truthy）", () => {
		const id = startTimer({ setData() {} });
		expect(id).toBeTruthy();
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
				received.push(payload.goldVars);
			},
		};
		// mock Date 构造函数，锁定为 12:00 → noon → #FFB800
		const fixedDate = new Date(2026, 5, 15, 12, 0);
		jest.spyOn(globalThis, "Date").mockImplementation(() => fixedDate);
		const id = startTimer(fakePage);
		jest.advanceTimersByTime(60 * 1000);
		expect(received.length).toBeGreaterThan(0);
		expect(received[0]).toContain("--xhs-gold-time:#FFB800;");
		Date.mockRestore();
		stopTimer(id);
	});
});
