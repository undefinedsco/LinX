import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

const integrationConfig = mergeConfig(baseConfig, defineConfig({
  test: {
    globalSetup: ['./src/test/xpod-global-setup.ts'],
    include: [
      'src/**/*.integration.test.ts',
      'src/**/*.integration.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.spec.ts',
    ],
    // Local xpod instances use SQLite-backed state and must not contend in parallel.
    maxConcurrency: 1,
    fileParallelism: false,
    slowTestThreshold: 10_000,
  },
}))

// mergeConfig concatenates exclude arrays; replace the unit-only exclusions here.
integrationConfig.test = {
  ...integrationConfig.test,
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.spec.ts',
  ],
}

export default integrationConfig
