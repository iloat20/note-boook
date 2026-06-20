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
