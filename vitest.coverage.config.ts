import { defineConfig, coverageConfigDefaults } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isCI = process.env.CI === 'true'

export default defineConfig({
  resolve: {
    alias: {
      '@signage/core': resolve(__dirname, 'packages/core/src'),
      '@signage/functions': resolve(__dirname, 'packages/functions/src'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.spec.ts',
    ],
    // Exclude web tests from coverage run - they use jsdom and run separately
    exclude: [
      'packages/web/**',
      'node_modules/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: isCI ? ['text', 'json', 'lcov'] : ['text', 'html'],
      reportsDirectory: './coverage',

      include: [
        'packages/core/src/**/*.ts',
        'packages/functions/src/**/*.ts',
        'packages/relay/src/**/*.ts',
        // Web coverage excluded - tests run separately with jsdom
      ],

      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/types/**',
        '**/__mocks__/**',
        '**/*.config.ts',
        '**/index.ts',
      ],

      thresholds: {
        lines: 20,
        branches: 15,
        functions: 20,
        statements: 20,
      },
    },
  },
})
