import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const cliRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const env = {
  ...process.env,
  LINX_LIVE_ACP_SMOKE: '1',
}

const result = spawnSync(process.execPath, [
  '--test',
  '--test-concurrency=1',
  join('test', 'live-acp-smoke.test.mjs'),
], {
  cwd: cliRoot,
  env,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exitCode = result.status ?? 1
