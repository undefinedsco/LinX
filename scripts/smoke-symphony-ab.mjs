#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const autoModeEntry = join(repoRoot, 'apps/cli/dist/lib/auto-mode/index.js')
const symphonyEntry = join(repoRoot, 'apps/cli/dist/lib/symphony-command.js')

function usage() {
  return [
    'Usage: node scripts/smoke-symphony-ab.mjs [options] [objective...]',
    '',
    'Runs the same objective through:',
    '  1. solo worker: codex + gpt-5.5',
    '  2. Symphony: gpt-5.5 Secretary + claude/cc worker + opus alias routed by local Claude Code config',
    '',
    'Options:',
    '  --objective <text>       Objective to send to both paths',
    '  --cwd <path>             Workspace for both paths (default: current directory)',
    '  --solo-cwd <path>        Workspace for solo path',
    '  --symphony-cwd <path>    Workspace for Symphony path',
    '  --solo-backend <id>      Solo backend (default: codex)',
    '  --worker-backend <id>    Symphony worker backend (default: claude/cc)',
    '  --backend <id>           Alias for --worker-backend',
    '  --solo-model <id>        Solo model (default: gpt-5.5)',
    '  --secretary-model <id>   Secretary model (default: gpt-5.5)',
    '  --worker-model <id>      Symphony worker model (default: opus for claude/cc)',
    '  --credential-source <id> Shared credential source: local|cloud',
    '  --solo-credential-source <id>   Credential source for solo path',
    '  --worker-credential-source <id> Credential source for Symphony worker path',
    '  --test-command <cmd>     Optional command to run after each path',
    '  --out <path>             JSON report path',
    '  --real                   Use real backend/runtime instead of fake smoke runtime',
    '  --api-key <key>          Inject backend credential env for this smoke run',
    '  --base-url <url>         Inject backend base URL env for this smoke run',
    '  --command <path>         Explicit ACP command override',
    '  --cleanup                Remove the temporary archive directory before exit',
    '  --help                   Show this help',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    soloBackend: 'codex',
    workerBackend: 'claude',
    fake: true,
    cwd: process.cwd(),
    soloModel: 'gpt-5.5',
    secretaryModel: 'gpt-5.5',
    workerModel: 'opus',
    cleanup: false,
  }
  const positionals = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value`)
      }
      return argv[index]
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--real') {
      options.fake = false
      continue
    }
    if (arg === '--fake') {
      options.fake = true
      continue
    }
    if (arg === '--cleanup') {
      options.cleanup = true
      continue
    }
    if (arg === '--objective') options.objective = next()
    else if (arg === '--cwd') options.cwd = next()
    else if (arg === '--solo-cwd') options.soloCwd = next()
    else if (arg === '--symphony-cwd') options.symphonyCwd = next()
    else if (arg === '--backend') options.workerBackend = next()
    else if (arg === '--solo-backend') options.soloBackend = next()
    else if (arg === '--worker-backend') options.workerBackend = next()
    else if (arg === '--solo-model') options.soloModel = next()
    else if (arg === '--secretary-model') options.secretaryModel = next()
    else if (arg === '--worker-model') options.workerModel = next()
    else if (arg === '--credential-source') options.credentialSource = next()
    else if (arg === '--solo-credential-source') options.soloCredentialSource = next()
    else if (arg === '--worker-credential-source') options.workerCredentialSource = next()
    else if (arg === '--test-command') options.testCommand = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--api-key') options.apiKey = next()
    else if (arg === '--base-url') options.baseUrl = next()
    else if (arg === '--command') options.command = next()
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    else positionals.push(arg)
  }

  options.objective = (options.objective ?? positionals.join(' ')).trim()
    || 'Reply with exactly linx-symphony-ab-ok and no extra text.'
  options.cwd = resolve(options.cwd)
  options.soloCwd = resolve(options.soloCwd ?? options.cwd)
  options.symphonyCwd = resolve(options.symphonyCwd ?? options.cwd)
  return options
}

function assertBuilt() {
  const missing = [autoModeEntry, symphonyEntry].filter((entry) => !existsSync(entry))
  if (missing.length > 0) {
    throw new Error([
      'CLI dist is not built.',
      'Run `yarn build:models && yarn build:agent-runtime && yarn build:cli`, then retry.',
      `Missing: ${missing.join(', ')}`,
    ].join('\n'))
  }
}

function isNonCodexModel(model) {
  return /(?:deepseek|claude|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model ?? '')
}

function normalizeCredentialSource(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized === 'local' || normalized === 'cloud') return normalized
  if (normalized) throw new Error(`Invalid credential source ${value}; expected local or cloud.`)
  return undefined
}

function defaultCredentialSource(options, backend) {
  if (backend === 'linx') return 'cloud'
  if (options.fake || options.apiKey || options.baseUrl) return 'cloud'
  return 'local'
}

function credentialSourceForRun(options, backend, specific) {
  return normalizeCredentialSource(specific)
    ?? normalizeCredentialSource(options.credentialSource)
    ?? defaultCredentialSource(options, backend)
}

function writeExecutable(path, source) {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function fakeAcpCommandName(backend) {
  if (backend === 'codex') return 'codex-acp'
  if (backend === 'claude') return 'claude-code-acp'
  return null
}

function writeFakeAcp(path, backend) {
  const credentialKeys = backend === 'claude'
    ? ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL']
    : backend === 'codex'
      ? ['CODEX_API_KEY', 'CODEX_BASE_URL']
      : []
  writeExecutable(path, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const runKind = process.env.LINX_SMOKE_RUN_KIND || 'unknown'
const sessionId = 'sess_' + runKind + '_' + Date.now()
const credentialKeys = ${JSON.stringify(credentialKeys)}
appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  kind: 'start',
  backend: ${JSON.stringify(backend)},
  runKind,
  argv: process.argv.slice(2),
  env: Object.fromEntries(credentialKeys.map((key) => [key, process.env[key] || null])),
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId } })
    return
  }
  if (message.method === 'session/set_model') {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
      kind: 'set_model',
      backend: ${JSON.stringify(backend)},
      runKind,
      modelId: message.params && message.params.modelId,
      sessionId: message.params && message.params.sessionId,
    }) + '\\n')
    write({ jsonrpc: '2.0', id: message.id, result: {} })
    return
  }
  if (message.method === 'session/prompt') {
    const prompt = message.params && Array.isArray(message.params.prompt)
      ? message.params.prompt.map((part) => part && part.text ? part.text : '').join('\\n')
      : ''
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({ kind: 'prompt', runKind, prompt }) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'usage_update',
          used: runKind === 'symphony' ? 180 : 120,
          size: 1000000,
        },
      },
    })
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: runKind + ' fake worker completed' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)
}

function installFakeLinxRuntime(autoModeModule, logFile) {
  const calls = []
  autoModeModule.autoModeRuntime.createPodDataSession = async () => ({
    webId: 'https://id.undefineds.co/smoke/profile/card#me',
    podUrl: 'https://id.undefineds.co/smoke/',
    credentials: {
      url: 'https://id.undefineds.co/',
    },
    runtimeFetch: async () => new Response('{}'),
    async close() {},
  })
  autoModeModule.autoModeRuntime.createRemoteCompletionResult = async (request) => {
    const prompt = request.messages?.map((message) => message.content ?? '').join('\n') ?? ''
    const runKind = prompt.startsWith('# LinX Symphony Task') ? 'symphony' : 'solo'
    calls.push({
      kind: 'linx-completion',
      runKind,
      model: request.model,
      runtimeUrl: request.runtimeUrl,
      prompt,
    })
    writeFileSync(logFile, `${calls.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
    return {
      content: `${runKind} fake linx worker completed`,
      reasoningContent: `fake ${runKind} reasoning`,
      toolCalls: [],
      finishReason: 'stop',
      usage: {
        input: runKind === 'symphony' ? 150 : 100,
        output: 30,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: runKind === 'symphony' ? 180 : 130,
      },
    }
  }
}

function backendCredentialEnv(options, backend) {
  const apiKey = options.apiKey ?? 'sk-linx-symphony-ab-smoke'
  const baseUrl = options.baseUrl ?? 'https://example.invalid/v1'

  if (backend === 'codex') {
    return {
      CODEX_API_KEY: apiKey,
      CODEX_BASE_URL: baseUrl,
    }
  }
  if (backend === 'claude') {
    return {
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
    }
  }
  if (backend === 'codebuddy') {
    return {
      CODEBUDDY_API_KEY: apiKey,
      CODEBUDDY_BASE_URL: baseUrl,
    }
  }
  return {}
}

function resolveCreatedSession(beforeIds, listAutoModeSessions) {
  return listAutoModeSessions()
    .filter((record) => !beforeIds.has(record.id))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function extractUsage(events) {
  let latest = null
  for (const entry of events) {
    const raw = parseJsonLine(entry.line)
    const update = raw?.params?.update
    if (update?.sessionUpdate === 'usage_update') {
      latest = {
        used: typeof update.used === 'number' ? update.used : undefined,
        size: typeof update.size === 'number' ? update.size : undefined,
      }
      continue
    }
    if (raw?.usage && typeof raw.usage === 'object') {
      latest = raw.usage
    }
  }
  return latest
}

function summarizeSession(record, loadAutoModeEvents) {
  if (!record) {
    return null
  }
  const events = loadAutoModeEvents(record.id)
  const assistantText = []
  let promptCount = 0
  for (const entry of events) {
    for (const event of entry.events ?? []) {
      if (event.type === 'assistant.delta' && typeof event.text === 'string') {
        assistantText.push(event.text)
      }
    }
    const raw = parseJsonLine(entry.line)
    if (raw?.type === 'user.turn') {
      promptCount += 1
    }
  }
  return {
    id: record.id,
    backendSessionId: record.backendSessionId,
    status: record.status,
    model: record.model,
    exitCode: record.exitCode,
    goalMode: record.goalMode === true,
    promptCount,
    usage: extractUsage(events),
    assistantText: assistantText.join(''),
  }
}

function runOptionalTest(command, cwd) {
  if (!command) {
    return undefined
  }
  const started = Date.now()
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf-8',
    timeout: 120000,
  })
  return {
    command,
    cwd,
    exitCode: result.status ?? 1,
    elapsedMs: Date.now() - started,
    stdoutTail: (result.stdout ?? '').slice(-4000),
    stderrTail: (result.stderr ?? '').slice(-4000),
  }
}

function readJsonl(path) {
  if (!existsSync(path)) {
    return []
  }
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => parseJsonLine(line))
    .filter(Boolean)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (options.workerBackend === 'codex' && isNonCodexModel(options.workerModel)) {
    throw new Error(`codex backend cannot run worker model ${options.workerModel}. Use --worker-backend claude or --worker-backend linx for provider-routed models.`)
  }
  if (options.soloBackend === 'codex' && isNonCodexModel(options.soloModel)) {
    throw new Error(`codex backend cannot run solo model ${options.soloModel}. Use --solo-backend claude or --solo-backend linx for provider-routed models.`)
  }
  const fakeBackends = new Set(['codex', 'claude', 'linx'])
  if (options.fake && (!fakeBackends.has(options.soloBackend) || !fakeBackends.has(options.workerBackend))) {
    throw new Error('Fake smoke currently supports codex, claude, or linx backends only.')
  }
  assertBuilt()

  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-ab-'))
  const binDir = join(root, 'bin')
  const linxHome = join(root, 'linx-home')
  const archiveHome = join(linxHome, 'auto-mode')
  const fakeAcpLog = join(root, 'fake-acp.jsonl')
  mkdirSync(binDir, { recursive: true })

  const fakeCommandPaths = new Map()
  for (const backend of new Set([options.soloBackend, options.workerBackend])) {
    const commandName = options.fake ? fakeAcpCommandName(backend) : null
    if (!commandName) {
      continue
    }
    const commandPath = join(binDir, commandName)
    fakeCommandPaths.set(backend, commandPath)
    writeFakeAcp(commandPath, backend)
  }
  const soloCommandOverride = fakeCommandPaths.get(options.soloBackend)
    ?? (options.command ? resolve(options.command) : undefined)
  const workerCommandOverride = fakeCommandPaths.get(options.workerBackend)
    ?? (options.command ? resolve(options.command) : undefined)

  const previousHome = process.env.HOME
  const previousLinxHome = process.env.LINX_HOME
  const previousFakeLog = process.env.FAKE_ACP_LOG
  process.env.HOME = root
  process.env.LINX_HOME = linxHome
  process.env.FAKE_ACP_LOG = fakeAcpLog

  try {
    const autoModeModule = await import(pathToFileURL(autoModeEntry).href)
    const symphonyModule = await import(pathToFileURL(symphonyEntry).href)

    if (options.fake && (options.soloBackend === 'linx' || options.workerBackend === 'linx')) {
      installFakeLinxRuntime(autoModeModule, fakeAcpLog)
    }
    if (options.fake || options.apiKey || options.baseUrl) {
      autoModeModule.autoModeRuntime.loadPodBackendCredential = async (backend) => ({
        backend,
        provider: options.fake ? 'smoke' : 'explicit',
        env: backendCredentialEnv(options, backend),
      })
    }
    autoModeModule.autoModeRuntime.persistAutoModeConversationToPod = async () => true
    autoModeModule.autoModeRuntime.promptText = async () => '/exit'

    const report = {
      kind: 'linx-symphony-ab-smoke',
      fake: options.fake,
      objective: options.objective,
      backend: options.workerBackend,
      backends: {
        solo: options.soloBackend,
        worker: options.workerBackend,
      },
      models: {
        solo: options.soloModel,
        secretary: options.secretaryModel,
        worker: options.workerModel,
      },
      credentialSources: {
        solo: credentialSourceForRun(options, options.soloBackend, options.soloCredentialSource),
        worker: credentialSourceForRun(options, options.workerBackend, options.workerCredentialSource),
      },
      archiveHome,
      fakeAcpLog: options.fake ? fakeAcpLog : undefined,
      workspaces: {
        solo: options.soloCwd,
        symphony: options.symphonyCwd,
      },
      runs: {},
    }

    const soloBefore = new Set(autoModeModule.listArchivedAutoModeSessions().map((record) => record.id))
    const soloStarted = Date.now()
    const soloExitCode = await autoModeModule.runAutoMode({
      backend: options.soloBackend,
      autoEnabled: false,
      mode: 'off',
      cwd: options.soloCwd,
      plain: true,
      quiet: true,
      model: options.soloModel,
      credentialSource: credentialSourceForRun(options, options.soloBackend, options.soloCredentialSource),
      prompt: options.objective,
      goalMode: true,
      passthroughArgs: [],
      ...(soloCommandOverride ? { commandOverride: soloCommandOverride } : {}),
      commandEnv: {
        LINX_SMOKE_RUN_KIND: 'solo',
      },
    })
    const soloRecord = resolveCreatedSession(soloBefore, autoModeModule.listArchivedAutoModeSessions)
    report.runs.solo = {
      exitCode: soloExitCode,
      elapsedMs: Date.now() - soloStarted,
      session: summarizeSession(soloRecord, autoModeModule.loadArchivedAutoModeEvents),
      test: runOptionalTest(options.testCommand, options.soloCwd),
    }

    const symphonyBefore = new Set(autoModeModule.listArchivedAutoModeSessions().map((record) => record.id))
    const symphonyStarted = Date.now()
    const symphonyPlan = await symphonyModule.runSymphony({
      objective: [options.objective],
      backend: options.workerBackend,
      auto: true,
      cwd: options.symphonyCwd,
      plain: true,
      print: false,
      quietProjectionErrors: true,
      quietWorkers: true,
      credentialSource: credentialSourceForRun(options, options.workerBackend, options.workerCredentialSource),
      secretaryModel: options.secretaryModel,
      workerModel: options.workerModel,
      workerGoalMode: true,
      workerSupervisorIntervalMs: 600000,
      ...(workerCommandOverride ? { commandOverride: workerCommandOverride } : {}),
      commandEnv: {
        LINX_SMOKE_RUN_KIND: 'symphony',
      },
      acceptance: [
        'Worker receives the same objective',
        'Secretary and worker models are recorded separately',
        'Run report contains session evidence',
      ],
    }, {
      runAutoMode: autoModeModule.runAutoMode,
      listAutoModeSessions: autoModeModule.listArchivedAutoModeSessions,
    })
    const symphonyRecord = symphonyPlan.session.autoModeSessionId
      ? autoModeModule.loadArchivedAutoModeSession(symphonyPlan.session.autoModeSessionId)
      : resolveCreatedSession(symphonyBefore, autoModeModule.listArchivedAutoModeSessions)
    report.runs.symphony = {
      exitCode: symphonyPlan.session.exitCode ?? null,
      elapsedMs: Date.now() - symphonyStarted,
      issue: {
        uri: symphonyPlan.issue.uri,
        status: symphonyPlan.issue.status,
      },
      task: symphonyPlan.task,
      delivery: {
        uri: symphonyPlan.delivery.uri,
        status: symphonyPlan.delivery.status,
        autoModeSessionId: symphonyPlan.delivery.autoModeSessionId,
      },
      session: summarizeSession(symphonyRecord, autoModeModule.loadArchivedAutoModeEvents),
      workerSession: {
        backend: symphonyPlan.session.backend,
        model: symphonyPlan.session.model,
        supervisor: symphonyPlan.session.supervisor,
        status: symphonyPlan.session.status,
      },
      test: runOptionalTest(options.testCommand, options.symphonyCwd),
    }

    const fakeAcpEvents = options.fake ? readJsonl(fakeAcpLog) : []
    const symphonyWorkerSetModel = fakeAcpEvents.find((entry) => (
      entry.kind === 'set_model'
      && entry.runKind === 'symphony'
      && entry.backend === options.workerBackend
    ))
    report.runs.symphony.acp = {
      setModel: symphonyWorkerSetModel
        ? {
          modelId: symphonyWorkerSetModel.modelId,
          sessionId: symphonyWorkerSetModel.sessionId,
        }
        : null,
    }

    report.comparison = {
      soloPassed: report.runs.solo.exitCode === 0 && (!report.runs.solo.test || report.runs.solo.test.exitCode === 0),
      symphonyPassed: report.runs.symphony.exitCode === 0 && (!report.runs.symphony.test || report.runs.symphony.test.exitCode === 0),
      sameObjective: true,
      workerModelSetByAcp: options.fake && options.workerBackend === 'claude'
        ? symphonyWorkerSetModel?.modelId === options.workerModel
        : undefined,
    }

    const outputPath = resolve(options.out ?? join(root, 'report.json'))
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (options.cleanup && !options.out) {
      process.stdout.write('Report file is inside the temporary archive and will be removed by --cleanup.\n')
    } else {
      process.stdout.write(`Report: ${outputPath}\n`)
    }

    if (options.cleanup) {
      rmSync(root, { recursive: true, force: true })
    }
    if (report.comparison.workerModelSetByAcp === false) {
      throw new Error(`Symphony worker model ${options.workerModel} was not set through ACP session/set_model.`)
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousLinxHome === undefined) delete process.env.LINX_HOME
    else process.env.LINX_HOME = previousLinxHome
    if (previousFakeLog === undefined) delete process.env.FAKE_ACP_LOG
    else process.env.FAKE_ACP_LOG = previousFakeLog
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
