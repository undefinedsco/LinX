import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const entryPath = join(sourceRoot, 'index.ts')

test('compiled cli entry can serve watch commands without chat dependencies', async (t) => {
  const outdir = mkdtempSync(join(cliRoot, '.tmp-linx-cli-entry-'))
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
      entryPath,
    ], {
      cwd: cliRoot,
      stdio: 'pipe',
    })
  } catch {
    assert.ok(existsSync(join(outdir, 'index.js')))
  }

  const output = execFileSync(process.execPath, [join(outdir, 'index.js'), 'watch', 'backends'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /codex/i)
  assert.match(output, /claude/i)
  assert.match(output, /codebuddy/i)
})
