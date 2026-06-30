import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const home = process.env.HOME ?? ''
const marketplaceRoot = process.env.LINX_MARKETPLACE_ROOT
  ? process.env.LINX_MARKETPLACE_ROOT
  : existsSync(join(root, 'marketplace', 'plugins'))
    ? join(root, 'marketplace')
    : join(root, '..', 'marketplace')
const capturePluginRoot = join(marketplaceRoot, 'plugins', 'linx-capture')
const symphonyPluginRoot = join(marketplaceRoot, 'plugins', 'linx-symphony')

const files = {
  concept: join(root, 'docs/symphony-system-evolution-control-plane.md'),
  capture: join(capturePluginRoot, 'skills/capture/SKILL.md'),
  symphony: join(symphonyPluginRoot, 'skills/symphony/SKILL.md'),
}

const failures = []
const warnings = []
const passes = []

const sources = Object.fromEntries(
  Object.entries(files).map(([name, path]) => {
    if (!existsSync(path)) {
      failures.push(`${name}: missing ${path}`)
      return [name, '']
    }
    return [name, readFileSync(path, 'utf8')]
  }),
)

runSkillCreatorValidation(join(capturePluginRoot, 'skills/capture'))
runSkillCreatorValidation(join(symphonyPluginRoot, 'skills/symphony'))
runMarketplacePluginValidation(capturePluginRoot, 'capture marketplace plugin')
runMarketplacePluginValidation(symphonyPluginRoot, 'symphony marketplace plugin')
runDualRoleEvaluation()
runCodexPluginPackagingCheck()

const scenarios = [
  {
    name: 'documentation-first worker delegation',
    checks: [
      ['concept', /Documentation-First Control Surface/],
      ['concept', /Workers should execute from that record, not\s+from a raw chat transcript/],
      ['symphony', /control record before non-trivial\s+implementation delegation/],
      ['symphony', /Workers should receive a stable control record or task brief to follow/],
    ],
  },
  {
    name: 'human-friendly and AI-friendly docs',
    checks: [
      ['concept', /Human-Friendly \+ AI-Friendly Documentation Contract/],
      ['concept', /humans need a short narrative/],
      ['concept', /agents need a control record/],
      ['symphony', /readable for\s+humans/],
      ['symphony', /agents to bind work/],
    ],
  },
  {
    name: 'state axes are separated',
    checks: [
      ['concept', /System state: whether a capability\/design\/implementation is `existing`/],
      ['concept', /Work state: whether a concrete execution item is `drafting`/],
      ['concept', /Roadmap state: whether a future direction is `candidate`/],
      ['concept', /Compatibility impact: whether a change is `compatible`/],
      ['symphony', /Distinguish these axes/],
    ],
  },
  {
    name: 'state ownership boundaries are explicit',
    checks: [
      ['concept', /State Ownership Boundaries/],
      ['concept', /Secretary or the main control lane owns semantic state/],
      ['concept', /Workers own execution observations/],
      ['concept', /Runtime\/controllers own attempt state/],
      ['concept', /`Evidence` is append-only proof/],
      ['symphony', /State And Ownership/],
      ['symphony', /Every mutable state field needs a primary writer/],
      ['symphony', /Secretary or main control lane owns[\s\S]*Spec\s+state/],
      ['symphony', /Worker owns[\s\S]*Implementation Change Requests/],
      ['symphony', /Runtime\/controller owns Run lifecycle/],
      ['symphony', /Evidence is append-only proof/],
    ],
  },
  {
    name: 'agent runtime config is resource-backed and snapshotted',
    checks: [
      ['concept', /AgentRuntimeConfig is part of the managed system/],
      ['concept', /Agent root: the resource container/],
      ['concept', /Agent WebID: optional actor identity/],
      ['concept', /Runtime session snapshot: startup reads Agent meta and skill bindings/],
      ['symphony', /Agent Config And Skill Resources/],
      ['symphony', /managed resources with runtime snapshots/],
      ['symphony', /Skill content is file-backed/],
      ['symphony', /Resume should use\s+that snapshot by default/],
    ],
  },
  {
    name: 'capture and symphony document login and no-login behavior',
    checks: [
      ['capture', /Login And No-Login Behavior/],
      ['capture', /Prefer LinX when the current host is LinX/],
      ['capture', /Use the host application's normal\s+Solid\/LinX login flow/],
      ['capture', /Keep `xpod` available for Codex/],
      ['capture', /xpod auth login/],
      ['capture', /\$SOLID_HOME\/auth/],
      ['capture', /Do not ask the model to handle raw tokens/],
      ['capture', /No-login use is still valid/],
      ['capture', /local-first/],
      ['capture', /pending Pod persistence/],
      ['capture', /pending_local/],
      ['capture', /apps\/xpod\/outbox\/obj-mutations\.jsonl/],
      ['symphony', /xpod auth status --json/],
      ['symphony', /\$SOLID_HOME\/auth\/credentials\.json/],
      ['symphony', /unauthenticated/],
      ['symphony', /Login And No-Login Behavior/],
      ['symphony', /No-login use is still valid/],
      ['symphony', /portable local mode/],
      ['symphony', /not cross-device shared authority/],
    ],
  },
  {
    name: 'capture and symphony are model-discovery first',
    checks: [
      ['concept', /Discover current resource types and descriptors through the Pod\/model tool/],
      ['capture', /xpod obj schemas --json/],
      ['capture', /xpod obj describe <schema-or-alias> --json/],
      ['capture', /xpod obj upsert --schema <schema-or-alias> --from - --dry-run --json/],
      ['capture', /send JSONL: one JSON object per line/],
      ['capture', /CaptureDraft/],
      ['capture', /ModelingProposal/],
      ['capture', /Do not assume `Idea`/],
      ['symphony', /xpod obj schemas --domain symphony --json/],
      ['symphony', /xpod obj describe <schema-or-alias> --json/],
      ['symphony', /xpod obj upsert --schema <schema-or-alias> --from - --dry-run --json/],
      ['symphony', /send JSONL: one JSON object per line/],
      ['symphony', /Do not store fixed field definitions, path templates, or predicate lists/],
    ],
  },
  {
    name: 'ai can decide when sufficient and escalates only when necessary',
    checks: [
      ['concept', /Decision Sufficiency And Escalation Necessity/],
      ['concept', /Most decisions should be handled by the AI role that owns the\s+relevant state/],
      ['concept', /Proceeding is sufficient when the decision stays inside the current control\s+boundary/],
      ['concept', /Escalation is necessary only when the missing information belongs to another\s+owner/],
      ['concept', /asks the user only for user-owned intent/],
      ['symphony', /Sufficiency And Escalation/],
      ['symphony', /Default to AI judgment inside the current control boundary/],
      ['symphony', /It is sufficient to\s+proceed without asking when/],
      ['symphony', /Escalation is necessary only when missing information belongs to another owner/],
      ['symphony', /Do not ask the user to decide ordinary implementation details/],
    ],
  },
  {
    name: 'breaking change is compatibility impact, not status',
    checks: [
      ['concept', /Compatibility impact is not a status/],
      ['concept', /For breaking updates, Symphony should record the compatibility impact/],
      ['symphony', /compatibility impact: compatible, behavior_change, breaking/],
      ['symphony', /Do not treat breaking changes as ordinary status changes/],
    ],
  },
  {
    name: 'new requirement diffs active work before steering',
    checks: [
      ['concept', /compare the message with the\s+active record/],
      ['concept', /Steering is the main place where "documentation-first" matters/],
      ['concept', /A steering\s+message is not a side-channel instruction to workers/],
      ['concept', /workers may already have read an earlier version of the\s+record/],
      ['concept', /The delta tells the worker where to look and what changed/],
      ['concept', /must force a reread of the affected sections/],
      ['symphony', /diff it against the active\s+record first/],
      ['symphony', /Steering does not bypass the control record/],
      ['symphony', /deliver the resulting\s+delta to workers as a bounded steer/],
      ['symphony', /Steering deltas are navigation, not authority/],
      ['symphony', /reread the\s+affected authoritative sections before continuing/],
      ['symphony', /steer or restart work when it changes the intended\s+outcome/],
      ['symphony', /duplicate of existing work: link it and avoid dispatching a second task/],
      ['symphony', /Do not steer active workers through unrecorded chat context/],
    ],
  },
  {
    name: 'release plan controls scope grain',
    checks: [
      ['concept', /`ReleasePlan` records a rolling publish boundary/],
      ['concept', /Release Plan Control/],
      ['concept', /manage release boundary, not human work-hour capacity/],
      ['concept', /whether to keep going or publish the verified\s+part now/],
      ['concept', /how much work remains/],
      ['concept', /completed part already solves\s+something urgent or valuable/],
      ['symphony', /ReleasePlan is a rolling publish boundary/],
      ['symphony', /does not\s+manage AI work by human-style time boxes or work-hour estimates/],
      ['symphony', /whether to keep working or close and publish the\s+verified part now/],
      ['symphony', /how much more work remains/],
      ['symphony', /completed work already satisfies an urgent\s+coherent need/],
    ],
  },
  {
    name: 'ordinary chat is not automatically an issue',
    checks: [
      ['concept', /treat every chat message as an issue/],
      ['symphony', /ordinary_message.*do not create an Issue/s],
      ['symphony', /Do not treat every Symphony-mode chat message as an Issue/],
    ],
  },
  {
    name: 'worker task gets bounded control-record context',
    checks: [
      ['symphony', /control record or task brief to follow/],
      ['symphony', /stable control record or task brief to follow/],
      ['symphony', /not raw\s+conversation as scope/],
      ['symphony', /workspace\/resource boundaries/],
    ],
  },
  {
    name: 'worker roles are future contact-backed runtime capability',
    checks: [
      ['concept', /Worker Role TODO/],
      ['concept', /Initial Symphony should not require fixed worker roles/],
      ['concept', /selected from contacts or created as AI contacts/],
      ['concept', /bind to Work, not create a new\s+product semantic object/],
      ['symphony', /Do not require fixed worker roles at the start/],
      ['symphony', /one bounded owner for one\s+coherent Work item/],
      ['symphony', /Role-based worker dispatch is a future LinX\s+runtime capability/],
      ['symphony', /selected from contacts or created as AI contacts/],
      ['symphony', /bind to Work rather\s+than splitting Spec by themselves/],
    ],
  },
  {
    name: 'completion requires evidence and status feedback',
    checks: [
      ['concept', /Completion is not a worker saying "done"/],
      ['symphony', /Accepted work must\s+update the relevant control record status and evidence/],
      ['symphony', /future workers do not\s+need to reconstruct truth from transcript/],
      ['symphony', /which control record changed and its new status/],
    ],
  },
  {
    name: 'symphony quality metrics and reporting chain are defined',
    checks: [
      ['concept', /Quality Metrics And Reporting/],
      ['concept', /outcome quality/],
      ['concept', /diagnostic signal/],
      ['concept', /accepted_delivery_rate/],
      ['concept', /steering_success_rate/],
      ['concept', /Reporting Chain/],
      ['concept', /Audit.*RunStep.*Evidence.*Reports/s],
      ['concept', /Do not start with a separate telemetry schema/],
      ['concept', /Metric events should be small and pointer-based/],
      ['concept', /should not duplicate raw prompts, full transcripts,\s+secret values/],
      ['symphony', /Measurement/],
      ['symphony', /Record observable events that let later agents judge whether Symphony worked/],
      ['symphony', /must point to control records, runs, deliveries, and evidence/],
      ['symphony', /do not duplicate\s+raw transcripts, prompts, secrets/],
    ],
  },
  {
    name: 'symphony slash is not objective text',
    checks: [
      ['symphony', /does not implement product `\/symphony`/],
      ['symphony', /`\/symphony` is only a control switch/],
      ['symphony', /Do not treat `\/symphony` slash arguments as an objective/],
    ],
  },
  {
    name: 'workers maintain execution-facing docs but escalate semantic changes',
    checks: [
      ['symphony', /Workers keep execution-facing documentation current/],
      ['symphony', /They may\s+update progress/],
      ['symphony', /They must not silently update product semantics/],
      ['symphony', /Implementation Change Request/],
      ['symphony', /Secretary\/control\s+lane/],
    ],
  },
  {
    name: 'workers recheck feasibility and return change requests',
    checks: [
      ['concept', /Worker Feasibility Recheck/],
      ['concept', /bad upstream judgment/],
      ['concept', /Implementation Change\s+Request/],
      ['concept', /smallest coherent verified increment/],
      ['symphony', /Worker Protocol/],
      ['symphony', /upstream judgment was\s+wrong/],
      ['symphony', /must not silently downgrade acceptance/],
      ['symphony', /Implementation Change\s+Request/],
      ['symphony', /smallest coherent verified increment/],
    ],
  },
  {
    name: 'runtime profiles keep core portable and LinX Pod-backed',
    checks: [
      ['symphony', /Portable runtimes such as Codex or Claude Code/],
      ['symphony', /local Markdown\/JSON control\s+records plus available tools/],
      ['symphony', /LinX runtime writes its own control records to modeled Pod\/RDF resources/],
      ['symphony', /Reserve sync\/projection\s+language for external\/backend\/runtime facts/],
      ['concept', /LinX does not need these Pod\/xpod control-plane operations for the portable\s+skill path/],
      ['concept', /Declarative Runtime TODO/],
    ],
  },
  {
    name: 'linx control plane operations TODO is tracked',
    checks: [
      ['concept', /Secretary\/control-lane API for creating, splitting, closing, and\s+projecting control records is future product work/],
      ['concept', /create\/update\/split\/supersede Spec/],
      ['concept', /Define the Secretary\/control-lane API for LinX control-plane operations/],
      ['concept', /Define the exact shared model\/repository for Agent container meta/],
    ],
  },
  {
    name: 'single symphony skill entry point',
    checks: [
      ['symphony', /This skill is the single Symphony skill/],
      ['symphony', /portable control-plane\s+semantics/],
    ],
  },
]

for (const scenario of scenarios) {
  for (const [sourceName, pattern] of scenario.checks) {
    assertPattern(sourceName, pattern, scenario.name)
  }
  passes.push(`scenario: ${scenario.name}`)
}

runCodexPromptDiscovery()

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

console.log(`symphony skill verification ok (${scenarios.length} scenarios)`)

function assertPattern(sourceName, pattern, scenarioName) {
  const source = sources[sourceName] ?? ''
  if (typeof pattern === 'function') {
    if (!pattern(source)) {
      failures.push(`${scenarioName}: ${sourceName} failed custom check`)
    }
    return
  }
  if (!pattern.test(source)) {
    failures.push(`${scenarioName}: ${sourceName} missing ${pattern}`)
  }
}

function runSkillCreatorValidation(skillDir) {
  const validator = join(home, '.codex/skills/.system/skill-creator/scripts/quick_validate.py')
  if (!existsSync(validator)) {
    warnings.push(`skill-creator validator missing: ${validator}`)
    return
  }

  const result = spawnSync('python3', [validator, skillDir], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.status !== 0) {
    failures.push(`${skillDir}: quick_validate failed\n${result.stdout}${result.stderr}`)
    return
  }
  passes.push(`${skillDir}: quick_validate`)
}

function runMarketplacePluginValidation(pluginRoot, label) {
  const validator = join(home, '.codex/skills/.system/plugin-creator/scripts/validate_plugin.py')
  if (!existsSync(validator)) {
    warnings.push(`plugin validator missing: ${validator}`)
    return
  }
  const result = spawnSync('python3', [validator, pluginRoot], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.status !== 0) {
    failures.push(`${label}: plugin validation failed\n${result.stdout}${result.stderr}`)
    return
  }
  passes.push(`${label}: plugin validation`)
}

function runCodexPromptDiscovery() {
  const result = spawnSync('codex', [
    'debug',
    'prompt-input',
    '$symphony verify that documentation-first breaking-change control records are discoverable',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  })

  if (result.error?.code === 'ENOENT') {
    warnings.push('codex executable not found; skipped prompt discovery')
    return
  }
  if (result.status !== 0) {
    warnings.push(`codex prompt discovery failed; skipped runtime discovery\n${result.stderr}`)
    return
  }

  const output = `${result.stdout}\n${result.stderr}`
  if (!/- symphony: .*control-plane skill/.test(output)) {
    warnings.push('codex prompt discovery did not expose the symphony skill metadata from the current repo; marketplace plugin packaging is the authoritative check')
    return
  }
  if (output.includes('- symphony-orchestration:')) {
    failures.push('codex prompt discovery still exposes deprecated symphony-orchestration metadata')
  }
  passes.push('codex prompt discovery exposes the single symphony skill')
}

function runDualRoleEvaluation() {
  const result = spawnSync('node', ['scripts/pack-symphony-dual-role-fixtures.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  })

  if (result.status !== 0) {
    failures.push(`symphony dual-role evaluation failed\n${result.stdout}${result.stderr}`)
    return
  }

  passes.push('symphony dual-role evaluation')
}

function runCodexPluginPackagingCheck() {
  const targetRoot = mkdtempSync(join(tmpdir(), 'linx-symphony-plugin-verify-'))
  try {
    const result = spawnSync('node', [
      'apps/cli/scripts/pack-symphony-codex-plugin.mjs',
      '--target-root',
      targetRoot,
      '--check',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })

    if (result.status !== 0) {
      failures.push(`symphony Codex plugin packaging failed\n${result.stdout}${result.stderr}`)
      return
    }
    const pluginRoot = result.stdout.trim().split(/\r?\n/).at(-1)
    runCodexPluginManifestValidation(pluginRoot)
    verifyCodexPluginHookPackage(pluginRoot)
    passes.push('symphony Codex plugin packaging')
  } finally {
    rmSync(targetRoot, { recursive: true, force: true })
  }
}

function runCodexPluginManifestValidation(pluginRoot) {
  const validator = join(home, '.codex/skills/.system/plugin-creator/scripts/validate_plugin.py')
  if (!existsSync(validator)) {
    warnings.push(`plugin validator missing: ${validator}`)
    return
  }
  if (!pluginRoot) {
    failures.push('symphony Codex plugin packaging did not report a plugin root')
    return
  }
  const result = spawnSync('python3', [validator, pluginRoot], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.status !== 0) {
    failures.push(`symphony Codex plugin manifest validation failed\n${result.stdout}${result.stderr}`)
    return
  }
  passes.push('symphony Codex plugin manifest validation')
}

function verifyCodexPluginHookPackage(pluginRoot) {
  if (!pluginRoot) {
    failures.push('symphony Codex plugin packaging did not report a plugin root for hook verification')
    return
  }
  const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json')
  const hooksPath = join(pluginRoot, 'hooks.json')
  const hookScriptPath = join(pluginRoot, 'scripts', 'symphony-hook-events.mjs')
  if (!existsSync(hooksPath)) {
    failures.push('symphony Codex plugin package is missing root hooks.json')
    return
  }
  if (!existsSync(hookScriptPath)) {
    failures.push('symphony Codex plugin package is missing scripts/symphony-hook-events.mjs')
    return
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if ('hooks' in manifest) {
    failures.push('symphony Codex plugin manifest must not include unsupported hooks field')
  }
  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'))
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
    const command = hooks.hooks?.[eventName]?.[0]?.hooks?.[0]?.command
    if (command !== 'node ./scripts/symphony-hook-events.mjs') {
      failures.push(`symphony Codex plugin hooks.json missing recorder for ${eventName}`)
    }
  }
  passes.push('symphony Codex plugin hook package')
}
