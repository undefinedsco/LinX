import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')

test('cli source directly imported packages are declared as dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
  const declared = new Set(Object.keys(pkg.dependencies ?? {}))
  const imports = new Set()

  for (const file of walkSource(sourceRoot)) {
    const source = readFileSync(file, 'utf-8')
    for (const specifier of collectBareImportSpecifiers(source)) {
      imports.add(packageNameForSpecifier(specifier))
    }
  }

  for (const packageName of [...imports].sort()) {
    assert.equal(
      declared.has(packageName),
      true,
      `${packageName} is imported by apps/cli/src but is missing from apps/cli/package.json dependencies`,
    )
  }
})

function walkSource(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSource(next, files)
    } else if (entry.isFile() && (next.endsWith('.ts') || next.endsWith('.tsx') || next.endsWith('.js') || next.endsWith('.mjs'))) {
      files.push(next)
    }
  }
  return files
}

function collectBareImportSpecifiers(source) {
  const specifiers = []
  const patterns = [
    /\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (isBarePackageSpecifier(specifier)) {
        specifiers.push(specifier)
      }
    }
  }

  return specifiers
}

function isBarePackageSpecifier(specifier) {
  return !specifier.startsWith('.')
    && !specifier.startsWith('/')
    && !specifier.startsWith('node:')
    && !specifier.startsWith('file:')
    && !specifier.startsWith('data:')
}

function packageNameForSpecifier(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}
