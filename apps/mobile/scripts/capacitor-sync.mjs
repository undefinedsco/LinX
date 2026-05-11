import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const mobileRoot = path.resolve(__dirname, '..')
const nativePlatforms = ['android', 'ios'].filter((platform) =>
  fs.existsSync(path.join(mobileRoot, platform))
)

if (nativePlatforms.length === 0) {
  console.log('[mobile] No native Capacitor projects checked in; skipping sync.')
  process.exit(0)
}

const capacitorCli = require.resolve('@capacitor/cli/bin/capacitor')
const result = spawnSync(process.execPath, [capacitorCli, 'sync', ...nativePlatforms], {
  cwd: mobileRoot,
  env: process.env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
