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
