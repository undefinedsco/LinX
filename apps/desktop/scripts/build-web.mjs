import { spawnSync } from 'node:child_process'

const yarnCli = process.env.npm_execpath
const command = yarnCli ? process.execPath : 'yarn'
const args = yarnCli
  ? [yarnCli, 'workspace', '@linx/web', 'build']
  : ['workspace', '@linx/web', 'build']

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: !yarnCli && process.platform === 'win32',
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
