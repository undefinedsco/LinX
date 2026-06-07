import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  version?: string
}
const appVersion = String(process.env.VITE_APP_VERSION ?? packageJson.version ?? '0.0.0').replace(/^v/i, '')
const releaseRepo = String(process.env.VITE_RELEASE_REPO ?? 'undefinedsco/LinX')
const assetBase = process.env.LINX_VITE_BASE ?? '/'
const outputDir = process.env.LINX_VITE_OUT_DIR ?? 'dist'
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

  throw new Error('Cannot resolve @undefineds.co/models. Run yarn install, or set LINX_MODELS_ROOT to an explicit external checkout.')
}

function resolveDrizzleSolidEntry(): string {
  const candidates = [
    process.env.LINX_DRIZZLE_SOLID_ROOT,
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

  throw new Error('Cannot resolve @undefineds.co/drizzle-solid. Run yarn install, or set LINX_DRIZZLE_SOLID_ROOT to an explicit built checkout.')
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

function getPackageName(id: string): string | null {
  const marker = '/node_modules/'
  const start = id.lastIndexOf(marker)
  if (start === -1) return null

  const remainder = id.slice(start + marker.length)
  const segments = remainder.split('/')
  if (segments[0]?.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0]
  }
  return segments[0] ?? null
}

function resolveVendorChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined

  const pkg = getPackageName(id)
  if (!pkg) return undefined

  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
    return 'vendor-react'
  }

  if (pkg.startsWith('@tanstack/')) {
    return 'vendor-tanstack'
  }

  if (
    pkg.startsWith('@radix-ui/') ||
    pkg.startsWith('@floating-ui/') ||
    pkg === 'aria-hidden' ||
    pkg === 'lucide-react' ||
    pkg === 'class-variance-authority' ||
    pkg === 'tailwind-merge' ||
    pkg === 'clsx' ||
    pkg === 'cmdk' ||
    pkg === 'react-remove-scroll' ||
    pkg === 'react-remove-scroll-bar' ||
    pkg === 'react-style-singleton' ||
    pkg === 'use-callback-ref' ||
    pkg === 'use-sidecar'
  ) {
    return 'vendor-ui'
  }

  if (
    pkg === 'zustand' ||
    pkg === 'react-resizable-panels'
  ) {
    return 'vendor-state'
  }

  if (
    pkg === 'react-markdown' ||
    pkg === 'remark-gfm' ||
    pkg === 'remark-math' ||
    pkg === 'rehype-katex' ||
    pkg === 'katex'
  ) {
    return 'vendor-markdown'
  }

  if (pkg === 'mermaid' || pkg === 'd3' || pkg.startsWith('d3-')) {
    return 'vendor-mermaid'
  }

  return undefined
}

export default defineConfig({
  base: assetBase,
  plugins: [react()],
  optimizeDeps: {
    exclude: [
      '@linx/stores',
      '@linx/stores/login',
    ],
  },
  define: {
    __LINX_APP_VERSION__: JSON.stringify(appVersion),
    __LINX_RELEASE_REPO__: JSON.stringify(releaseRepo),
  },
  resolve: {
    // Keep workspace-linked packages under this app's node_modules tree so their
    // peer dependencies resolve to the patched app-level installs.
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@linx/agent-runtime': path.resolve(__dirname, '../../packages/agent-runtime/src'),
      '@linx/stores': path.resolve(__dirname, '../../packages/stores/src'),
      ...modelsAliases,
      '@undefineds.co/drizzle-solid': drizzleSolidEntry,
      '@inrupt/solid-client-authn-browser': inruptAuthnBrowser,
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
  },
  build: {
    outDir: outputDir,
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveVendorChunk(id)
        },
      },
    },
  },
})
