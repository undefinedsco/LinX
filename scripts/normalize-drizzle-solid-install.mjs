import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const packageRoot = path.resolve('node_modules/@undefineds.co/drizzle-solid/dist/esm')
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

if (statSync(packageRoot, { throwIfNoEntry: false }) == null) {
  process.exit(0)
}

for (const filePath of walk(packageRoot)) {
  if (!filePath.endsWith('.js')) continue

  const source = readFileSync(filePath, 'utf8')
  if (!sourceMapPattern.test(source)) continue

  writeFileSync(filePath, source.replace(sourceMapPattern, ''), 'utf8')
}
