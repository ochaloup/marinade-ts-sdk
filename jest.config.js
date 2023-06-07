/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 90000,
    roots: ['<rootDir>/test'],
    globalSetup: '<rootDir>/test/setup/globalSetup.ts',
    setupFilesAfterEnv: [
      '<rootDir>/test/setup/equalityTesters.ts',
    ],
  };