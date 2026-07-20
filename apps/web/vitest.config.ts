import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync } from 'node:fs'

const repoRoot = path.resolve(__dirname, '../..')
const modelsRoot = path.resolve(repoRoot, 'packages/models/src')
const modelsIndex = path.resolve(modelsRoot, 'index.ts')
const modelsClientIndex = path.resolve(modelsRoot, 'client/index.ts')
const inruptAuthnBrowser = path.resolve(
  repoRoot,
  'node_modules/@inrupt/solid-client-authn-browser/dist/index.mjs',
)
const modelAliases = existsSync(modelsIndex)
  ? {
    '@undefineds.co/models/client': modelsClientIndex,
    '@undefineds.co/models': modelsIndex,
  }
  : {}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    // Load .env from project root
    env: {
      dir: path.resolve(__dirname, '../..'),
    },
    // Exclude Playwright E2E tests (*.spec.ts) and benchmark tests
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', '**/*benchmark*.test.ts'],
    // Limit concurrency for integration tests to avoid Solid server lock contention
    // Integration tests (*.integration.test.ts) access the same Pod and can cause
    // file lock race conditions if run in parallel
    maxConcurrency: 1,
    fileParallelism: false,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      'tldraw/tldraw.css': path.resolve(__dirname, './src/test/empty.css'),
      'tldraw': path.resolve(__dirname, './src/test/tldraw-test-double.tsx'),
      '@': path.resolve(__dirname, './src'),
      '@linx/agent-runtime': path.resolve(repoRoot, 'packages/agent-runtime/src'),
      '@linx/agent-runtime/pod-resource-identity': path.resolve(
        repoRoot,
        'packages/agent-runtime/src/pod-resource-identity.ts',
      ),
      '@linx/stores/current-pod-base': path.resolve(repoRoot, 'packages/stores/src/current-pod-base.ts'),
      '@linx/stores/exact-records': path.resolve(repoRoot, 'packages/stores/src/exact-records.ts'),
      '@linx/stores/pod-db': path.resolve(repoRoot, 'packages/stores/src/pod-collection.ts'),
      '@linx/stores/pod-write-guard': path.resolve(repoRoot, 'packages/stores/src/pod-write-guard.ts'),
      '@linx/stores/symphony-control': path.resolve(repoRoot, 'packages/stores/src/symphony-control.ts'),
      '@linx/stores': path.resolve(repoRoot, 'packages/stores/src'),
      ...modelAliases,
      '@inrupt/solid-client-authn-browser': inruptAuthnBrowser,
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
  },
})
