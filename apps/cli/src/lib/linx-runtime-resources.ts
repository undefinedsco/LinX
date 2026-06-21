import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getSolidLinxAppDir, getSolidLinxPiWebAccessConfigPath } from './solid-local-store.js'

export const LINX_PACKAGE_SOURCE = '@undefineds.co/linx'
export const LINX_WEB_ACCESS_PACKAGE_SOURCE = 'pi-web-access'
export const LINX_PRODUCT_SKILL_NAMES = new Set(['symphony', 'xpod-cli'])
export const MARKET_XPOD_CLI_SKILL_SOURCE = 'xpod-cli@undefineds'

export function resolveBundledLinxSkillsDir(importMetaUrl = import.meta.url): string | null {
  const moduleDir = dirname(fileURLToPath(importMetaUrl))
  const candidates = uniquePaths([
    // New helper layout: dist/lib/linx-runtime-resources.js -> dist/skills.
    join(moduleDir, '..', 'skills'),
    // Legacy adapter layout: dist/lib/pi-adapter/runtime.js -> dist/skills.
    join(moduleDir, '..', '..', 'skills'),
    // Test/dev bundle fallback: <tmp>/dist/lib[/pi-adapter] -> <tmp>/dist/skills or <tmp>/skills.
    resolve(moduleDir, '..', '..', '..', 'skills'),
    resolve(moduleDir, '..', '..', '..', '..', 'skills'),
    // Source-tree fallback when running through a TS loader.
    resolve(moduleDir, '..', '..', '..', '..', '..', 'skills'),
  ])

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function ensurePiWebAccessConfig(): void {
  const config = JSON.stringify({ workflow: 'none' }, null, 2) + '\n'
  const linxPath = getSolidLinxPiWebAccessConfigPath()
  const linxDir = getSolidLinxAppDir()
  if (!existsSync(linxDir)) {
    mkdirSync(linxDir, { recursive: true })
  }
  if (!existsSync(linxPath)) writeFileSync(linxPath, config)
}

export function resolveBundledPiPackageRoot(packageName: string, importMetaUrl = import.meta.url): string | null {
  const moduleDir = dirname(fileURLToPath(importMetaUrl))
  const vendoredCandidates = uniquePaths([
    // New helper layout: dist/lib/linx-runtime-resources.js -> package vendor/<package>.
    resolve(moduleDir, '..', '..', 'vendor', packageName),
    // Legacy adapter layout: dist/lib/pi-adapter/runtime.js -> package vendor/<package>.
    resolve(moduleDir, '..', '..', '..', 'vendor', packageName),
    // Defensive fallback for layouts that place vendor under dist.
    resolve(moduleDir, '..', 'vendor', packageName),
    resolve(moduleDir, '..', '..', 'vendor', packageName),
  ])
  for (const candidate of vendoredCandidates) {
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate
    }
  }

  try {
    const requireFromRuntime = createRequire(importMetaUrl)
    return dirname(requireFromRuntime.resolve(`${packageName}/package.json`))
  } catch {
    return null
  }
}

export function withLinxSkillSourceInfo<T extends {
  skills: Array<{
    name: string
    filePath: string
    sourceInfo?: unknown
  }>
  diagnostics: unknown[]
}>(base: T, options: {
  bundledSkillsDir: string | null
  marketSkillDirs: string[]
}): T {
  const { bundledSkillsDir, marketSkillDirs } = options
  const bundledProductSkillNames = new Set<string>()
  if (bundledSkillsDir) {
    for (const skill of base.skills) {
      if (skill.filePath.startsWith(bundledSkillsDir) && LINX_PRODUCT_SKILL_NAMES.has(skill.name)) {
        bundledProductSkillNames.add(skill.name)
      }
    }
  }
  const filteredSkills = base.skills.filter((skill) => (
    !(
      bundledSkillsDir
      && skill.filePath.startsWith(bundledSkillsDir)
      && !LINX_PRODUCT_SKILL_NAMES.has(skill.name)
    )
    && !(
      marketSkillDirs.some((dir) => skill.filePath.startsWith(dir))
      && bundledProductSkillNames.has(skill.name)
    )
  ))

  return {
    ...base,
    skills: filteredSkills.map((skill) => {
      if (bundledSkillsDir && skill.filePath.startsWith(bundledSkillsDir)) {
        return {
          ...skill,
          sourceInfo: {
            path: skill.filePath,
            source: LINX_PACKAGE_SOURCE,
            scope: 'temporary',
            origin: 'package',
            baseDir: bundledSkillsDir,
          },
        }
      }

      const marketSkillDir = marketSkillDirs.find((dir) => skill.filePath.startsWith(dir))
      if (marketSkillDir) {
        return {
          ...skill,
          sourceInfo: {
            path: skill.filePath,
            source: MARKET_XPOD_CLI_SKILL_SOURCE,
            scope: 'temporary',
            origin: 'marketplace',
            version: resolveMarketSkillVersion(marketSkillDir),
            baseDir: marketSkillDir,
          },
        }
      }

      return skill
    }),
  }
}

export function resolveInstalledMarketSkillDirs(): string[] {
  return [resolveInstalledXpodCliMarketSkillDir()].filter((path): path is string => Boolean(path))
}

function resolveInstalledXpodCliMarketSkillDir(): string | null {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  const versionsRoot = join(codexHome, 'plugins', 'cache', 'undefineds', 'xpod-cli')
  if (!existsSync(versionsRoot)) {
    return null
  }

  const candidates: Array<{ version: string; dir: string }> = []
  for (const entry of safeReadDir(versionsRoot)) {
    const versionDir = join(versionsRoot, entry)
    if (!safeIsDirectory(versionDir)) {
      continue
    }
    const skillDir = join(versionDir, 'skills', 'xpod-cli')
    if (existsSync(join(skillDir, 'SKILL.md'))) {
      candidates.push({ version: entry, dir: skillDir })
    }
  }

  candidates.sort((a, b) => compareVersionLike(b.version, a.version))
  return candidates[0]?.dir ?? null
}

function resolveMarketSkillVersion(skillDir: string): string | undefined {
  const version = basename(dirname(dirname(skillDir)))
  return version && version !== 'skills' ? version : undefined
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function safeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function compareVersionLike(a: string, b: string): number {
  const left = a.split(/[.-]/u).map((part) => Number(part))
  const right = b.split(/[.-]/u).map((part) => Number(part))
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0
    const r = Number.isFinite(right[i]) ? right[i] : 0
    if (l !== r) {
      return l - r
    }
  }
  return a.localeCompare(b)
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}
