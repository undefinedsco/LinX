import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

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
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})