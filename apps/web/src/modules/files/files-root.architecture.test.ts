import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const filesRootPath = 'src/modules/files'
const publicRootEntrypoints = new Set([
  'src/modules/files/index.ts',
])

const imperativeRootImplementationPattern =
  /^\s*import\s|^\s*(?:export\s+)?(?:async\s+)?function\s|^\s*(?:export\s+)?(?:const|let|class)\s|\buseState\b|\buseEffect\b|\bSolidDatabase\b|\bgetAuthenticatedFetch\b|@tanstack\/react-query|method:\s*['"]/m

function listRootProductionSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath)
    .map((entryName) => `${rootPath}/${entryName}`)
    .filter((entryPath) => statSync(entryPath).isFile())
    .filter((entryPath) => /\.(ts|tsx)$/.test(entryPath))
    .filter((entryPath) => !/\.(?:test|architecture\.test)\.(ts|tsx)$/.test(entryPath))
    .sort()
}

function listProductionSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath).flatMap((entryName) => {
    const entryPath = `${rootPath}/${entryName}`
    const entryStat = statSync(entryPath)

    if (entryStat.isDirectory()) return listProductionSourceFiles(entryPath)
    if (!entryStat.isFile()) return []
    if (!/\.(ts|tsx)$/.test(entryName) || /\.(?:test|architecture\.test)\.(ts|tsx)$/.test(entryName)) return []

    return [entryPath]
  }).sort()
}

function listNestedProductionSourceFiles(rootPath: string): string[] {
  return listProductionSourceFiles(rootPath)
    .filter((filePath) => filePath.split('/').length > rootPath.split('/').length + 1)
}

function sourceWithoutLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
}

function sourceWithoutComments(source: string): string {
  return sourceWithoutLineComments(source).replace(/\/\*[\s\S]*?\*\//g, '')
}

function isExportOnlyRootFacade(source: string): boolean {
  const remainingSource = sourceWithoutComments(source)
    .replace(
      /export(?:\s+type)?\s+(?:(?:\*\s+from)|(?:\{[\s\S]*?\}\s+from))\s+['"][^'"]+['"];?|export\s+\{\s*\};?/g,
      '',
    )
    .trim()

  return remainingSource.length === 0
}

function isSimpleStarShim(source: string): boolean {
  const sourceWithoutComments = sourceWithoutLineComments(source).trim()
  return /^export \* from ['"][^'"]+['"]\s*$/m.test(sourceWithoutComments)
}

function rootProductionFileSet(rootPath: string): Set<string> {
  return new Set(listRootProductionSourceFiles(rootPath))
}

function resolveRelativeImportTarget(filePath: string, importSpecifier: string): string | null {
  if (!importSpecifier.startsWith('.')) return null

  const importBase = `${filePath.split('/').slice(0, -1).join('/')}/${importSpecifier}`
  const candidates = [
    importBase,
    `${importBase}.ts`,
    `${importBase}.tsx`,
    `${importBase}/index.ts`,
    `${importBase}/index.tsx`,
  ]

  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function importSpecifiers(source: string): string[] {
  return Array.from(
    source.matchAll(
      /\bimport\s+(?:type\s+)?(?:['"]([^'"]+)['"]|[\s\S]*?\s+from\s+['"]([^'"]+)['"])|\bexport(?:\s+type)?\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g,
    ),
    (match) => match[1] ?? match[2] ?? match[3],
  )
}

describe('Files root module boundary', () => {
  it('keeps root production files as export-only shims or public entrypoints', () => {
    const rootProductionFiles = listRootProductionSourceFiles(filesRootPath)

    expect(rootProductionFiles.length).toBeGreaterThan(0)

    for (const filePath of rootProductionFiles) {
      const source = readFileSync(filePath, 'utf8')
      const uncommentedSource = sourceWithoutLineComments(source)

      expect(
        isExportOnlyRootFacade(source),
        `${filePath} contains implementation code; move owner logic into app/features/domain/data/ui and leave root as a compatibility facade`,
      ).toBe(true)
      expect(
        uncommentedSource,
        `${filePath} contains root-level imperative imports/state/IO/cache code`,
      ).not.toMatch(imperativeRootImplementationPattern)

      if (publicRootEntrypoints.has(filePath) || isSimpleStarShim(source)) continue

      expect(
        source,
        `${filePath} is a named or deprecated root facade; document its compatibility role so root does not become an implicit owner`,
      ).toMatch(/(?:Compatibility entrypoint|Deprecated compatibility entrypoint|Public Files module entrypoint)/)
    }
  })

  it('keeps nested production modules pointed at owner layers instead of root compatibility shims', () => {
    const rootProductionFiles = rootProductionFileSet(filesRootPath)
    const nestedProductionFiles = listNestedProductionSourceFiles(filesRootPath)

    expect(rootProductionFiles.size).toBeGreaterThan(0)
    expect(nestedProductionFiles.length).toBeGreaterThan(0)

    for (const filePath of nestedProductionFiles) {
      const source = readFileSync(filePath, 'utf8')

      for (const specifier of importSpecifiers(source)) {
        const target = resolveRelativeImportTarget(filePath, specifier)
        if (!target) continue

        expect(
          rootProductionFiles.has(target),
          `${filePath} imports root compatibility shim ${specifier}; import the app/features/domain/data/ui owner directly`,
        ).toBe(false)
      }
    }
  })
})
