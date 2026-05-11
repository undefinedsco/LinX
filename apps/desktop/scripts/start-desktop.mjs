import { existsSync } from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const packagedAppPath = path.resolve(desktopRoot, 'release/mac-arm64/LinX.app')

main()

function main() {
  execFileSync('yarn', ['run', 'build'], {
    cwd: desktopRoot,
    stdio: 'inherit',
  })

  if (process.platform === 'darwin') {
    execFileSync('yarn', ['run', 'package:dir'], {
      cwd: desktopRoot,
      stdio: 'inherit',
    })

    if (existsSync(packagedAppPath)) {
      launch('open', ['-n', packagedAppPath])
      return
    }
  }

  launch('electron', ['.'], { shell: true })
}

function launch(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    detached: false,
    ...options,
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}
