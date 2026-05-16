import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(cliRoot, 'src')

function compileCliEntry(t, entryName = 'index.ts') {
  const outdir = mkdtempSync(join(cliRoot, `.tmp-linx-symphony-${entryName.replace(/\W+/g, '-')}-`))
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

test('compiled main cli exposes symphony command help', (t) => {
  const entry = compileCliEntry(t)
  const output = execFileSync(process.execPath, [entry, 'symphony', '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /linx symphony <command>/)
  assert.match(output, /run \[objective\.\.\]/)
  assert.match(output, /tasks/)
  assert.match(output, /sessions/)
  assert.match(output, /deliveries/)
})

test('compiled linx-symphony entry exposes dedicated command help', (t) => {
  const entry = compileCliEntry(t, 'symphony.ts')
  const output = execFileSync(process.execPath, [entry, '--help'], {
    cwd: cliRoot,
    encoding: 'utf-8',
  })

  assert.match(output, /linx-symphony <command>/)
  assert.match(output, /run \[objective\.\.\]/)
  assert.match(output, /show <id>/)
})

test('linx symphony dry-run archives task delivery session and prints projection', (t) => {
  const entry = compileCliEntry(t)
  const home = mkdtempSync(join(tmpdir(), 'linx-symphony-cli-home-'))
  const symphonyHome = join(home, '.linx', 'symphony')
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const output = execFileSync(process.execPath, [
    entry,
    'symphony',
    'run',
    'inspect repo',
    '--backend',
    'codex',
    '--auto',
    '--dry-run',
    '--cwd',
    cliRoot,
    '--acceptance',
    'archives records',
  ], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf-8',
  })

  assert.match(output, /LinX Symphony dry-run/)
  assert.match(output, /sym_task_/)
  assert.match(output, /sym_delivery_/)
  assert.match(output, /sym_session_/)
  assert.match(output, /Projected runtime prompt/)
  assert.match(output, /inspect repo/)
  assert.match(output, /archives records/)

  const tasksDir = join(symphonyHome, 'tasks')
  const deliveriesDir = join(symphonyHome, 'deliveries')
  const sessionsDir = join(symphonyHome, 'sessions')
  assert.equal(existsSync(tasksDir), true)
  assert.equal(existsSync(deliveriesDir), true)
  assert.equal(existsSync(sessionsDir), true)

  const taskId = output.match(/sym_task_[^\s]+/)?.[0]
  const deliveryId = output.match(/sym_delivery_[^\s]+/)?.[0]
  const sessionId = output.match(/sym_session_[^\s]+/)?.[0]
  assert.ok(taskId)
  assert.ok(deliveryId)
  assert.ok(sessionId)

  const task = JSON.parse(readFileSync(join(tasksDir, taskId, 'task.json'), 'utf-8'))
  const delivery = JSON.parse(readFileSync(join(deliveriesDir, deliveryId, 'delivery.json'), 'utf-8'))
  const session = JSON.parse(readFileSync(join(sessionsDir, sessionId, 'session.json'), 'utf-8'))
  assert.equal(task.objective, 'inspect repo')
  assert.equal(task.status, 'pending')
  assert.equal(delivery.status, 'pending')
  assert.equal(delivery.projection.runtimeRole, 'user')
  assert.equal(session.status, 'planned')
  assert.equal(session.dryRun, true)
})

test('linx-symphony dry-run can show an archived record by prefix', (t) => {
  const entry = compileCliEntry(t, 'symphony.ts')
  const home = mkdtempSync(join(tmpdir(), 'linx-symphony-bin-home-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const runOutput = execFileSync(process.execPath, [
    entry,
    'run',
    'verify dedicated bin',
    '--dry-run',
    '--cwd',
    cliRoot,
  ], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf-8',
  })
  const taskId = runOutput.match(/sym_task_[^\s]+/)?.[0]
  assert.ok(taskId)

  const showOutput = execFileSync(process.execPath, [entry, 'show', taskId.slice(0, 24)], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf-8',
  })

  assert.match(showOutput, /verify dedicated bin/)
  assert.match(showOutput, /"objective": "verify dedicated bin"/)
})
