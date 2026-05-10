import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const __dirname = path.dirname(scriptPath)
const desktopRoot = path.resolve(__dirname, '..')
const sourcePng = path.resolve(desktopRoot, '../web/public/linx-logo.png')
const buildDir = path.resolve(desktopRoot, 'build')
const iconsetDir = path.resolve(buildDir, 'icon.iconset')
const iconPng = path.resolve(buildDir, 'icon.png')
const iconIcns = path.resolve(buildDir, 'icon.icns')
const fallbackIcns = path.resolve(buildDir, 'icon-magick.icns')
const croppedIconPng = path.resolve(buildDir, 'icon.cropped.png')
const roundedIconPng = path.resolve(buildDir, 'icon.rounded.png')
const platedIconPng = path.resolve(buildDir, 'icon.plated.png')
const iconCanvasSize = 1024
const iconPlateSize = 824
const iconArtworkSize = 560
const iconCornerRadius = 185

mkdirSync(buildDir, { recursive: true })

if (!existsSync(sourcePng)) {
  throw new Error(`Logo source not found: ${sourcePng}`)
}

if (process.platform !== 'darwin') {
  console.log('[desktop] Skipping icon generation: macOS tooling required')
  process.exit(0)
}

ensureTool('sips')

if (hasReusableIconArtifacts()) {
  console.log('[desktop] Reusing existing app icons')
  process.exit(0)
}

rmSync(iconsetDir, { force: true, recursive: true })
mkdirSync(iconsetDir, { recursive: true })

if (hasTool('magick')) {
  execFileSync('magick', [
    sourcePng,
    '-fuzz', '8%',
    '-trim',
    '+repage',
    croppedIconPng,
  ], { stdio: 'pipe' })

  execFileSync('magick', [
    '-size', `${iconPlateSize}x${iconPlateSize}`,
    'xc:none',
    '-fill', 'white',
    '-draw', `roundrectangle 0,0 ${iconPlateSize - 1},${iconPlateSize - 1} ${iconCornerRadius},${iconCornerRadius}`,
    `PNG32:${roundedIconPng}`,
  ], { stdio: 'pipe' })

  execFileSync('magick', [
    roundedIconPng,
    '(',
    croppedIconPng,
    '-resize', `${iconArtworkSize}x${iconArtworkSize}`,
    ')',
    '-gravity', 'center',
    '-compose', 'over',
    '-composite',
    `PNG32:${platedIconPng}`,
  ], { stdio: 'pipe' })

  execFileSync('magick', [
    '-size', `${iconCanvasSize}x${iconCanvasSize}`,
    'xc:none',
    '(',
    platedIconPng,
    ')',
    '-gravity', 'center',
    '-compose', 'over',
    '-composite',
    `PNG32:${iconPng}`,
  ], { stdio: 'pipe' })
} else {
  cpSync(sourcePng, iconPng)
}

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

for (const [fileName, size] of sizes) {
  execFileSync('sips', ['-z', String(size), String(size), iconPng, '--out', path.join(iconsetDir, fileName)], {
    stdio: 'pipe',
  })
}

try {
  ensureTool('iconutil')
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', iconIcns], { stdio: 'pipe' })
} catch {
  try {
    ensureTool('magick')
    execFileSync('magick', [iconPng, iconIcns], { stdio: 'pipe' })
  } catch {
    if (existsSync(fallbackIcns)) {
      cpSync(fallbackIcns, iconIcns)
    }
  }
}

console.log(`[desktop] App icons generated at ${buildDir}`)

function ensureTool(command) {
  try {
    execFileSync('which', [command], { stdio: 'pipe' })
  } catch {
    throw new Error(`Required tool not found: ${command}`)
  }
}

function hasTool(command) {
  try {
    execFileSync('which', [command], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function hasReusableIconArtifacts() {
  if (!(existsSync(iconPng) && existsSync(iconsetDir))) {
    return false
  }

  const sourceMtime = statSync(sourcePng).mtimeMs
  const scriptMtime = statSync(scriptPath).mtimeMs
  const iconPngMtime = statSync(iconPng).mtimeMs
  const iconIcnsMtime = existsSync(iconIcns) ? statSync(iconIcns).mtimeMs : 0
  const requiredMtime = Math.max(sourceMtime, scriptMtime)

  return iconPngMtime >= requiredMtime && iconIcnsMtime >= requiredMtime
}
