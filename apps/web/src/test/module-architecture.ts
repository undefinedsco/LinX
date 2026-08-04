import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { expect } from 'vitest'

export function readModuleSource(filePath: string): string {
  expect(existsSync(filePath), `${filePath} must exist`).toBe(true)
  return readFileSync(filePath, 'utf8')
}

export function listModuleSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []

  return readdirSync(rootPath).flatMap((entry) => {
    const entryPath = `${rootPath}/${entry}`
    if (statSync(entryPath).isDirectory()) return listModuleSourceFiles(entryPath)
    return /\.(?:ts|tsx)$/.test(entryPath) && !/\.test\.(?:ts|tsx)$/.test(entryPath) ? [entryPath] : []
  })
}

export function expectModuleDirectories(moduleRoot: string, directories: string[]): void {
  for (const directory of directories) {
    expect(existsSync(`${moduleRoot}/${directory}`), `${moduleRoot}/${directory} must exist`).toBe(true)
  }
}

export function expectFilesToExist(filePaths: string[]): void {
  for (const filePath of filePaths) {
    expect(existsSync(filePath), `${filePath} must exist`).toBe(true)
  }
}

export function expectNoForbiddenImports(rootPath: string, forbidden: RegExp[]): void {
  expect(existsSync(rootPath), `${rootPath} must exist before its boundaries can be verified`).toBe(true)
  for (const filePath of listModuleSourceFiles(rootPath)) {
    const source = readFileSync(filePath, 'utf8')
    for (const pattern of forbidden) {
      expect(source, `${filePath} must not match ${pattern}`).not.toMatch(pattern)
    }
  }
}

function sourceWithoutComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

export function expectExportOnlyFacade(filePath: string): void {
  const source = readModuleSource(filePath)
  const invalidSource = sourceWithoutComments(source)
    .replace(
      /export(?:\s+type)?\s+(?:(?:\*\s+from)|(?:\{[\s\S]*?\}\s+from))\s+['"][^'"]+['"];?|export\s+\{\s*\};?|export\s+default\s+[^;]+;?/g,
      '',
    )
    .trim()

  expect(
    invalidSource,
    `${filePath} must contain export declarations only`,
  ).toBe('')
}

export const domainForbiddenImports = [
  /from ['"]react(?:\/|['"])/,
  /from ['"]zustand(?:\/|['"])/,
  /from ['"]@tanstack\/react-/,
  /from ['"]@\/components\//,
  /from ['"]@\/providers\//,
  /from ['"]@\/modules\/layout\//,
  /from ['"][.]{1,2}\/(?:app|data|features|ui)(?:\/|['"])/,
]

export const dataForbiddenImports = [
  /from ['"]zustand(?:\/|['"])/,
  /from ['"]@\/components\//,
  /from ['"]@\/modules\/layout\//,
  /from ['"][.]{1,2}\/(?:app|features|ui)(?:\/|['"])/,
]

export const uiForbiddenImports = [
  /from ['"]zustand(?:\/|['"])/,
  /from ['"]@tanstack\/react-/,
  /from ['"]@\/providers\//,
  /from ['"]@\/modules\/layout\//,
  /from ['"][.]{1,2}\/(?:app|data|features)(?:\/|['"])/,
  /from ['"][.]{1,2}\/(?:store|collections)(?:['"]|\/)/,
]
