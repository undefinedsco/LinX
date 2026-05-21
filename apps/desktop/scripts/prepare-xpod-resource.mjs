import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const resourceRoot = path.resolve(desktopRoot, 'build/xpod-resource')
const siblingXpodRoot = path.resolve(desktopRoot, '../../../xpod-cli')
const siblingXpodMainRoot = path.resolve(desktopRoot, '../../../xpod')
const packageXpodRoot = path.resolve(desktopRoot, '../../node_modules/@undefineds.co/xpod')
const preferredSource = process.env.LINX_DESKTOP_XPOD_SOURCE?.trim().toLowerCase()

const candidateRoots = preferredSource === 'sibling'
  ? [siblingXpodMainRoot, siblingXpodRoot, packageXpodRoot]
  : [packageXpodRoot, siblingXpodRoot, siblingXpodMainRoot]

const sourceRoot = candidateRoots.find((candidate) => existsSync(path.join(candidate, 'package.json')))

if (!sourceRoot || !existsSync(path.join(sourceRoot, 'package.json'))) {
  throw new Error(`Unable to locate xpod source. Checked: ${siblingXpodRoot}, ${siblingXpodMainRoot}, ${packageXpodRoot}`)
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

assertNoLegacyOidcContract(resourceRoot)

console.log(`[desktop] xpod resource prepared from ${sourceRoot}`)

function assertNoLegacyOidcContract(root) {
  const textExtensions = new Set(['.cjs', '.js', '.json', '.mjs', '.ts', '.d.ts', '.md'])
  const matches = []

  walk(root, (file) => {
    const extension = file.endsWith('.d.ts') ? '.d.ts' : path.extname(file)
    if (!textExtensions.has(extension)) {
      return
    }

    const content = readFileSync(file, 'utf8')
    for (const pattern of buildLegacyOidcContractPatterns()) {
      const index = content.indexOf(pattern)
      if (index === -1) {
        continue
      }
      const line = content.slice(0, index).split('\n').length
      matches.push(`${path.relative(root, file)}:${line}: ${pattern}`)
    }
  })

  if (matches.length > 0) {
    throw new Error([
      'xpod desktop resource still contains the legacy IdP config contract.',
      'Use oidcIssuer env/shorthand only; do not pass external issuer values through CSS CLI args.',
      ...matches.slice(0, 20),
    ].join('\n'))
  }
}

function buildLegacyOidcContractPatterns() {
  const legacyIdpKey = ['idp', 'Url'].join('')
  const oidcIssuerArg = `--${['oidc', 'Issuer'].join('')}`
  return [
    `--${legacyIdpKey}`,
    oidcIssuerArg,
    `options_${legacyIdpKey}`,
    `_options_${legacyIdpKey}`,
    `variable:${legacyIdpKey}`,
  ]
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) {
      walk(file, visit)
      continue
    }
    if (stat.isFile()) {
      visit(file)
    }
  }
}
