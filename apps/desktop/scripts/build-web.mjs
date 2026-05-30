import { spawnSync } from 'node:child_process'

const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
const result = spawnSync(yarn, ['workspace', '@linx/web', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LINX_VITE_BASE: './',
    LINX_VITE_OUT_DIR: 'dist-desktop',
  },
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
