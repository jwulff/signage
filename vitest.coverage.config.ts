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

    coverage: {
      provider: 'v8',
      reporter: isCI ? ['text', 'json', 'lcov'] : ['text', 'html'],
      reportsDirectory: './coverage',

      include: [
        'packages/core/src/**/*.ts',
        'packages/functions/src/**/*.ts',
        'packages/relay/src/**/*.ts',
        'packages/web/src/**/*.{ts,tsx}',
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

      // Phase 2: Add global threshold based on baseline
      // thresholds: {
      //   lines: 80,
      //   branches: 75,
      //   functions: 80,
      //   statements: 80,
      // },
    },
  },
})
