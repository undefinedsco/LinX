import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))

test('symphony dual-role fixtures validate final control records', () => {
  const result = spawnSync(process.execPath, ['scripts/pack-symphony-dual-role-fixtures.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /symphony dual-role fixtures verified \(\d+ scenarios\)/)
})
