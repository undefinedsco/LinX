import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const resourceRoot = path.resolve(desktopRoot, 'build/xpod-resource')
const siblingXpodRoot = path.resolve(desktopRoot, '../../../xpod-cli')
const packageXpodRoot = path.resolve(desktopRoot, '../../node_modules/@undefineds.co/xpod')
const preferredSource = process.env.LINX_DESKTOP_XPOD_SOURCE?.trim().toLowerCase()

const candidateRoots = preferredSource === 'local'
  ? [siblingXpodRoot, packageXpodRoot]
  : [packageXpodRoot, siblingXpodRoot]

const sourceRoot = candidateRoots.find((candidate) => existsSync(path.join(candidate, 'package.json')))

if (!existsSync(path.join(sourceRoot, 'package.json'))) {
  throw new Error(`Unable to locate xpod source. Checked: ${siblingXpodRoot}, ${packageXpodRoot}`)
}

rmSync(resourceRoot, { recursive: true, force: true })
mkdirSync(resourceRoot, { recursive: true })

for (const entry of ['bin', 'dist', 'config', 'templates', 'static', 'package.json']) {
  const source = path.join(sourceRoot, entry)
  const target = path.join(resourceRoot, entry)
  if (!existsSync(source)) {
    continue
  }
  cpSync(source, target, { recursive: true })
}

console.log(`[desktop] xpod resource prepared from ${sourceRoot}`)
