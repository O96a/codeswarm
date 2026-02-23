/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  // Timeout per test (default 5s is too short for integration tests)
  testTimeout: 30000,

  // Force exit after all tests complete — prevents hanging from leaked timers
  // in tests like parallel-executor that use setTimeout-based retry backoff.
  forceExit: true,

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/src/providers/' // External integrations, hard to test without live APIs
  ]
};
