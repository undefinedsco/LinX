import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(__dirname, '../package.json')
const outputPath = path.resolve(__dirname, '../src/generated/build-meta.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const version = normalizeVersion(process.env.LINX_APP_VERSION || packageJson.version)
const releaseRepo = (process.env.LINX_RELEASE_REPO || 'undefinedsco/LinX').trim()

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  `${JSON.stringify({ version, releaseRepo }, null, 2)}\n`,
)

console.log(`[desktop] Build meta prepared: version=${version} repo=${releaseRepo}`)

function normalizeVersion(raw) {
  const normalized = String(raw || '').trim().replace(/^v/i, '')
  return normalized || String(packageJson.version)
}
