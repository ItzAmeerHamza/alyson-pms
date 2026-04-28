/**
 * Jest Configuration for Desktop Agent
 * Supports both JavaScript and TypeScript tests
 */

module.exports = {
  testEnvironment: 'node',
  
  // File extensions to consider
  moduleFileExtensions: ['js', 'ts', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/test/**/*.spec.js',
    '**/test/**/*.spec.ts',
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.ts'
  ],
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module name mapping for TypeScript paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/index.{js,ts}',
    '!src/**/*.spec.{js,ts}',
    '!src/**/*.test.{js,ts}'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  // Globals for TypeScript
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'es2019',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      }
    }
  }
};

