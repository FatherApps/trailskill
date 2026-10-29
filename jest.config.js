module.exports = {
  preset: 'jest-expo',
  // App code and the Edge Function modules (plain TypeScript shared with Deno); deploy/, the rest of supabase/ and tooling stay out.
  roots: ['<rootDir>/src', '<rootDir>/supabase/functions'],
  // Helpers (fakes) may live next to the tests without being run as suites.
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  globalSetup: '<rootDir>/jest.global-setup.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
