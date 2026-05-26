import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.resolve(__dirname, '../package.json')
const rootPackageJsonPath = path.resolve(__dirname, '../../..', 'package.json')
const outputPath = path.resolve(__dirname, '../src/generated/build-meta.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'))

const version = normalizeVersion(process.env.LINX_APP_VERSION || packageJson.version)
const releaseRepo = (process.env.LINX_RELEASE_REPO || 'undefinedsco/LinX').trim()
const xpodVersion = resolveXpodVersion(rootPackageJson, desktopRoot)

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  `${JSON.stringify({ version, releaseRepo, xpodVersion }, null, 2)}\n`,
)

console.log(`[desktop] Build meta prepared: version=${version} repo=${releaseRepo} xpod=${xpodVersion}`)

function normalizeVersion(raw) {
  const normalized = String(raw || '').trim().replace(/^v/i, '')
  return normalized || String(packageJson.version)
}

function resolveXpodVersion(rootPackageJson, desktopRoot) {
  const resourcePackageVersion = readXpodResourcePackageVersion(desktopRoot)
  const version = resourcePackageVersion
    || rootPackageJson.dependencies?.['@undefineds.co/xpod']
    || rootPackageJson.optionalDependencies?.['@undefineds.co/xpod']
    || rootPackageJson.devDependencies?.['@undefineds.co/xpod']

  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Root package.json must declare an exact @undefineds.co/xpod version for desktop runtime packaging.')
  }

  return version
}

function readXpodResourcePackageVersion(desktopRoot) {
  try {
    const resourcePackagePath = path.resolve(desktopRoot, 'build/xpod-resource/package.json')
    const resourcePackageJson = JSON.parse(readFileSync(resourcePackagePath, 'utf8'))
    return typeof resourcePackageJson.version === 'string' ? resourcePackageJson.version : null
  } catch {
    return null
  }
}
