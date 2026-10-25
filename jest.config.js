module.exports = {
  preset: 'jest-expo',
  // Only app code: keeps deploy/, supabase/ and tooling folders out of Jest.
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
