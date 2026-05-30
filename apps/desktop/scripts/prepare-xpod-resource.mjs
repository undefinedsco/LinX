import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const explicitResourceRoot = process.env.LINX_DESKTOP_XPOD_RESOURCE_OUTPUT_ROOT?.trim()
const resourceRoot = explicitResourceRoot
  ? path.resolve(explicitResourceRoot)
  : path.resolve(desktopRoot, 'build/xpod-resource')
const siblingXpodRoot = path.resolve(desktopRoot, '../../../xpod')
const packageXpodRoot = path.resolve(desktopRoot, '../../node_modules/@undefineds.co/xpod')
const preferredSource = process.env.LINX_DESKTOP_XPOD_SOURCE?.trim().toLowerCase()
const explicitSourceRoot = process.env.LINX_DESKTOP_XPOD_RESOURCE_ROOT?.trim()
const maxResourceSizeMb = Number(process.env.LINX_DESKTOP_MAX_XPOD_RESOURCE_MB || '25')
const forbiddenArtifactPaths = new Set([
  'dist/xpod-single.cjs',
  'dist/xpod.single.cjs',
])
const embeddedRuntimeDependencyRoots = [
  'jsonld',
]
const copiedRuntimeDependencies = new Set()

const candidateRoots = explicitSourceRoot
  ? [path.resolve(explicitSourceRoot)]
  : preferredSource === 'sibling'
  ? [siblingXpodRoot, packageXpodRoot]
  : [packageXpodRoot, siblingXpodRoot]

const sourceRoot = candidateRoots.find((candidate) => existsSync(path.join(candidate, 'package.json')))

if (!sourceRoot || !existsSync(path.join(sourceRoot, 'package.json'))) {
  throw new Error(`Unable to locate xpod source. Checked: ${siblingXpodRoot}, ${packageXpodRoot}`)
}
assertXpodLoginRuntimeCapabilities(sourceRoot)

rmSync(resourceRoot, { recursive: true, force: true })
mkdirSync(resourceRoot, { recursive: true })

for (const entry of ['bin', 'dist', 'config', 'templates', 'static', 'package.json']) {
  const source = path.join(sourceRoot, entry)
  const target = path.join(resourceRoot, entry)
  if (!existsSync(source)) {
    continue
  }
  cpSync(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: shouldCopyXpodResource,
  })
}

copyEmbeddedRuntimeDependencies()
assertNoForbiddenArtifacts(resourceRoot)
assertNoLegacyOidcContract(resourceRoot)
const resourceSizeBytes = assertResourceSize(resourceRoot, maxResourceSizeMb)

console.log(`[desktop] xpod resource prepared from ${sourceRoot}`)
console.log(`[desktop] xpod resource size ${(resourceSizeBytes / 1024 / 1024).toFixed(2)} MB`)

function shouldCopyXpodResource(source) {
  const relative = path.relative(sourceRoot, source).split(path.sep).join('/')
  if (relative === '') {
    return true
  }

  if (isForbiddenSourceResourcePath(relative)) {
    return false
  }

  if (relative.endsWith('.map') || relative.endsWith('.d.ts') || relative.endsWith('.tsbuildinfo')) {
    return false
  }

  if (relative.startsWith('dist/test-utils/') || relative.startsWith('dist/npm/')) {
    return false
  }

  return true
}

function copyEmbeddedRuntimeDependencies() {
  for (const packageName of embeddedRuntimeDependencyRoots) {
    copyEmbeddedRuntimeDependency(packageName)
  }
}

function copyEmbeddedRuntimeDependency(packageName) {
  if (copiedRuntimeDependencies.has(packageName)) {
    return
  }

  const packageDir = resolveDependencyPackageDir(packageName)
  if (!packageDir) {
    const sourcePkg = readJsonIfExists(path.join(sourceRoot, 'package.json'))
    const hasRuntimeDependency = Boolean(sourcePkg?.dependencies?.[packageName])
    if (hasRuntimeDependency) {
      throw new Error(`xpod runtime dependency '${packageName}' is declared but not installed near ${sourceRoot}`)
    }
    return
  }

  copiedRuntimeDependencies.add(packageName)
  const targetDir = path.join(resourceRoot, 'node_modules', ...packageName.split('/'))
  cpSync(packageDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    dereference: true,
    filter: shouldCopyRuntimeDependencyFile,
  })

  const packageJson = readJsonIfExists(path.join(packageDir, 'package.json'))
  for (const dependencyName of Object.keys(packageJson?.dependencies ?? {})) {
    copyEmbeddedRuntimeDependency(dependencyName)
  }
}

function resolveDependencyPackageDir(packageName) {
  let current = path.resolve(sourceRoot)
  while (true) {
    const candidates = [
      path.join(current, 'node_modules', ...packageName.split('/')),
    ]
    if (path.basename(current) === 'node_modules') {
      candidates.push(path.join(current, ...packageName.split('/')))
    }

    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, 'package.json'))) {
        return candidate
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

function shouldCopyRuntimeDependencyFile(source) {
  const basename = path.basename(source)
  if (basename === 'node_modules') {
    return false
  }

  if (source.endsWith('.map') || source.endsWith('.d.ts') || source.endsWith('.tsbuildinfo')) {
    return false
  }

  return true
}

function assertNoForbiddenArtifacts(root) {
  const matches = []
  walk(root, (file) => {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (isForbiddenResourcePath(relative)) {
      matches.push(relative)
    }
  })

  if (matches.length > 0) {
    throw new Error([
      'xpod desktop resource contains forbidden legacy single-file artifacts.',
      'These files make the desktop package hundreds of MB and slow cold start.',
      ...matches,
    ].join('\n'))
  }
}

function isForbiddenResourcePath(relative) {
  if (forbiddenArtifactPaths.has(relative)) {
    return true
  }

  if (relative === 'node_modules') {
    return false
  }

  if (relative.startsWith('node_modules/')) {
    return !isAllowedRuntimeDependencyPath(relative)
  }

  return false
}

function isForbiddenSourceResourcePath(relative) {
  return forbiddenArtifactPaths.has(relative) || relative === 'node_modules' || relative.startsWith('node_modules/')
}

function isAllowedRuntimeDependencyPath(relative) {
  const parts = relative.split('/')
  if (parts.length < 2 || parts[0] !== 'node_modules') {
    return false
  }

  if (parts[1]?.startsWith('@')) {
    if (parts.length === 2) {
      return Array.from(copiedRuntimeDependencies).some((name) => name.startsWith(`${parts[1]}/`))
    }
    return copiedRuntimeDependencies.has(`${parts[1]}/${parts[2]}`)
  }

  return copiedRuntimeDependencies.has(parts[1])
}

function assertResourceSize(root, maxSizeMb) {
  let size = 0
  walk(root, (file) => {
    size += statSync(file).size
  })

  if (Number.isFinite(maxSizeMb) && maxSizeMb > 0) {
    const maxSizeBytes = maxSizeMb * 1024 * 1024
    if (size > maxSizeBytes) {
      throw new Error([
        `xpod desktop resource is too large: ${(size / 1024 / 1024).toFixed(2)} MB > ${maxSizeMb} MB.`,
        'Do not ship full xpod node_modules or legacy single-file artifacts in LinX Desktop.',
        'Use LINX_DESKTOP_MAX_XPOD_RESOURCE_MB only for explicit local experiments.',
      ].join('\n'))
    }
  }

  return size
}

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
      'Use oidcIssuer as the only xpod/CSS shorthand; do not reintroduce idpUrl aliases.',
      ...matches.slice(0, 20),
    ].join('\n'))
  }
}

function assertXpodLoginRuntimeCapabilities(root) {
  const hasScopedPickWebIdHandler = existsSync(path.join(root, 'src', 'identity', 'oidc', 'ScopedPickWebIdHandler.ts'))
    || existsSync(path.join(root, 'dist', 'identity', 'oidc', 'ScopedPickWebIdHandler.js'))
  const hasScopedPickerConfig = existsSync(path.join(root, 'config', 'xpod.base.json'))

  if (hasScopedPickWebIdHandler && hasScopedPickerConfig) {
    return
  }

  throw new Error([
    `xpod source at ${root} does not include scoped WebID selection.`,
    'Desktop Local login must not ship a runtime that can expose Cloud Pods in Local consent.',
  ].join('\n'))
}

function buildLegacyOidcContractPatterns() {
  const legacyIdpKey = ['idp', 'Url'].join('')
  return [
    `--${legacyIdpKey}`,
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

function readJsonIfExists(file) {
  if (!existsSync(file)) {
    return null
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}
