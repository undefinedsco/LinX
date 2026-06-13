import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')

function compileCliEntry(t, entryName = 'index.ts') {
  const outdir = mkdtempSync(join(cliRoot, `.tmp-linx-no-symphony-${entryName.replace(/\W+/g, '-')}-`))
  t.after(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  try {
    execFileSync('tsc', [
      '--outDir',
      outdir,
      '--rootDir',
      sourceRoot,
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--target',
      'ES2022',
      '--lib',
      'ES2022',
      '--types',
      'node',
      '--skipLibCheck',
      'true',
      '--noEmitOnError',
      'false',
      join(sourceRoot, entryName),
    ], {
      cwd: cliRoot,
      stdio: 'pipe',
    })
  } catch {
    assert.ok(existsSync(join(outdir, entryName.replace(/\.ts$/, '.js'))))
  }

  return join(outdir, entryName.replace(/\.ts$/, '.js'))
}

test('compiled main cli does not expose symphony as a product command', (t) => {
  const entry = compileCliEntry(t)
  const output = execFileSync(process.execPath, [entry, '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.doesNotMatch(output, /^\s+symphony\b/m)
  assert.doesNotMatch(output, /linx symphony \[objective\.\.\]/)
  assert.doesNotMatch(output, /Use AI Secretary Symphony delegation for one objective/)

  const result = spawnSync(process.execPath, [entry, 'symphony', '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stdout, /Use AI Secretary Symphony delegation/)
})
