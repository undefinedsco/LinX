import { spawn } from 'node:child_process'

export function openExternalUrl(url: string, interactive: any): void {
  if (typeof interactive?.openExternal === 'function') {
    interactive.openExternal(url)
    return
  }

  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  child.unref()
}
