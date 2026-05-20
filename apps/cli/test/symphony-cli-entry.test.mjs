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
  assert.match(output, /issues/)
  assert.match(output, /sessions/)
  assert.match(output, /deliveries/)
})

test('linx symphony dry-run archives issue delivery session and prints projection', (t) => {
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
  assert.match(output, /issue_/)
  assert.match(output, /urn:undefineds:linx:task:task_/)
  assert.match(output, /delivery_/)
  assert.match(output, /session_/)
  assert.match(output, /Projected runtime prompt/)
  assert.match(output, /inspect repo/)
  assert.match(output, /archives records/)

  const issuesDir = join(symphonyHome, 'issues')
  const deliveriesDir = join(symphonyHome, 'deliveries')
  const sessionsDir = join(symphonyHome, 'sessions')
  assert.equal(existsSync(issuesDir), true)
  assert.equal(existsSync(deliveriesDir), true)
  assert.equal(existsSync(sessionsDir), true)

  const issueKey = output.match(/issue_[^\s]+/)?.[0]
  const taskUri = output.match(/urn:undefineds:linx:task:task_[^\s]+/)?.[0]
  const deliveryKey = output.match(/delivery_[^\s]+/)?.[0]
  const sessionKey = output.match(/session_[^\s]+/)?.[0]
  assert.ok(issueKey)
  assert.ok(taskUri)
  assert.ok(deliveryKey)
  assert.ok(sessionKey)

  const issue = JSON.parse(readFileSync(join(issuesDir, issueKey, 'issue.json'), 'utf-8'))
  const delivery = JSON.parse(readFileSync(join(deliveriesDir, deliveryKey, 'delivery.json'), 'utf-8'))
  const session = JSON.parse(readFileSync(join(sessionsDir, sessionKey, 'session.json'), 'utf-8'))
  assert.equal(issue.description, 'inspect repo')
  assert.deepEqual(issue.tasks, [taskUri])
  assert.equal(delivery.status, 'pending')
  assert.equal(delivery.issue, issue.uri)
  assert.equal(delivery.task, taskUri)
  assert.equal(delivery.projection.runtimeRole, 'user')
  assert.equal(session.status, 'planned')
  assert.equal(session.issue, issue.uri)
  assert.equal(session.delivery, delivery.uri)
  assert.equal(session.task, taskUri)
  assert.equal(session.dryRun, true)
  assert.equal(Object.hasOwn(issue, 'chat'), false)
  assert.equal(Object.hasOwn(issue, 'thread'), false)
  assert.equal(Object.hasOwn(issue, 'messages'), false)
  assert.equal(Object.hasOwn(delivery, 'issueId'), false)
  assert.equal(Object.hasOwn(delivery, 'sessionId'), false)
  assert.equal(Object.hasOwn(session, 'issueId'), false)
  assert.equal(Object.hasOwn(session, 'deliveryId'), false)
})

test('linx symphony dry-run can show an archived record by prefix', (t) => {
  const entry = compileCliEntry(t)
  const home = mkdtempSync(join(tmpdir(), 'linx-symphony-bin-home-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const runOutput = execFileSync(process.execPath, [
    entry,
    'symphony',
    'run',
    'verify Secretary Symphony',
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
  const deliveryKey = runOutput.match(/delivery_[^\s]+/)?.[0]
  assert.ok(deliveryKey)

  const showOutput = execFileSync(process.execPath, [entry, 'symphony', 'show', deliveryKey.slice(0, 24)], {
    cwd: cliRoot,
    env: {
      ...process.env,
      HOME: home,
    },
    encoding: 'utf-8',
  })

  assert.match(showOutput, /verify Secretary Symphony/)
  assert.match(showOutput, /"type": "task_dispatch"/)
})
