module.exports = {
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.js"],
	collectCoverageFrom: ["utils/**/*.js", "pages/**/*.js"],
	coverageReporters: ["text", "lcov"],
	setupFilesAfterEnv: [],
	transform: {
		"^.+.js$": ["babel-jest", { configFile: false, presets: [["@babel/preset-env", { targets: { node: "current" } }]] }],
	},
};
