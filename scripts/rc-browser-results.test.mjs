import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  BrowserResultsError,
  inspectBrowserResults,
  parseBrowserReport,
} from './rc-browser-results.mjs'

const root = path.resolve(import.meta.dirname, '..')
const helper = path.join(root, 'scripts/rc-browser-results.mjs')
const workflow = readFileSync(path.join(root, '.github/workflows/candidate.yml'), 'utf8')
const SENTINEL = 'FAKE_SECRET_SENTINEL_9f3a'
const SIGNED_IN_SPEC = 'specs/deployed-signed-in.spec.ts'
const SHARED_GROUP_SPEC = 'specs/rc-shared-group.spec.ts'

function result(status = 'passed', retry = 0) {
  return { status, retry }
}

function testEntry({
  status = 'expected',
  expectedStatus = 'passed',
  results = [result()],
  projectName = 'chromium',
} = {}) {
  return { status, expectedStatus, results, projectName }
}

function specEntry(file, title, tests) {
  return {
    title,
    file,
    ok: tests.every((entry) => entry.status === 'expected'),
    tests,
  }
}

function statsFor(specs) {
  const tests = specs.flatMap((spec) => spec.tests)
  return {
    expected: tests.filter((entry) => entry.status === 'expected').length,
    skipped: tests.filter((entry) => entry.status === 'skipped').length,
    unexpected: tests.filter((entry) => entry.status === 'unexpected').length,
    flaky: tests.filter((entry) => entry.status === 'flaky').length,
  }
}

function report(specs, { errors = [], stats } = {}) {
  return {
    config: {},
    suites: [{ title: '', specs }],
    errors,
    stats: stats ?? statsFor(specs),
  }
}

function assertStructuralRejection(reportValue, preset, code = 'invalid_report') {
  assert.throws(
    () => inspectBrowserResults(reportValue, preset),
    (error) => error instanceof BrowserResultsError && error.code === code,
  )
}

function pick(result) {
  const { ok, code, suite, total, executed, passed, skipped, failed } = result
  return { ok, code, suite, total, executed, passed, skipped, failed }
}

function runCli(t, reportText, preset = 'signed-in') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'rc-browser-results-cli-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const reportPath = path.join(directory, 'report.json')
  writeFileSync(reportPath, reportText)
  return spawnSync(process.execPath, [helper, 'verify', preset, reportPath], {
    cwd: root,
    encoding: 'utf8',
  })
}

function stepBody(name) {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  assert.ok(start >= 0, `candidate.yml must keep the step ${name}`)
  const next = workflow.indexOf('\n      - name:', start + marker.length)
  return workflow.slice(start, next < 0 ? undefined : next)
}

test('accepts two cleanly passed signed-in tests', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
    testEntry(),
    testEntry(),
  ])])
  assert.deepEqual(pick(inspectBrowserResults(value, 'signed-in')), {
    ok: true,
    code: 'passed',
    suite: 'signed-in',
    total: 2,
    executed: 2,
    passed: 2,
    skipped: 0,
    failed: 0,
  })
})

test('accepts additional cleanly passed tests without a fixed upper bound', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
    testEntry(),
    testEntry(),
    testEntry(),
  ])])
  const inspected = inspectBrowserResults(value, 'signed-in')
  assert.equal(inspected.ok, true)
  assert.equal(inspected.total, 3)
  assert.equal(inspected.passed, 3)
})

test('accepts the required shared-group pass', () => {
  const value = report([specEntry(SHARED_GROUP_SPEC, 'shared group', [testEntry()])])
  const inspected = inspectBrowserResults(value, 'shared-group')
  assert.equal(inspected.ok, true)
  assert.equal(inspected.code, 'passed')
  assert.equal(inspected.passed, 1)
})

test('rejects signed-in when only one of the two required tests passed', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [testEntry()])])
  assert.equal(inspectBrowserResults(value, 'signed-in').code, 'insufficient_passed')
})

test('rejects an all-skipped report as zero execution', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'skipped', [
    testEntry({ status: 'skipped', expectedStatus: 'skipped', results: [result('skipped')] }),
    testEntry({ status: 'skipped', expectedStatus: 'skipped', results: [result('skipped')] }),
  ])])
  const inspected = inspectBrowserResults(value, 'signed-in')
  assert.equal(inspected.ok, false)
  assert.equal(inspected.code, 'zero_execution')
  assert.equal(inspected.executed, 0)
  assert.equal(inspected.skipped, 2)
})

test('rejects a partially skipped report even when enough other tests pass', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
    testEntry(),
    testEntry(),
    testEntry({ status: 'skipped', expectedStatus: 'skipped', results: [result('skipped')] }),
  ])])
  assert.equal(inspectBrowserResults(value, 'signed-in').code, 'tests_skipped')
})

test('rejects a retry-pass even when the final result is passed', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
    testEntry({ status: 'flaky', results: [result('failed', 0), result('passed', 1)] }),
    testEntry(),
  ])])
  const inspected = inspectBrowserResults(value, 'signed-in')
  assert.equal(inspected.ok, false)
  assert.equal(inspected.code, 'retry_attempted')
  assert.equal(inspected.passed, 1)
  assert.equal(inspected.failed, 1)
})

test('rejects failed and timed-out results', () => {
  for (const status of ['failed', 'timedOut', 'interrupted']) {
    const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
      testEntry({ status: 'unexpected', results: [result(status)] }),
      testEntry(),
    ])])
    const inspected = inspectBrowserResults(value, 'signed-in')
    assert.equal(inspected.ok, false, status)
    assert.equal(inspected.code, 'tests_failed', status)
  }
})

test('rejects the wrong spec and any additional spec', () => {
  const wrong = report([specEntry(SHARED_GROUP_SPEC, 'shared group', [testEntry()])])
  assert.equal(inspectBrowserResults(wrong, 'signed-in').code, 'unexpected_spec')

  const mixed = report([
    specEntry(SIGNED_IN_SPEC, 'signs in and chats', [testEntry(), testEntry()]),
    specEntry(SHARED_GROUP_SPEC, 'shared group', [testEntry()]),
  ])
  assert.equal(inspectBrowserResults(mixed, 'signed-in').code, 'unexpected_spec')
})

test('rejects a report from multiple projects', () => {
  const value = report([specEntry(SIGNED_IN_SPEC, 'signs in and chats', [
    testEntry(),
    testEntry({ projectName: 'firefox' }),
  ])])
  assert.equal(inspectBrowserResults(value, 'signed-in').code, 'unexpected_project')
})

test('rejects stats that contradict the actual results', () => {
  const specs = [specEntry(SIGNED_IN_SPEC, 'signs in and chats', [testEntry()])]
  const value = report(specs, { stats: { expected: 2, skipped: 0, unexpected: 0, flaky: 0 } })
  assert.equal(inspectBrowserResults(value, 'signed-in').code, 'stats_mismatch')
})

test('rejects an empty report and report-level errors', () => {
  assert.equal(inspectBrowserResults(report([]), 'signed-in').code, 'empty_report')
  const withErrors = report([
    specEntry(SIGNED_IN_SPEC, 'signs in and chats', [testEntry(), testEntry()]),
  ], { errors: [{ message: SENTINEL }] })
  assert.equal(inspectBrowserResults(withErrors, 'signed-in').code, 'report_has_errors')
})

test('rejects malformed report structures without exposing data', () => {
  assertStructuralRejection(null, 'signed-in')
  assertStructuralRejection({ suites: [], errors: [], stats: {} }, 'signed-in')
  assertStructuralRejection({
    suites: [{ specs: [{ file: SIGNED_IN_SPEC, ok: true, tests: [] }] }],
    errors: [],
    stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
  }, 'signed-in')
  assertStructuralRejection({
    suites: [{ specs: [{ file: SIGNED_IN_SPEC, ok: true, tests: [{ status: 'expected' }] }] }],
    errors: [],
    stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
  }, 'signed-in')
})

test('malformed JSON is rejected with a fixed code and no parse message', () => {
  assert.throws(
    () => parseBrowserReport(`{"title":"${SENTINEL}",`),
    (error) => error instanceof BrowserResultsError
      && error.code === 'invalid_report_json'
      && !error.message.includes(SENTINEL),
  )
})

test('CLI success prints only the allow-listed suite and counts', (t) => {
  const value = report([specEntry(SIGNED_IN_SPEC, `title ${SENTINEL}`, [
    testEntry(),
    testEntry(),
  ])])
  const child = runCli(t, JSON.stringify(value))
  assert.equal(child.status, 0)
  assert.match(child.stdout, /suite=signed-in/)
  assert.match(child.stdout, /total=2 executed=2 passed=2 skipped=0 failed=0/)
  assert.doesNotMatch(child.stdout + child.stderr, new RegExp(SENTINEL))
})

test('CLI failure never prints a test title or raw error', (t) => {
  const value = report([specEntry(SIGNED_IN_SPEC, `title ${SENTINEL}`, [
    testEntry({
      status: 'unexpected',
      results: [{ ...result('failed'), error: { message: SENTINEL } }],
    }),
    testEntry(),
  ])])
  const child = runCli(t, JSON.stringify(value))
  assert.equal(child.status, 1)
  assert.match(child.stdout, /suite=signed-in/)
  assert.match(child.stderr, /rejected \(tests_failed\)/)
  assert.doesNotMatch(child.stdout + child.stderr, new RegExp(SENTINEL))
})

test('CLI malformed JSON never echoes the parse input', (t) => {
  const child = runCli(t, `{"title":"${SENTINEL}",`)
  assert.equal(child.status, 1)
  assert.match(child.stderr, /rejected \(invalid_report_json\)/)
  assert.doesNotMatch(child.stdout + child.stderr, new RegExp(SENTINEL))
})

test('both RC acceptance steps write a private JSON report and verify it before acceptance', () => {
  const signedIn = stepBody('Signed-in acceptance (xpod RC seed account)')
  const sharedGroup = stepBody('Shared-group acceptance (Alice and Bob on the real RC provider)')

  const expectations = [
    [signedIn, 'signed-in', 'rc-browser-signed-in.json'],
    [sharedGroup, 'shared-group', 'rc-browser-shared-group.json'],
  ]
  for (const [step, preset, reportName] of expectations) {
    assert.match(step, new RegExp(`report="\\$RUNNER_TEMP/${reportName}"`))
    assert.match(step, /umask 077/)
    assert.match(step, /PLAYWRIGHT_JSON_OUTPUT_FILE="\$report"/)
    assert.match(step, /--reporter=list,json/)
    assert.match(step, /test -s "\$report"/)
    assert.match(step, /chmod 600 "\$report"/)
    assert.match(step, new RegExp(`node ../../scripts/rc-browser-results\\.mjs verify ${preset} "\\$report"`))
    assert.doesNotMatch(step, /continue-on-error/)
  }

  const releaseScripts = stepBody('Release script tests')
  assert.match(releaseScripts, /scripts\/rc-browser-results\.test\.mjs/)
})
