import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const aiCommandPath = join(cliRoot, 'dist', 'lib', 'ai-command.js')

test('compiled ai command depends on @linx/models exports instead of repo-local source paths', () => {
  const source = readFileSync(aiCommandPath, 'utf-8')

  assert.match(source, /from '@linx\/models\/ai-config'/)
  assert.match(source, /from '@linx\/models\/namespaces'/)
  assert.doesNotMatch(source, /packages\/models\/src/)
})
