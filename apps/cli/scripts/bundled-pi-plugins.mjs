import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const BUNDLED_PI_PLUGINS = [
  {
    packageName: 'pi-web-access',
    legacyConfigPath: '~/.pi/web-search.json',
    deprecatedConfigPath: '~/.linx/pi-web-access.json',
    deprecatedConfigCode: 'join(homedir(), ".linx", "pi-web-access.json")',
    configPath: '$LINX_HOME/pi-web-access.json',
    configCode: 'join(process.env.LINX_HOME?.trim() || join(process.env.SOLID_HOME?.trim() || join(homedir(), ".solid"), "apps", "linx"), "pi-web-access.json")',
  },
]

export function copyBundledPiPlugins({ repoRoot, targetRoot, plugins = BUNDLED_PI_PLUGINS }) {
  for (const plugin of plugins) {
    const sourceRoot = join(repoRoot, 'node_modules', plugin.packageName)
    if (!existsSync(join(sourceRoot, 'package.json'))) {
      throw new Error(`Bundled Pi plugin package not found: ${sourceRoot}`)
    }

    cpSync(sourceRoot, join(targetRoot, 'vendor', plugin.packageName), {
      recursive: true,
      filter: (src) => shouldCopyPackagePath(sourceRoot, src),
    })
    rewriteBundledPiPluginConfigPath(join(targetRoot, 'vendor', plugin.packageName), plugin)
  }
}

export function assertBundledPiPluginsInstalled(packageRoot, plugins = BUNDLED_PI_PLUGINS) {
  for (const plugin of plugins) {
    const vendorRoot = join(packageRoot, 'vendor', plugin.packageName)
    const packageJsonPath = join(vendorRoot, 'package.json')
    if (!existsSync(packageJsonPath)) {
      throw new Error(`Installed vendored ${plugin.packageName} package missing: ${packageJsonPath}`)
    }
  }
}

export function resolveBundledPiPluginSelection(names = []) {
  if (!Array.isArray(names) || names.length === 0) {
    return BUNDLED_PI_PLUGINS
  }

  const plugins = []
  for (const name of names) {
    const plugin = BUNDLED_PI_PLUGINS.find((candidate) => candidate.packageName === name)
    if (!plugin) {
      throw new Error(`Unknown bundled Pi plugin: ${name}. Available: ${BUNDLED_PI_PLUGINS.map((candidate) => candidate.packageName).join(', ')}`)
    }
    plugins.push(plugin)
  }
  return plugins
}

export function assertBundledPiPluginConfigPaths(packageRoot, plugins = BUNDLED_PI_PLUGINS) {
  for (const plugin of plugins) {
    if (!plugin.legacyConfigPath || !plugin.configPath) continue

    const vendorRoot = join(packageRoot, 'vendor', plugin.packageName)
    const files = walkSourceFiles(vendorRoot)
    const legacyMatches = []
    const deprecatedMatches = []
    const deprecatedCodeMatches = []
    const expectedMatches = []
    const expectedCodeMatches = []

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (content.includes(plugin.legacyConfigPath)) {
        legacyMatches.push(relative(vendorRoot, file))
      }
      if (plugin.deprecatedConfigPath && content.includes(plugin.deprecatedConfigPath)) {
        deprecatedMatches.push(relative(vendorRoot, file))
      }
      if (plugin.deprecatedConfigCode && content.includes(plugin.deprecatedConfigCode)) {
        deprecatedCodeMatches.push(relative(vendorRoot, file))
      }
      if (content.includes(plugin.configPath)) {
        expectedMatches.push(relative(vendorRoot, file))
      }
      if (plugin.configCode && content.includes(plugin.configCode)) {
        expectedCodeMatches.push(relative(vendorRoot, file))
      }
    }

    if (legacyMatches.length > 0) {
      throw new Error(
        `Installed vendored ${plugin.packageName} still references ${plugin.legacyConfigPath} in:\n`
          + legacyMatches.map((file) => `  - ${file}`).join('\n'),
      )
    }

    if (deprecatedMatches.length > 0) {
      throw new Error(
        `Installed vendored ${plugin.packageName} still references ${plugin.deprecatedConfigPath} in:\n`
          + deprecatedMatches.map((file) => `  - ${file}`).join('\n'),
      )
    }

    if (deprecatedCodeMatches.length > 0) {
      throw new Error(
        `Installed vendored ${plugin.packageName} still references ${plugin.deprecatedConfigCode} in:\n`
          + deprecatedCodeMatches.map((file) => `  - ${file}`).join('\n'),
      )
    }

    if (expectedMatches.length === 0 && expectedCodeMatches.length === 0) {
      throw new Error(
        `Installed vendored ${plugin.packageName} does not reference ${plugin.configPath} in its source files`,
      )
    }
  }
}

function rewriteBundledPiPluginConfigPath(root, plugin) {
  if (!plugin.deprecatedConfigPath && !plugin.deprecatedConfigCode) return

  for (const file of walkSourceFiles(root)) {
    let content = readFileSync(file, 'utf8')
    const original = content

    if (plugin.legacyConfigPath && plugin.configPath) {
      content = content.split(plugin.legacyConfigPath).join(plugin.configPath)
    }
    if (plugin.deprecatedConfigPath && plugin.configPath) {
      content = content.split(plugin.deprecatedConfigPath).join(plugin.configPath)
    }
    if (plugin.deprecatedConfigCode && plugin.configCode) {
      content = content.split(plugin.deprecatedConfigCode).join(plugin.configCode)
    }
    if (content !== original) {
      writeFileSync(file, content)
    }
  }
}

function shouldCopyPackagePath(root, path) {
  const relativePath = relative(root, path)
  if (!relativePath) return true

  const segments = relativePath.split(sep)
  return !segments.includes('node_modules')
}

function walkSourceFiles(root, files = []) {
  if (!existsSync(root)) return files

  const entries = readDirSafe(root)
  for (const entry of entries) {
    const next = join(root, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(next, files)
      continue
    }
    if (entry.isFile() && isInspectableSourceFile(next)) {
      files.push(next)
    }
  }
  return files
}

function readDirSafe(root) {
  return readdirSync(root, { withFileTypes: true })
}

function isInspectableSourceFile(path) {
  return (
    path.endsWith('.ts')
    || path.endsWith('.tsx')
    || path.endsWith('.js')
    || path.endsWith('.mjs')
    || path.endsWith('.cjs')
    || path.endsWith('.d.ts')
    || path.endsWith('README.md')
  )
}

if (isDirectCliInvocation()) {
  const args = parseArgs(process.argv.slice(2))
  const plugins = resolveBundledPiPluginSelection(args.plugins)
  mkdirSync(args.targetRoot, { recursive: true })
  copyBundledPiPlugins({
    repoRoot: args.repoRoot,
    targetRoot: args.targetRoot,
    plugins,
  })
  assertBundledPiPluginsInstalled(args.targetRoot, plugins)
  assertBundledPiPluginConfigPaths(args.targetRoot, plugins)
  for (const plugin of plugins) {
    process.stdout.write(`bundled ${plugin.packageName} -> ${join(args.targetRoot, 'vendor', plugin.packageName)}\n`)
  }
}

function parseArgs(argv) {
  const parsed = {
    repoRoot: fileURLToPath(new URL('../../..', import.meta.url)),
    targetRoot: undefined,
    plugins: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--repo-root') {
      parsed.repoRoot = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--repo-root=')) {
      parsed.repoRoot = arg.slice('--repo-root='.length)
      continue
    }
    if (arg === '--target-root') {
      parsed.targetRoot = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--target-root=')) {
      parsed.targetRoot = arg.slice('--target-root='.length)
      continue
    }
    if (arg === '--plugin') {
      parsed.plugins.push(argv[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--plugin=')) {
      parsed.plugins.push(arg.slice('--plugin='.length))
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
    parsed.plugins.push(arg)
  }

  parsed.plugins = parsed.plugins.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
  if (!parsed.targetRoot) {
    throw new Error('Usage: node apps/cli/scripts/bundled-pi-plugins.mjs --target-root <package-root> [plugin-name ...]')
  }

  return parsed
}

function isDirectCliInvocation() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}
