import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const marketplaceRoot = process.env.LINX_MARKETPLACE_ROOT
  ? process.env.LINX_MARKETPLACE_ROOT
  : existsSync(join(root, 'marketplace', 'plugins'))
    ? join(root, 'marketplace')
    : join(root, '..', 'marketplace')

const files = {
  capture: join(marketplaceRoot, 'plugins', 'linx-capture', 'skills', 'capture', 'SKILL.md'),
  symphony: join(marketplaceRoot, 'plugins', 'linx-symphony', 'skills', 'symphony', 'SKILL.md'),
}

const staticOnly = process.argv.includes('--static-only')
const checkCodexInstalled = process.argv.includes('--codex-installed')
const checkCodexNoLoginE2E = process.argv.includes('--codex-no-login-e2e')
const failures = []
const warnings = []
const passes = []

const sources = Object.fromEntries(Object.entries(files).map(([name, path]) => {
  if (!existsSync(path)) {
    failures.push(`${name}: missing ${path}`)
    return [name, '']
  }
  return [name, readFileSync(path, 'utf8')]
}))

runStaticSkillContractCases()
if (checkCodexInstalled) {
  runCodexInstalledSkillCases()
}
if (checkCodexNoLoginE2E) {
  runCodexNoLoginLocalFirstCase()
}
if (!staticOnly) {
  runXpodDescriptorCases()
}

for (const pass of passes) {
  console.log(`PASS ${pass}`)
}
for (const warning of warnings) {
  console.warn(`WARN ${warning}`)
}
if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'))
  process.exit(1)
}

const summaryParts = ['static contract']
if (checkCodexInstalled) summaryParts.push('codex installed skills')
if (checkCodexNoLoginE2E) summaryParts.push('codex no-login local-first e2e')
if (!staticOnly) summaryParts.push('xpod descriptor dry-run')
console.log(`plc agent skill benchmark ok (${summaryParts.join(' + ')})`)

function runStaticSkillContractCases() {
  const cases = [
    {
      id: 'skill-contract:capture-auth-local-first',
      checks: [
        ['capture', /\$SOLID_HOME\/auth/],
        ['capture', /default `~\/\.solid\/auth`/],
        ['capture', /Do not treat old\s+`~\/\.xpod\/config\.json`/],
        ['capture', /`~\/\.xpod\/secrets\.json` as proof of login/],
        ['capture', /No-login use is still valid/],
        ['capture', /local-first/],
        ['capture', /pending_local/],
        ['capture', /apps\/xpod\/outbox\/obj-mutations\.jsonl/],
      ],
    },
    {
      id: 'skill-contract:symphony-auth-local-first',
      checks: [
        ['symphony', /\$SOLID_HOME\/auth\/credentials\.json/],
        ['symphony', /old `~\/\.xpod\/config\.json`/],
        ['symphony', /`~\/\.xpod\/secrets\.json` files are not Solid auth sources/],
        ['symphony', /No-login use is still valid/],
        ['symphony', /portable local mode/],
        ['symphony', /pending_local/],
        ['symphony', /not be described as saved to the user's Pod/],
      ],
    },
    {
      id: 'skill-contract:modeled-discovery-before-write',
      checks: [
        ['capture', /xpod obj schemas --json/],
        ['capture', /xpod obj describe <schema-or-alias> --json/],
        ['capture', /xpod obj upsert --schema <schema-or-alias> --from - --dry-run --json/],
        ['capture', /send JSONL: one JSON object per line/],
        ['capture', /Do not hand-write Turtle/],
        ['capture', /Do not assume `Idea`/],
        ['symphony', /xpod obj schemas --domain symphony --json/],
        ['symphony', /xpod obj describe <schema-or-alias> --json/],
        ['symphony', /xpod obj upsert --schema <schema-or-alias> --from - --dry-run --json/],
        ['symphony', /send JSONL: one JSON object per line/],
        ['symphony', /do not hand-patch modeled TTL paths/],
        ['symphony', /Do not store fixed field definitions, path templates, or predicate lists/],
      ],
    },
    {
      id: 'skill-contract:truthful-persistence-reporting',
      checks: [
        ['capture', /Report that status honestly as local pending, not Pod saved/],
        ['capture', /If capture failed, state the persistence blocker/],
        ['symphony', /state the persistence limitation when a Pod write\s+was requested/],
        ['symphony', /not cross-device shared authority/],
      ],
    },
  ]

  for (const item of cases) {
    for (const [sourceName, pattern] of item.checks) {
      const source = sources[sourceName] ?? ''
      if (!pattern.test(source)) {
        failures.push(`${item.id}: ${sourceName} missing ${pattern}`)
      }
    }
    if (!failures.some((failure) => failure.startsWith(`${item.id}:`))) {
      passes.push(item.id)
    }
  }
}


function runCodexInstalledSkillCases() {
  const checks = [
    {
      sourceName: 'capture',
      pluginName: 'linx-capture',
      skillName: 'capture',
    },
    {
      sourceName: 'symphony',
      pluginName: 'linx-symphony',
      skillName: 'symphony',
    },
  ]

  for (const check of checks) {
    const source = sources[check.sourceName]
    if (!source) continue
    const installedPath = resolveCodexInstalledSkillPath(check.pluginName, check.skillName)
    if (!installedPath) {
      failures.push(`codex-installed:${check.sourceName}: installed skill cache missing for ${check.pluginName}`)
      continue
    }
    const installed = readFileSync(installedPath, 'utf8')
    if (installed !== source) {
      failures.push(`codex-installed:${check.sourceName}: installed skill cache differs from marketplace source (${installedPath})`)
      continue
    }
    passes.push(`codex-installed:${check.sourceName}`)
  }
}

function resolveCodexInstalledSkillPath(pluginName, skillName) {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  const pluginRoot = join(codexHome, 'plugins', 'cache', 'undefineds', pluginName)
  if (!existsSync(pluginRoot)) return null
  const candidates = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      version: entry.name,
      path: join(pluginRoot, entry.name, 'skills', skillName, 'SKILL.md'),
    }))
    .filter((entry) => existsSync(entry.path))
    .sort((a, b) => compareVersionLike(a.version, b.version))
  return candidates.at(-1)?.path ?? null
}

function compareVersionLike(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function runCodexNoLoginLocalFirstCase() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'plc-codex-no-login-e2e-'))
  try {
    const workdir = join(tempRoot, 'work')
    const solidHome = join(tempRoot, 'solid-home')
    const lastMessage = join(tempRoot, 'last-message.json')
    const events = join(tempRoot, 'events.jsonl')
    mkdirSync(workdir, { recursive: true })
    mkdirSync(solidHome, { recursive: true })

    const prompt = [
      '$linx-capture:capture',
      'Run a no-login local-first capture acceptance in this temporary workspace only.',
      'Do not write to the real Pod.',
      'Use xpod obj schemas --json to discover schemas.',
      'Use xpod obj describe CapturePolicy --json if available; otherwise describe Idea.',
      'Prepare one compact JSONL object on stdin and run xpod obj upsert --schema <chosen> --from - --dry-run --json.',
      'Run the same upsert with --commit --json.',
      'Because this benchmark runs with an isolated SOLID_HOME and no Solid credentials, the expected result is pending_local/local outbox, not Pod saved.',
      'Final response must be compact JSON with keys: schema, discovery_ok, dry_run_ok, commit_status, pending_local_ok, outbox_path.',
    ].join('\n')

    const codex = process.env.CODEX_BIN || 'codex'
    const localBin = join(root, 'node_modules', '.bin')
    const result = spawnSync(codex, [
      'exec',
      '--ephemeral',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      '-C',
      workdir,
      '--output-last-message',
      lastMessage,
      '--json',
      prompt,
    ], {
      cwd: workdir,
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: `${localBin}:${process.env.PATH ?? ''}`,
        SOLID_HOME: solidHome,
      },
    })

    if (result.error) {
      failures.push(`codex-e2e:no-login-local-first: ${result.error.message}`)
      return
    }
    writeFileSync(events, `${result.stdout ?? ''}${result.stderr ?? ''}`)
    if (result.status !== 0) {
      failures.push(`codex-e2e:no-login-local-first: codex exit ${result.status}\n${tailText(result.stderr || result.stdout)}`)
      return
    }
    if (!existsSync(lastMessage)) {
      failures.push('codex-e2e:no-login-local-first: missing Codex last-message output')
      return
    }

    const message = readFileSync(lastMessage, 'utf8').trim()
    let parsed
    try {
      parsed = JSON.parse(message)
    } catch (error) {
      failures.push(`codex-e2e:no-login-local-first: last message is not compact JSON: ${error instanceof Error ? error.message : String(error)}\n${message}`)
      return
    }

    if (parsed.discovery_ok !== true || parsed.dry_run_ok !== true) {
      failures.push('codex-e2e:no-login-local-first: expected discovery_ok and dry_run_ok to be true')
    }
    if (parsed.commit_status !== 'pending_local' || parsed.pending_local_ok !== true) {
      failures.push('codex-e2e:no-login-local-first: expected pending_local commit status')
    }
    if (typeof parsed.schema !== 'string' || !parsed.schema) {
      failures.push('codex-e2e:no-login-local-first: expected schema in final JSON')
    }
    if (typeof parsed.outbox_path !== 'string' || !parsed.outbox_path) {
      failures.push('codex-e2e:no-login-local-first: expected outbox_path in final JSON')
      return
    }
    if (!existsSync(parsed.outbox_path)) {
      failures.push(`codex-e2e:no-login-local-first: outbox_path does not exist: ${parsed.outbox_path}`)
      return
    }

    const realTempRoot = realpathSync(tempRoot)
    const realOutbox = realpathSync(parsed.outbox_path)
    const outboxRelative = relative(realTempRoot, realOutbox)
    if (outboxRelative.startsWith('..')) {
      failures.push(`codex-e2e:no-login-local-first: outbox_path escaped benchmark temp root: ${parsed.outbox_path}`)
      return
    }
    const outbox = readFileSync(parsed.outbox_path, 'utf8').trim()
    if (!outbox) {
      failures.push(`codex-e2e:no-login-local-first: outbox is empty: ${parsed.outbox_path}`)
      return
    }
    passes.push('codex-e2e:no-login-local-first')
  } finally {
    if (!process.env.KEEP_PLC_CODEX_E2E_ARTIFACTS) {
      rmSync(tempRoot, { recursive: true, force: true })
    } else {
      warnings.push(`codex-e2e:no-login-local-first: kept artifacts at ${tempRoot}`)
    }
  }
}

function runXpodDescriptorCases() {
  const xpod = resolveXpodCommand()
  const schemas = runXpodJson(xpod, 'xpod:schemas', ['obj', 'schemas', '--json'])
  if (schemas) {
    const items = schemas.data?.schemas
    if (!Array.isArray(items) || items.length < 8) {
      failures.push('xpod:schemas: expected data.schemas with descriptor entries')
    } else {
      passes.push(`xpod:schemas (${items.length} schemas)`)
    }
  }

  const symphonySchemas = runXpodJson(xpod, 'xpod:symphony-schemas', [
    'obj',
    'schemas',
    '--domain',
    'symphony',
    '--json',
  ])
  if (symphonySchemas) {
    const aliases = new Set((symphonySchemas.data?.schemas ?? []).map((item) => item.alias))
    for (const required of ['Issue', 'Task', 'Run', 'RunStep', 'Evidence', 'Report']) {
      if (!aliases.has(required)) {
        failures.push(`xpod:symphony-schemas: missing ${required}`)
      }
    }
    if (!failures.some((failure) => failure.startsWith('xpod:symphony-schemas:'))) {
      passes.push(`xpod:symphony-schemas (${aliases.size} schemas)`)
    }
  }

  const idea = runDescribeCase(xpod, 'Idea', ['id', 'summary'])
  const task = runDescribeCase(xpod, 'Task', ['id', 'instruction', 'workspace'])
  runDryRunCases(xpod, idea, task)
}

function runDescribeCase(xpod, schema, requiredFields) {
  const result = runXpodJson(xpod, `xpod:describe:${schema}`, ['obj', 'describe', schema, '--json'])
  if (!result) return null
  const descriptor = result.data?.descriptor
  if (!descriptor?.fields) {
    failures.push(`xpod:describe:${schema}: missing data.descriptor.fields`)
    return null
  }
  for (const field of requiredFields) {
    if (!descriptor.fields[field]?.required) {
      failures.push(`xpod:describe:${schema}: field is not required: ${field}`)
    }
  }
  if (!failures.some((failure) => failure.startsWith(`xpod:describe:${schema}:`))) {
    passes.push(`xpod:describe:${schema}`)
  }
  return descriptor
}

function runDryRunCases(xpod, ideaDescriptor, taskDescriptor) {
  if (!ideaDescriptor || !taskDescriptor) return

  const tempRoot = mkdtempSync(join(tmpdir(), 'plc-agent-skill-benchmark-'))
  try {
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace(/Z$/u, 'Z')
    const ideaFile = join(tempRoot, 'idea.jsonl')
    const taskFile = join(tempRoot, 'task.jsonl')
    writeFileSync(ideaFile, `${JSON.stringify({
      match: { id: `benchmark/${stamp}.ttl#idea` },
      set: {
        summary: 'PLC agent skill benchmark capture dry-run',
        status: 'benchmark',
        commitment: 'test',
        input: 'Dry-run only; do not commit.',
        metadata: { benchmark: 'plc-agent-skill' },
      },
    })}\n`)
    writeFileSync(taskFile, `${JSON.stringify({
      match: { id: `benchmark/${stamp}.ttl#task` },
      set: {
        title: 'PLC agent skill benchmark Symphony dry-run',
        instruction: 'Dry-run only; do not commit.',
        workspace: 'https://id.undefineds.co/gcloud/projects/linx-cli#this',
        status: 'benchmark',
        priority: 'low',
        metadata: { benchmark: 'plc-agent-skill' },
      },
    })}\n`)

    runDryRunCase(xpod, 'Idea', ideaFile)
    runDryRunCase(xpod, 'Task', taskFile)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runDryRunCase(xpod, schema, file) {
  const result = runXpodJson(xpod, `xpod:dry-run:${schema}`, [
    'obj',
    'upsert',
    '--schema',
    schema,
    '--from',
    file,
    '--dry-run',
    '--json',
  ])
  if (!result) return
  if (result.code !== 'plan_ready' || result.items?.[0]?.code !== 'plan_ready') {
    failures.push(`xpod:dry-run:${schema}: expected plan_ready`)
    return
  }
  if (!result.items?.[0]?.subject || !result.items?.[0]?.resourceUri) {
    failures.push(`xpod:dry-run:${schema}: expected subject and resourceUri`)
    return
  }
  passes.push(`xpod:dry-run:${schema}`)
}

function resolveXpodCommand() {
  const localBin = join(root, 'node_modules', '.bin', 'xpod')
  if (existsSync(localBin)) {
    return { command: localBin, baseArgs: [] }
  }
  warnings.push('local node_modules/.bin/xpod missing; falling back to npx @undefineds.co/xpod@0.3.57')
  return { command: 'npx', baseArgs: ['-y', '@undefineds.co/xpod@0.3.57'] }
}

function runXpodJson(xpod, label, args) {
  const result = spawnSync(xpod.command, [...xpod.baseArgs, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) {
    failures.push(`${label}: ${result.error.message}`)
    return null
  }
  if (result.status !== 0) {
    failures.push(`${label}: exit ${result.status}\n${result.stderr}${result.stdout}`)
    return null
  }
  try {
    const parsed = JSON.parse(result.stdout)
    if (result.stderr.trim()) {
      warnings.push(`${label}: stderr kept separate (${result.stderr.trim().split(/\r?\n/u).length} lines)`)
    }
    return parsed
  } catch (error) {
    failures.push(`${label}: stdout is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function tailText(value, maxLines = 40) {
  const lines = String(value ?? '').trim().split(/\r?\n/u)
  return lines.slice(-maxLines).join('\n')
}
