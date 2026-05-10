const fs = require('node:fs')
const path = require('node:path')

function resolveCompiledDesktopModule(relativePath) {
  const candidates = [
    path.resolve(__dirname, '../dist/apps/desktop/src', relativePath),
    path.resolve(__dirname, '../dist/desktop/src', relativePath),
    path.resolve(__dirname, '../dist', relativePath),
  ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error(`Compiled desktop module not found: ${relativePath}`)
  }

  return found
}

module.exports = {
  resolveCompiledDesktopModule,
}
