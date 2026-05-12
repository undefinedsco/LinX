import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const aiCommandPath = join(cliRoot, 'dist', 'lib', 'ai-command.js')
const modelsPath = join(cliRoot, 'dist', 'lib', 'models.js')

test('compiled ai command depends on @undefineds.co/models exports instead of repo-local source paths', () => {
  const aiCommandSource = readFileSync(aiCommandPath, 'utf-8')
  const modelsSource = readFileSync(modelsPath, 'utf-8')

  assert.match(aiCommandSource, /from ['"]\.\/models\.js['"]/)
  assert.match(modelsSource, /from ['"]@undefineds\.co\/models['"]/)
  assert.doesNotMatch(aiCommandSource, /packages\/models\/src/)
  assert.doesNotMatch(modelsSource, /packages\/models\/src/)
})
