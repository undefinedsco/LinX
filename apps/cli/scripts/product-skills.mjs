import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const PRODUCT_SKILL_NAMES = Object.freeze([
  'symphony',
  'xpod-cli',
])

export function copyProductSkills(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true })

  for (const skillName of PRODUCT_SKILL_NAMES) {
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
