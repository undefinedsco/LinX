import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'

const repoRoot = path.resolve(__dirname, '../..')
const modelsRoot = resolveModelsModuleRoot()
const drizzleSolidEntry = resolveDrizzleSolidEntry()
const inruptAuthnBrowser = path.resolve(
  repoRoot,
  'node_modules/@inrupt/solid-client-authn-browser/dist/index.mjs',
)

function resolveModelsModuleRoot(): string {
  const candidates = [
    process.env.LINX_MODELS_ROOT,
    process.env.LINX_MODELS_PATH,
    path.resolve(repoRoot, '../models'),
    path.resolve(repoRoot, 'packages/models'),
    path.resolve(repoRoot, 'node_modules/@undefineds.co/models'),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const pkgPath = path.join(candidate, 'package.json')
    if (!existsSync(pkgPath)) continue

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
    if (pkg.name !== '@undefineds.co/models') continue

    const distRoot = path.join(candidate, 'dist')
    if (existsSync(distRoot)) return distRoot
    return path.join(candidate, 'src')
  }

  throw new Error('Cannot resolve @undefineds.co/models. Clone ../models or set LINX_MODELS_ROOT.')
}

function resolveDrizzleSolidEntry(): string {
  const candidates = [
    process.env.LINX_DRIZZLE_SOLID_ROOT,
    path.resolve(repoRoot, '../drizzle-solid'),
    path.resolve(repoRoot, 'node_modules/@undefineds.co/drizzle-solid'),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const pkgPath = path.join(candidate, 'package.json')
    if (!existsSync(pkgPath)) continue

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
    if (pkg.name !== '@undefineds.co/drizzle-solid') continue

    const esmEntry = path.join(candidate, 'dist/esm/index.js')
    if (existsSync(esmEntry)) return esmEntry
  }

  throw new Error('Cannot resolve @undefineds.co/drizzle-solid. Build ../drizzle-solid or run yarn install.')
}

function resolveModelsEntry(relativeModule: string): string {
  const tsPath = path.resolve(modelsRoot, `${relativeModule}.ts`)
  if (existsSync(tsPath)) return tsPath
  return path.resolve(modelsRoot, `${relativeModule}.js`)
}

const modelsAliases = {
  '@undefineds.co/models/ai-config': resolveModelsEntry('ai-config/index'),
  '@undefineds.co/models/client': resolveModelsEntry('client/index'),
  '@undefineds.co/models/discovery': resolveModelsEntry('discovery/index'),
  '@undefineds.co/models/interop': resolveModelsEntry('interop/index'),
  '@undefineds.co/models/namespaces': resolveModelsEntry('namespaces'),
  '@undefineds.co/models/profile': resolveModelsEntry('profile'),
  '@undefineds.co/models/profile.repository': resolveModelsEntry('profile.repository'),
  '@undefineds.co/models/profile.schema': resolveModelsEntry('profile.schema'),
  '@undefineds.co/models/vocab/sidecar': resolveModelsEntry('vocab/sidecar.vocab'),
  '@undefineds.co/models/vocab': resolveModelsEntry('vocab/index'),
  '@undefineds.co/models': resolveModelsEntry('index'),
}

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
      '@': path.resolve(__dirname, './src'),
      '@linx/stores': path.resolve(repoRoot, 'packages/stores/src'),
      ...modelsAliases,
      '@undefineds.co/drizzle-solid': drizzleSolidEntry,
      '@inrupt/solid-client-authn-browser': inruptAuthnBrowser,
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
  },
})
