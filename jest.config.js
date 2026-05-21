module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'utils/**/*.js',
    'pages/**/*.js'
  ],
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: [],
  transform: {
    '^.+\.js$': 'babel-jest'
  }
}
