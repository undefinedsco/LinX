const fs = require('node:fs')
const path = require('node:path')

function resolveCompiledServiceModule(relativePath) {
  const candidates = [
    path.resolve(__dirname, '../dist/apps/service/src', relativePath),
    path.resolve(__dirname, '../dist/service/src', relativePath),
    path.resolve(__dirname, '../dist', relativePath),
  ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error(`Compiled service module not found: ${relativePath}`)
  }

  return found
}

module.exports = {
  resolveCompiledServiceModule,
}
