import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

await build({
  absWorkingDir: workspaceRoot,
  entryPoints: [
    'src/index.ts',
    'src/lib/chat-api.ts',
    'src/lib/credentials-store.ts',
    'src/lib/thread-utils.ts',
  ],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outExtension: {
    '.js': '.cjs',
  },
  sourcemap: true,
  logLevel: 'info',
})
