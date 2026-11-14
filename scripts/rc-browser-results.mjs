import { readFileSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Verify that a Playwright JSON report proves the RC browser acceptance really
 * executed. `--reporter=list` exits 0 when every test is skipped because the
 * account/env inputs are absent; a release record must never turn that into
 * `passed`. This helper ignores the report's own stats as proof and walks the
 * actual target-spec tests and results.
 *
 * The summary is an allow-list of suite identifier and counts. Never print a
 * test title, raw error, report path, or a JSON.parse message: all of those can
 * contain the per-run seeded credentials.
 */

export const RC_BROWSER_PRESETS = Object.freeze({
  'signed-in': Object.freeze({
    suite: 'signed-in',
    spec: 'specs/deployed-signed-in.spec.ts',
    minPassed: 2,
  }),
  'shared-group': Object.freeze({
    suite: 'shared-group',
    spec: 'specs/rc-shared-group.spec.ts',
    minPassed: 1,
  }),
})

const STAT_KEYS = ['expected', 'skipped', 'unexpected', 'flaky']
const TEST_STATUSES = new Set(['expected', 'skipped', 'unexpected', 'flaky'])

export class BrowserResultsError extends Error {
  constructor(code) {
    super(code)
    this.name = 'BrowserResultsError'
    this.code = code
  }
}

function invalid(code = 'invalid_report') {
  throw new BrowserResultsError(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizedFile(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//u, '')
}

/** Parse the file without ever exposing JSON.parse's input-derived message. */
export function parseBrowserReport(text) {
  if (typeof text !== 'string') invalid('invalid_report_json')
  let report
  try {
    report = JSON.parse(text)
  } catch {
    invalid('invalid_report_json')
  }
  if (!isRecord(report)) invalid('invalid_report')
  return report
}

function collectSpecs(suites, specs) {
  for (const suite of suites) {
    if (!isRecord(suite)) invalid()
    if (suite.specs !== undefined) {
      if (!Array.isArray(suite.specs)) invalid()
      specs.push(...suite.specs)
    }
    if (suite.suites !== undefined) {
      if (!Array.isArray(suite.suites)) invalid()
      collectSpecs(suite.suites, specs)
    }
  }
}

/**
 * Inspect a parsed report for one preset. Structural damage throws a safe
 * `BrowserResultsError`; a well-formed report that does not prove the required
 * execution returns `{ ok: false, code }` with counts for the safe summary.
 */
export function inspectBrowserResults(report, presetName) {
  const preset = RC_BROWSER_PRESETS[presetName]
  if (!preset) invalid('unknown_preset')
  if (!isRecord(report)) invalid()
  if (!Array.isArray(report.suites) || !Array.isArray(report.errors) || !isRecord(report.stats)) {
    invalid()
  }

  const stats = report.stats
  for (const key of STAT_KEYS) {
    if (!Number.isInteger(stats[key]) || stats[key] < 0) invalid()
  }

  const specs = []
  collectSpecs(report.suites, specs)

  const files = new Set()
  const projects = new Set()
  const outcomeCounts = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 }
  let total = 0
  let passed = 0
  let skipped = 0
  let failed = 0
  let executed = 0
  let retried = false

  for (const spec of specs) {
    if (!isRecord(spec)) invalid()
    if (typeof spec.file !== 'string' || spec.file.length === 0) invalid()
    if (typeof spec.ok !== 'boolean') invalid()
    if (!Array.isArray(spec.tests) || spec.tests.length === 0) invalid()
    files.add(normalizedFile(spec.file))

    for (const test of spec.tests) {
      if (!isRecord(test)) invalid()
      if (typeof test.status !== 'string' || !TEST_STATUSES.has(test.status)) invalid()
      if (typeof test.expectedStatus !== 'string') invalid()
      if (typeof test.projectName !== 'string' || test.projectName.length === 0) invalid()
      if (!Array.isArray(test.results)) invalid()
      for (const result of test.results) {
        if (!isRecord(result)) invalid()
        if (typeof result.status !== 'string') invalid()
        if (!Number.isInteger(result.retry) || result.retry < 0) invalid()
      }

      projects.add(test.projectName)
      outcomeCounts[test.status] += 1
      total += 1

      const statuses = test.results.map((result) => result.status)
      const hasSkipped = test.status === 'skipped' || statuses.includes('skipped')
      if (test.results.some((result) => result.retry > 0)
        || test.results.length > 1
        || test.status === 'flaky') {
        retried = true
      }

      if (hasSkipped) {
        skipped += 1
        continue
      }

      executed += 1
      const cleanPass = test.status === 'expected'
        && test.expectedStatus === 'passed'
        && test.results.length === 1
        && statuses[0] === 'passed'
        && test.results[0].retry === 0
      if (cleanPass) {
        passed += 1
      } else {
        failed += 1
      }
    }
  }

  const statsMatch = STAT_KEYS.every((key) => stats[key] === outcomeCounts[key])
    && STAT_KEYS.reduce((sum, key) => sum + stats[key], 0) === total

  let code = 'passed'
  if (total === 0) code = 'empty_report'
  else if (report.errors.length > 0) code = 'report_has_errors'
  else if (files.size !== 1 || !files.has(preset.spec)) code = 'unexpected_spec'
  else if (projects.size !== 1) code = 'unexpected_project'
  else if (!statsMatch) code = 'stats_mismatch'
  else if (executed === 0) code = 'zero_execution'
  else if (skipped > 0) code = 'tests_skipped'
  else if (retried) code = 'retry_attempted'
  else if (failed > 0) code = 'tests_failed'
  else if (passed < preset.minPassed) code = 'insufficient_passed'

  return {
    ok: code === 'passed',
    code,
    suite: preset.suite,
    total,
    executed,
    passed,
    skipped,
    failed,
  }
}

const SAFE_ERROR_CODES = new Set([
  'invalid_report_json',
  'invalid_report',
  'unknown_preset',
  'report_unreadable',
  'verification_failed',
])

function safeFailureCode(error) {
  if (error instanceof BrowserResultsError) return error.code
  return 'verification_failed'
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [, , command, presetName, reportPath] = process.argv
  if (command !== 'verify' || !presetName || !reportPath) {
    console.error('usage: node scripts/rc-browser-results.mjs verify <signed-in|shared-group> <report.json>')
    process.exit(2)
  }

  let reportText
  try {
    reportText = readFileSync(reportPath, 'utf8')
  } catch {
    console.error('::error::RC browser results rejected (report_unreadable)')
    process.exit(1)
  }

  let result
  try {
    const report = parseBrowserReport(reportText)
    result = inspectBrowserResults(report, presetName)
  } catch (error) {
    const code = safeFailureCode(error)
    console.error(`::error::RC browser results rejected (${SAFE_ERROR_CODES.has(code) ? code : 'verification_failed'})`)
    process.exit(1)
  }

  console.log(
    `RC browser results: suite=${result.suite} total=${result.total} executed=${result.executed} `
      + `passed=${result.passed} skipped=${result.skipped} failed=${result.failed}`,
  )
  if (!result.ok) {
    console.error(`::error::RC browser results rejected (${result.code})`)
    process.exit(1)
  }
}
