import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scenariosRoot = join(root, 'tests/fixtures/symphony-dual-role/scenarios')
const outRoot = join(root, 'preview/symphony-dual-role-verification')
const checkOnly = process.argv.includes('--check')

const requiredSections = [
  'Status',
  'Scope',
  'Current Truth',
  'Active Work',
  'Compatibility Impact',
  'Evidence',
  'Open Questions',
  'Next Step',
  'Related Docs',
]

const requiredClassifications = [
  'ordinary_message',
  'new_concern',
  'update_existing',
  'steering',
  'bug_or_regression',
  'conflict',
  'duplicate',
  'defer',
  'ask',
]

const requiredSystemStates = [
  'existing',
  'partial',
  'known-broken',
]

const requiredWorkStates = [
  'drafting',
  'running',
  'blocked',
  'reviewing',
  'cancelled',
]

const requiredCompatibilityImpacts = [
  'compatible',
  'behavior_change',
  'breaking',
  'migration_required',
]

const failures = []
const summaries = []

if (!existsSync(scenariosRoot)) {
  fail(`missing scenarios root: ${scenariosRoot}`)
}

const scenarioDirs = existsSync(scenariosRoot)
  ? readdirSync(scenariosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(scenariosRoot, entry.name))
    .sort()
  : []

if (scenarioDirs.length === 0) {
  fail(`no scenarios found under ${scenariosRoot}`)
}

const suiteCoverage = {
  classifications: new Set(),
  systemStates: new Set(),
  workStates: new Set(),
  compatibilityImpacts: new Set(),
}

if (!checkOnly) {
  rmSync(outRoot, { recursive: true, force: true })
  mkdirSync(outRoot, { recursive: true })
}

for (const dir of scenarioDirs) {
  const scenarioPath = join(dir, 'scenario.json')
  const finalRecordPath = join(dir, 'final-control-record.md')
  const scenario = readJson(scenarioPath)
  const finalRecord = readText(finalRecordPath)
  if (!scenario || !finalRecord) continue

  const report = verifyScenario(dir, scenario, finalRecord)
  recordCoverage(scenario)
  summaries.push({
    id: scenario.id,
    title: scenario.title,
    status: report.ok ? 'passed' : 'failed',
    checks: report.checks,
    output: checkOnly ? undefined : `${scenario.id}/`,
  })

  if (!checkOnly) {
    writeScenarioBundle(scenario, finalRecord, report)
  }
}

verifySuiteCoverage()

if (!checkOnly) {
  writeFileSync(join(outRoot, 'summary.json'), `${JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    coverage: {
      classifications: [...suiteCoverage.classifications].sort(),
      systemStates: [...suiteCoverage.systemStates].sort(),
      workStates: [...suiteCoverage.workStates].sort(),
      compatibilityImpacts: [...suiteCoverage.compatibilityImpacts].sort(),
    },
    scenarios: summaries,
  }, null, 2)}\n`)
  packOutput()
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'))
  process.exit(1)
}

for (const summary of summaries) {
  console.log(`PASS ${summary.id}`)
}
console.log(checkOnly
  ? `symphony dual-role fixtures verified (${summaries.length} scenarios)`
  : `symphony dual-role fixtures packed: ${outRoot}`)

function verifyScenario(dir, scenario, finalRecord) {
  const checks = []
  const scenarioName = scenario.id ?? basename(dir)

  check(scenario.version === 1, 'scenario version is 1')
  check(typeof scenario.id === 'string' && scenario.id === basename(dir), 'scenario id matches directory')
  check(scenario.inputPolicy === 'user_fragments_only', 'input policy is user_fragments_only')
  check(scenario.acceptance?.finalOnly === true, 'acceptance is final-only')
  check(Array.isArray(scenario.userFragments) && scenario.userFragments.length > 0, 'user fragments exist')
  check(Array.isArray(scenario.secretaryReplies), 'secretary replies exist')
  check(scenario.secretaryReplies.length === scenario.userFragments.length, 'secretary replies align with user fragments')

  for (const fragment of scenario.userFragments ?? []) {
    check(fragment.id && typeof fragment.content === 'string', `user fragment ${fragment.id ?? '?'} has content`)
  }

  for (const reply of scenario.secretaryReplies ?? []) {
    check(reply.after && typeof reply.content === 'string', `secretary reply after ${reply.after ?? '?'} has content`)
    check((scenario.userFragments ?? []).some((fragment) => fragment.id === reply.after), `secretary reply ${reply.after ?? '?'} points to a user fragment`)
  }

  for (const section of requiredSections) {
    check(finalRecord.includes(`## ${section}`), `final record has ${section}`)
  }

  for (const phrase of scenario.acceptance?.requiredPhrases ?? []) {
    check(includesNormalized(finalRecord, phrase), `final record contains required phrase: ${phrase}`)
  }

  for (const phrase of scenario.acceptance?.forbiddenPhrases ?? []) {
    check(!includesForbidden(finalRecord, phrase), `final record excludes forbidden phrase: ${phrase}`)
  }

  check(!finalRecord.includes('TODO'), 'final record has no TODO placeholders')
  check(finalRecord.includes('## Acceptance Summary'), 'final record includes acceptance summary')

  return {
    ok: checks.every((item) => item.ok),
    checks,
  }

  function check(ok, label) {
    checks.push({ label, ok })
    if (!ok) {
      fail(`${scenarioName}: ${label}`)
    }
  }
}

function recordCoverage(scenario) {
  if (typeof scenario.acceptance?.classification === 'string') {
    suiteCoverage.classifications.add(scenario.acceptance.classification)
  }
  if (typeof scenario.acceptance?.systemState === 'string') {
    suiteCoverage.systemStates.add(scenario.acceptance.systemState)
  }
  if (typeof scenario.acceptance?.workState === 'string') {
    suiteCoverage.workStates.add(scenario.acceptance.workState)
  }
  if (typeof scenario.acceptance?.compatibilityImpact === 'string') {
    suiteCoverage.compatibilityImpacts.add(scenario.acceptance.compatibilityImpact)
  }
}

function verifySuiteCoverage() {
  for (const classification of requiredClassifications) {
    if (!suiteCoverage.classifications.has(classification)) {
      fail(`suite coverage missing classification: ${classification}`)
    }
  }
  for (const systemState of requiredSystemStates) {
    if (!suiteCoverage.systemStates.has(systemState)) {
      fail(`suite coverage missing system state: ${systemState}`)
    }
  }
  for (const workState of requiredWorkStates) {
    if (!suiteCoverage.workStates.has(workState)) {
      fail(`suite coverage missing work state: ${workState}`)
    }
  }
  for (const impact of requiredCompatibilityImpacts) {
    if (!suiteCoverage.compatibilityImpacts.has(impact)) {
      fail(`suite coverage missing compatibility impact: ${impact}`)
    }
  }
}

function includesNormalized(source, phrase) {
  return normalizeText(source).includes(normalizeText(phrase))
}

function includesForbidden(source, phrase) {
  const target = normalizeText(phrase)
  const lines = String(source).split(/\r?\n/)
  for (const line of lines) {
    const normalizedLine = normalizeText(line)
    let index = normalizedLine.indexOf(target)
    while (index !== -1) {
      const prefix = normalizedLine.slice(0, index).trimEnd()
      if (!isNegatedPrefix(prefix)) {
        return true
      }
      index = normalizedLine.indexOf(target, index + target.length)
    }
  }
  return false
}

function isNegatedPrefix(prefix) {
  return /\b(do not|don't|not|no|never)\b(?:\s+\w+){0,3}\s*$/.test(prefix)
}

function normalizeText(value) {
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase()
}

function writeScenarioBundle(scenario, finalRecord, report) {
  const scenarioOut = join(outRoot, scenario.id)
  mkdirSync(scenarioOut, { recursive: true })
  writeFileSync(join(scenarioOut, 'scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`)
  writeFileSync(join(scenarioOut, 'replay.jsonl'), renderReplayJsonl(scenario))
  writeFileSync(join(scenarioOut, 'final-control-record.md'), finalRecord.endsWith('\n') ? finalRecord : `${finalRecord}\n`)
  writeFileSync(join(scenarioOut, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`)
}

function renderReplayJsonl(scenario) {
  const lines = []
  for (const fragment of scenario.userFragments) {
    lines.push(JSON.stringify({
      scenario: scenario.id,
      turn: fragment.id,
      role: 'user',
      policy: 'fragmented_input_only',
      content: fragment.content,
    }))
    const reply = scenario.secretaryReplies.find((item) => item.after === fragment.id)
    if (reply) {
      lines.push(JSON.stringify({
        scenario: scenario.id,
        turn: `${fragment.id}-secretary`,
        role: 'ai-secretary',
        derivesFrom: fragment.id,
        content: reply.content,
      }))
    }
  }
  return `${lines.join('\n')}\n`
}

function packOutput() {
  const tarball = `${outRoot}.tgz`
  rmSync(tarball, { force: true })
  const result = spawnSync('tar', ['-czf', tarball, '-C', outRoot, '.'], {
    stdio: 'inherit',
  })
  if ((result.status ?? 1) !== 0) {
    fail(`failed to create tarball: ${tarball}`)
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`failed to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    fail(`failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function fail(message) {
  failures.push(message)
}
