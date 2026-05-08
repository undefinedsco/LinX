import { dirname, join } from 'node:path'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const modelsRoot = fileURLToPath(new URL('..', import.meta.url))
const distRoot = join(modelsRoot, 'dist')

fixExtensionlessRelativeImports(distRoot)
fixJsonImportAttributes(distRoot)

function walkJs(dir, files = []) {
  if (!existsSync(dir)) {
    return files
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkJs(next, files)
    } else if (entry.isFile() && next.endsWith('.js')) {
      files.push(next)
    }
  }
  return files
}

function fixExtensionlessRelativeImports(root) {
  const specifierPattern = /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g
  const sideEffectPattern = /(import\s+['"])(\.{1,2}\/[^'"]+)(['"])/g
  for (const file of walkJs(root)) {
    let source = readFileSync(file, 'utf8')
    source = source.replace(specifierPattern, (_match, before, specifier, after) => (
      `${before}${resolveRelativeSpecifier(file, specifier)}${after}`
    ))
    source = source.replace(sideEffectPattern, (_match, before, specifier, after) => (
      `${before}${resolveRelativeSpecifier(file, specifier)}${after}`
    ))
    writeFileSync(file, source)
  }
}

function resolveRelativeSpecifier(fromFile, specifier) {
  if (
    specifier.endsWith('.js')
    || specifier.endsWith('.json')
    || specifier.includes('?')
    || specifier.includes('#')
  ) {
    return specifier
  }

  const targetBase = join(dirname(fromFile), specifier)
  if (existsSync(`${targetBase}.js`)) {
    return `${specifier}.js`
  }

  if (existsSync(join(targetBase, 'index.js'))) {
    return `${specifier}/index.js`
  }

  return specifier
}

function fixJsonImportAttributes(root) {
  const jsonImportPattern = /(import\s+[^;]*?from\s+['"][^'"]+\.json['"])(\s*;)/g
  for (const file of walkJs(root)) {
    const source = readFileSync(file, 'utf8').replace(jsonImportPattern, (_match, statement, suffix) => {
      if (statement.includes(' with { type: \'json\' }') || statement.includes(' with { type: "json" }')) {
        return `${statement}${suffix}`
      }
      return `${statement} with { type: 'json' }${suffix}`
    })
    writeFileSync(file, source)
  }
}
