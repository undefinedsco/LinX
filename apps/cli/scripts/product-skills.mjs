import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const PRODUCT_SKILL_NAMES = Object.freeze([
  'capture',
  'symphony',
  'xpod-cli',
])

export const LOCAL_PRODUCT_SKILL_NAMES = Object.freeze([
  'xpod-cli',
])

export const MARKETPLACE_PRODUCT_SKILL_NAMES = Object.freeze([
  'capture',
  'symphony',
])

export function resolveMarketplaceRoot(repoRoot) {
  const marketplaceRoot = process.env.LINX_MARKETPLACE_ROOT
    ? resolve(process.env.LINX_MARKETPLACE_ROOT)
    : resolve(repoRoot, '..', 'marketplace')
  return marketplaceRoot
}

export function resolveMarketplaceSkillDir(repoRoot, skillName) {
  const marketplaceRoot = resolveMarketplaceRoot(repoRoot)
  const pluginName = skillName === 'capture'
    ? 'linx-capture'
    : skillName === 'symphony'
      ? 'linx-symphony'
      : null
  if (!pluginName) {
    throw new Error(`Unsupported marketplace skill ${skillName}`)
  }
  return join(marketplaceRoot, 'plugins', pluginName, 'skills')
}

export function copyMarketplaceProductSkills(repoRoot, targetDir) {
  for (const skillName of MARKETPLACE_PRODUCT_SKILL_NAMES) {
    copyProductSkills(resolveMarketplaceSkillDir(repoRoot, skillName), targetDir, { skillNames: [skillName] })
  }
}

export function copyProductSkills(sourceDir, targetDir, options = {}) {
  const skillNames = options.skillNames ?? LOCAL_PRODUCT_SKILL_NAMES
  mkdirSync(targetDir, { recursive: true })

  for (const skillName of skillNames) {
    const source = join(sourceDir, skillName)
    if (!existsSync(join(source, 'SKILL.md'))) {
      throw new Error(`Missing product skill ${skillName} at ${source}`)
    }

    cpSync(source, join(targetDir, skillName), {
      recursive: true,
      filter: (src) => !src.includes('/node_modules/') && !src.includes('/.git/'),
    })
  }
}
