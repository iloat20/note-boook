module.exports = {
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.js"],
	testPathIgnorePatterns: ["/node_modules/", "/.claude/", "/worktrees/"],
	collectCoverageFrom: ["utils/**/*.js", "pages/**/*.js"],
	coverageReporters: ["text", "lcov"],
	setupFilesAfterEnv: [],
	transform: {
		"^.+.js$": ["babel-jest", { configFile: false, presets: [["@babel/preset-env", { targets: { node: "current" } }]] }],
	},
};