import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const distRoot = join(packageRoot, 'dist')

const replacements = new Map([
  ['@undefineds.co/drizzle-solid/dist/core/schema/pod-table.js', '@undefineds.co/models/_drizzle-solid/pod-table'],
  ['@undefineds.co/drizzle-solid/dist/core/schema/types.js', '@undefineds.co/models/_drizzle-solid/types'],
  ['@undefineds.co/drizzle-solid/dist/core/schema/columns.js', '@undefineds.co/models/_drizzle-solid/columns'],
])

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (!fullPath.endsWith('.d.ts')) {
      continue
    }

    let source = readFileSync(fullPath, 'utf8')
    let changed = false

    for (const [from, to] of replacements) {
      if (source.includes(from)) {
        source = source.split(from).join(to)
        changed = true
      }
    }

    if (changed) {
      writeFileSync(fullPath, source)
    }
  }
}

walk(distRoot)
