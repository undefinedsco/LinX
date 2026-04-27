import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const previewRoot = join(repoRoot, 'preview')
const prefix = mkdtempSync(join(tmpdir(), 'linx-cli-release-prefix-'))
const cache = mkdtempSync(join(tmpdir(), 'linx-cli-release-cache-'))

const modelsTarball = findTarball(/^undefineds-co-models-.+\.tgz$/)
const cliTarball = findTarball(/^undefineds-co-linx-.+\.tgz$/)

mkdirSync(prefix, { recursive: true })
mkdirSync(cache, { recursive: true })

run('npm', [
  'i',
  '-g',
  '--no-audit',
  '--no-fund',
  '--loglevel=info',
  '--fetch-timeout=30000',
  '--fetch-retries=2',
  '--prefix',
  prefix,
  '--cache',
  cache,
  modelsTarball,
  cliTarball,
])

const binDir = process.platform === 'win32' ? prefix : join(prefix, 'bin')
const linxBin = process.platform === 'win32' ? join(prefix, 'linx.cmd') : join(binDir, 'linx')
if (!existsSync(linxBin)) {
  throw new Error(`linx binary not found at ${linxBin}`)
}

const smokeEnv = {
  ...process.env,
  PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
}

run(linxBin, ['--help'], { env: smokeEnv })
run(linxBin, ['--version'], { env: smokeEnv })
assertInstalledDrizzleSolidPatch()

console.log(`release smoke install passed: ${linxBin}`)

function findTarball(pattern) {
  const matches = readdirSync(previewRoot)
    .filter((name) => pattern.test(name))
    .sort()
  const latest = matches.at(-1)
  if (!latest) {
    throw new Error(`No tarball matching ${pattern} in ${previewRoot}`)
  }
  return join(previewRoot, latest)
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status ?? 1}`)
  }
}

function assertInstalledDrizzleSolidPatch() {
  const packageRoot = findInstalledPackageRoot('@undefineds.co/drizzle-solid')
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const resolverSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'uri', 'resolver.js'), 'utf8')
  const tripleBuilderSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'triple', 'builder.js'), 'utf8')

  const hasCompoundTemplateResolver = resolverSource.includes('resolveTemplateVariable')
    && resolverSource.includes('Unresolved URI template variable')
  const hasCurrentRecordContext = tripleBuilderSource.includes('__currentRecord')
    && tripleBuilderSource.includes('createContext(record, currentTable)')

  if (!hasCompoundTemplateResolver || !hasCurrentRecordContext) {
    throw new Error(
      `Installed @undefineds.co/drizzle-solid@${packageJson.version} does not include the compound URI template link-resolution patch. `
        + 'Publish/install a fixed drizzle-solid before publishing @undefineds.co/models or @undefineds.co/linx.',
    )
  }

  console.log(`verified @undefineds.co/drizzle-solid@${packageJson.version} compound URI template patch`)
}

function findInstalledPackageRoot(packageName) {
  const segments = packageName.split('/')
  const nodeModulesRoots = [
    process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules'),
  ]
  const queue = [...nodeModulesRoots]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || !existsSync(current)) continue

    const candidate = join(current, ...segments)
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue

      const child = join(current, entry.name)
      if (entry.name === 'node_modules' || entry.name.startsWith('@')) {
        queue.push(child)
        continue
      }

      const nestedNodeModules = join(child, 'node_modules')
      if (existsSync(nestedNodeModules)) {
        queue.push(nestedNodeModules)
      }
    }
  }

  throw new Error(`Installed package not found: ${packageName}`)
}
