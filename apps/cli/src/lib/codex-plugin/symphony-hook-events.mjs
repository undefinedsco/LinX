#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function readStdinJson() {
  const input = readFileSync(0, 'utf-8').trim()
  if (!input) return {}
  const parsed = JSON.parse(input)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function textDigest(value) {
  if (typeof value !== 'string') return undefined
  return {
    length: value.length,
    sha256: sha256(value),
  }
}

function toolInputSummary(payload) {
  const toolName = optionalString(payload.tool_name ?? payload.toolName)
  const toolInput = safeObject(payload.tool_input ?? payload.toolInput)
  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    const command = toolInput.command
    return {
      kind: 'bash',
      commandLength: command.length,
      commandSha256: sha256(command),
    }
  }
  if (Object.keys(toolInput).length > 0) {
    return {
      kind: 'structured',
      keyCount: Object.keys(toolInput).length,
      keys: Object.keys(toolInput).sort().slice(0, 20),
    }
  }
  return undefined
}

function toolResponseSummary(payload) {
  const response = safeObject(payload.tool_response ?? payload.toolResponse)
  if (Object.keys(response).length === 0) return undefined
  return {
    exitCode: optionalNumber(response.exit_code ?? response.exitCode),
    stdout: textDigest(response.stdout),
    stderr: textDigest(response.stderr),
  }
}

function resolveEventsPath(env) {
  const explicit = optionalString(env.LINX_SYMPHONY_HOOK_EVENTS)
  return explicit ? resolve(explicit) : undefined
}

function buildEvent(payload, env = process.env, now = new Date()) {
  const eventName = optionalString(payload.hook_event_name ?? payload.hookEventName ?? payload.event) ?? 'unknown'
  const sessionId = optionalString(payload.session_id ?? payload.sessionId)
  const cwd = optionalString(payload.cwd) ?? optionalString(env.PWD)
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : undefined
  return {
    symphonyHookEvent: true,
    source: 'codex-native-hook',
    hookEventName: eventName,
    createdAt: now.toISOString(),
    ...(sessionId ? { sessionId } : {}),
    ...(cwd ? { cwd } : {}),
    ...(optionalString(payload.transcript_path ?? payload.transcriptPath) ? { transcriptPath: optionalString(payload.transcript_path ?? payload.transcriptPath) } : {}),
    ...(optionalString(payload.tool_name ?? payload.toolName) ? { toolName: optionalString(payload.tool_name ?? payload.toolName) } : {}),
    ...(optionalString(payload.tool_use_id ?? payload.toolUseId) ? { toolUseId: optionalString(payload.tool_use_id ?? payload.toolUseId) } : {}),
    ...(prompt ? { prompt: textDigest(prompt) } : {}),
    ...(toolInputSummary(payload) ? { toolInput: toolInputSummary(payload) } : {}),
    ...(toolResponseSummary(payload) ? { toolResponse: toolResponseSummary(payload) } : {}),
  }
}

function writeEvent(record, env = process.env) {
  const eventsPath = resolveEventsPath(env)
  if (!eventsPath) return { written: false, reason: 'not_configured' }
  mkdirSync(dirname(eventsPath), { recursive: true })
  appendFileSync(eventsPath, `${JSON.stringify(record)}\n`, 'utf-8')
  return { written: true, eventsPath }
}

export function recordSymphonyCodexHookEvent(payload, options = {}) {
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const record = buildEvent(payload, env, now)
  return {
    record,
    ...writeEvent(record, env),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    recordSymphonyCodexHookEvent(readStdinJson())
  } catch (error) {
    process.stderr.write(`[linx-symphony-hook] ${error instanceof Error ? error.message : String(error)}\n`)
  }
}
