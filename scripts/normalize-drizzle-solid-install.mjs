import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const packageDistRoot = path.resolve('node_modules/@undefineds.co/drizzle-solid/dist')
const packageEsmRoot = path.join(packageDistRoot, 'esm')
const sourceMapPattern = /\n\/\/# sourceMappingURL=.*$/m

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    return stats.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

if (statSync(path.resolve('node_modules'), { throwIfNoEntry: false }) == null) {
  process.exit(0)
}

if (statSync(packageDistRoot, { throwIfNoEntry: false }) == null) {
  process.exit(0)
}

patchDrizzleSolidPodUrlForwarding(packageDistRoot)
patchDrizzleSolidExplicitPodUrlLock(packageDistRoot)
stripEsmSourceMapUrls(packageEsmRoot)

function stripEsmSourceMapUrls(root) {
  if (statSync(root, { throwIfNoEntry: false }) == null) {
    return
  }

  for (const filePath of walk(root)) {
    if (!filePath.endsWith('.js')) continue

    const source = readFileSync(filePath, 'utf8')
    if (!sourceMapPattern.test(source)) continue

    writeFileSync(filePath, source.replace(sourceMapPattern, ''), 'utf8')
  }
}

function patchDrizzleSolidPodUrlForwarding(root) {
  const files = [
    path.join(root, 'driver.js'),
    path.join(root, 'esm/driver.js'),
    path.join(root, 'driver.d.ts'),
    path.join(root, 'esm/driver.d.ts'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }

    const source = readFileSync(filePath, 'utf8')
    const patched = filePath.endsWith('.d.ts')
      ? patchDriverTypes(source)
      : patchDriverRuntime(source)

    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchDriverRuntime(source) {
  if (source.includes('podUrl: config?.podUrl')) {
    return source
  }

  return source.replace(
    /(\s+storageTTL: config\?\.storageTTL,\n)/,
    `$1        podUrl: config?.podUrl,\n`,
  )
}

function patchDriverTypes(source) {
  if (source.includes('podUrl?: string;')) {
    return source
  }

  return source.replace(
    /(\s+storageTTL\?: number;\n)/,
    `$1    /** Explicit Pod base URL for IdP/SP split deployments. */\n    podUrl?: string;\n`,
  )
}

function patchDrizzleSolidExplicitPodUrlLock(root) {
  const files = [
    path.join(root, 'core/runtime/pod-runtime.js'),
    path.join(root, 'esm/core/runtime/pod-runtime.js'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }

    const source = readFileSync(filePath, 'utf8')
    const patched = patchPodRuntime(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchPodRuntime(source) {
  let patched = source

  if (!patched.includes('this.explicitPodUrl = typeof options.podUrl ===')) {
    patched = patched.replace(
      /(\s+this\.webId = options\.webId;\n\s+this\.podUrl = [^\n]+;\n)/,
      `$1        this.explicitPodUrl = typeof options.podUrl === 'string' && options.podUrl.trim().length > 0;\n`,
    )
  }

  patched = patched.replace(
    /(\s+if \(resolvedStorage\) \{\n\s+this\.storageUrl = resolvedStorage;\n\s+this\.storageResolvedAt = Date\.now\(\);\n\s+)if \(resolvedStorage !== this\.podUrl\) \{/g,
    `$1if (!this.explicitPodUrl && resolvedStorage !== this.podUrl) {`,
  )

  patched = patched.replace(
    /(\s+)if \((?![^)]*explicitPodUrl)resolvedStorage !== this\.podUrl\) \{\n(\s+)console\.log\(`\[PodRuntime\] IdP-SP separation detected: storage at \$\{resolvedStorage\}`\);\n(\s+)this\.podUrl = resolvedStorage;\n(\s+)\}/g,
    `$1if (!this.explicitPodUrl && resolvedStorage !== this.podUrl) {\n$2console.log(\`[PodRuntime] IdP-SP separation detected: storage at \${resolvedStorage}\`);\n$3this.podUrl = resolvedStorage;\n$4}`,
  )

  patched = patched.replace(
    /(\s+)if \(status === 500\) \{\n(\s+)const requestId = this\.requestIdSupported\n([\s\S]*?)\n\s+throw new Error\(`Failed to connect to Pod: \$\{status\} \$\{response\.statusText\}`\);\n\s+\}/,
    `$1if (status === 500 && !this.explicitPodUrl) {\n$2const requestId = this.requestIdSupported\n$3\n$2throw new Error(\`Failed to connect to Pod: \${status} \${response.statusText}\`);\n$1}\n$1if (status === 500 && this.explicitPodUrl) {\n$2console.warn(\`Pod root returned \${status} for explicit Pod URL, continuing (child resources may still be writable)\`);\n$1}`,
  )

  return patched
}
