import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  version?: string
}
const appVersion = String(process.env.VITE_APP_VERSION ?? packageJson.version ?? '0.0.0').replace(/^v/i, '')
const releaseRepo = String(process.env.VITE_RELEASE_REPO ?? 'undefinedsco/LinX')
const assetBase = process.env.LINX_VITE_BASE ?? '/'
const outputDir = process.env.LINX_VITE_OUT_DIR ?? 'dist'
const repoRoot = path.resolve(__dirname, '../..')
const modelsRoot = path.resolve(repoRoot, 'packages/models/src')
const modelsIndex = path.resolve(modelsRoot, 'index.ts')
const modelsClientIndex = path.resolve(modelsRoot, 'client/index.ts')
const drizzleRuntime = path.resolve(
  repoRoot,
  'node_modules/@undefineds.co/drizzle-solid/dist/esm/core/execution/ldp-executor.js',
)
const modelsRuntime = path.resolve(modelsRoot, 'ai-config/index.ts')
const inruptAuthnBrowser = path.resolve(
  repoRoot,
  'node_modules/@inrupt/solid-client-authn-browser/dist/index.mjs',
)
const modelAliases: Record<string, string> = existsSync(modelsIndex)
  ? {
    '@undefineds.co/models/client': modelsClientIndex,
    '@undefineds.co/models': modelsIndex,
  }
  : {}

function fingerprintFiles(paths: string[]): string {
  const hash = createHash('sha256')
  for (const file of paths) {
    hash.update(file)
    hash.update(existsSync(file) ? readFileSync(file) : 'missing')
  }
  return hash.digest('hex').slice(0, 12)
}

const dependencyRuntimeFingerprint = fingerprintFiles([drizzleRuntime, modelsRuntime])

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
    // Workspace and normalized runtime dependencies must remain pre-bundled.
    // Include their runtime fingerprint in Vite's optimizer plugin names so
    // browsers cannot reuse an immutable bundle after local package changes.
    rolldownOptions: {
      plugins: [{ name: `linx-dependency-runtime-${dependencyRuntimeFingerprint}` }],
    },
    exclude: [
      '@linx/stores',
      '@linx/stores/login',
      '@linx/stores/pod-db',
      '@linx/stores/symphony-control',
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
    // Pod schemas and collections must share one drizzle-solid runtime. Besides
    // avoiding split class identities, this invalidates Vite's optimized graph
    // when either shared runtime changes.
    dedupe: ['@undefineds.co/drizzle-solid', '@undefineds.co/models'],
    alias: {
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
      '@linx/stores': path.resolve(__dirname, '../../packages/stores/src'),
      ...modelAliases,
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
