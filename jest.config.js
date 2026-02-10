/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  // Timeout per test (default 5s is too short for integration tests)
  testTimeout: 30000,

  // Force exit after all tests complete — prevents hanging from leaked timers
  // in tests like parallel-executor that use setTimeout-based retry backoff.
  forceExit: true,
};
