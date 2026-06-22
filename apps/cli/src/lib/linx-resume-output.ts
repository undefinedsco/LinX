import { calculateSessionUsage, formatTokenCount } from './linx-status-line.js'
import {
  isInteractiveShellExitMessageSuppressed,
  LINX_TUI_NO_EXIT_MESSAGE_ENV,
} from './shell-lifecycle.js'
import { registerLinxInteractiveStopHandler } from './linx-interactive-stop-router.js'

let linxResumeOutputStyleRestore: (() => void) | null = null

type LinxExitMessageState = {
  initialized: boolean
  written: boolean
}

const linxExitMessageStates = new WeakMap<object, LinxExitMessageState>()

export function installLinxExitMessage(interactive: any): void {
  const state = getLinxExitMessageState(interactive)

  registerLinxInteractiveStopHandler(interactive, {
    name: 'linx-exit-message',
    phase: 'after',
    priority: 100,
    handler({ interactive: target }) {
      if (
        !state.initialized
        || state.written
        || process.env[LINX_TUI_NO_EXIT_MESSAGE_ENV] === '1'
        || isInteractiveShellExitMessageSuppressed(target)
      ) {
        return
      }
      state.written = true
      if (process.stdout.isTTY) {
        process.stdout.write(`\n${buildLinxExitMessage(target)}\n`)
      }
    },
  })
}

export function markLinxExitMessageInitialized(interactive: any): void {
  getLinxExitMessageState(interactive).initialized = true
}

function getLinxExitMessageState(interactive: any): LinxExitMessageState {
  if (!interactive || typeof interactive !== 'object') {
    return { initialized: false, written: false }
  }

  const existing = linxExitMessageStates.get(interactive)
  if (existing) {
    return existing
  }

  const state: LinxExitMessageState = { initialized: false, written: false }
  linxExitMessageStates.set(interactive, state)
  return state
}

export function buildLinxExitMessage(interactive: any): string {
  const sessionId = interactive?.session?.sessionId
    ?? interactive?.sessionManager?.getSessionId?.()
    ?? interactive?.session?.sessionManager?.getSessionId?.()
  const usage = calculateSessionUsage(interactive?.session)
  const lines = ['LinX session closed.']

  if (usage.input > 0 || usage.output > 0 || usage.cacheRead > 0 || usage.cacheWrite > 0) {
    const usageParts = [
      `input ${formatTokenCount(usage.input)}`,
      `output ${formatTokenCount(usage.output)}`,
    ]
    if (usage.cacheRead > 0 || usage.cacheWrite > 0) {
      usageParts.push(`cache ${usage.cacheRate ?? 0}%`)
    }
    lines.push(`Token usage: ${usageParts.join(' · ')}`)
  }

  if (typeof sessionId === 'string' && sessionId.trim()) {
    lines.push(`Resume: linx --session ${sessionId}`)
  }

  return lines.join('\n')
}

export function installLinxResumeOutputStyle(): () => void {
  if (linxResumeOutputStyleRestore) {
    return linxResumeOutputStyleRestore
  }

  const originalWrite = process.stdout.write
  const originalErrorWrite = process.stderr.write
  const stdoutFilter = createPiResumeOutputFilter()
  const stderrFilter = createPiResumeOutputFilter()
  const patchedStdoutWrite = function patchedPersistentLinxStdoutWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stdout, originalWrite, stdoutFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stdout.write
  const patchedStderrWrite = function patchedPersistentLinxStderrWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stderr, originalErrorWrite, stderrFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stderr.write

  process.stdout.write = patchedStdoutWrite
  process.stderr.write = patchedStderrWrite

  linxResumeOutputStyleRestore = () => {
    flushPiResumeOutputFilter(process.stdout, originalWrite, stdoutFilter)
    flushPiResumeOutputFilter(process.stderr, originalErrorWrite, stderrFilter)
    if (process.stdout.write === patchedStdoutWrite) {
      process.stdout.write = originalWrite
    }
    if (process.stderr.write === patchedStderrWrite) {
      process.stderr.write = originalErrorWrite
    }
    linxResumeOutputStyleRestore = null
  }

  return linxResumeOutputStyleRestore
}

export async function withLinxResumeOutputStyle<T>(run: () => Promise<T>): Promise<T> {
  const originalWrite = process.stdout.write
  const originalErrorWrite = process.stderr.write
  const stdoutFilter = createPiResumeOutputFilter()
  const stderrFilter = createPiResumeOutputFilter()
  process.stdout.write = function patchedLinxStdoutWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stdout, originalWrite, stdoutFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stdout.write
  process.stderr.write = function patchedLinxStderrWrite(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): boolean {
    return writeWithPiResumeFilter(process.stderr, originalErrorWrite, stderrFilter, chunk, encodingOrCallback, callback)
  } as typeof process.stderr.write

  try {
    const result = await run()
    await new Promise((resolve) => setImmediate(resolve))
    return result
  } finally {
    flushPiResumeOutputFilter(process.stdout, originalWrite, stdoutFilter)
    flushPiResumeOutputFilter(process.stderr, originalErrorWrite, stderrFilter)
    process.stdout.write = originalWrite
    process.stderr.write = originalErrorWrite
  }
}

/** @deprecated Use withLinxResumeOutputStyle. */
export const withSuppressedPiResumeOutput = withLinxResumeOutputStyle

interface PiResumeOutputFilter {
  pending: string
  suppressing: boolean
}

function createPiResumeOutputFilter(): PiResumeOutputFilter {
  return { pending: '', suppressing: false }
}

function writeWithPiResumeFilter(
  stream: NodeJS.WriteStream,
  originalWrite: typeof process.stdout.write,
  filter: PiResumeOutputFilter,
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
  callback?: (error?: Error) => void,
): boolean {
  const text = typeof chunk === 'string'
    ? chunk
    : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
      ? Buffer.from(chunk).toString('utf8')
      : ''
  if (!text) {
    return originalWrite.call(stream, chunk as never, encodingOrCallback as never, callback as never)
  }

  const output = filterPiResumeOutputText(text, filter)
  if (!output) {
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
    done?.()
    return true
  }
  if (output === text && !filter.pending) {
    return originalWrite.call(stream, chunk as never, encodingOrCallback as never, callback as never)
  }
  return originalWrite.call(stream, output, encodingOrCallback as never, callback as never)
}

function flushPiResumeOutputFilter(
  stream: NodeJS.WriteStream,
  originalWrite: typeof process.stdout.write,
  filter: PiResumeOutputFilter,
): void {
  const pending = filter.pending
  filter.pending = ''
  if (filter.suppressing) {
    filter.suppressing = false
    return
  }
  if (!pending || isPotentialPiResumeOutput(pending)) {
    return
  }
  originalWrite.call(stream, pending)
}

function filterPiResumeOutputText(text: string, filter: PiResumeOutputFilter): string {
  let input = filter.pending + text
  filter.pending = ''
  let output = ''

  while (input) {
    const newlineIndex = input.indexOf('\n')
    if (newlineIndex >= 0) {
      const line = input.slice(0, newlineIndex + 1)
      if (filter.suppressing) {
        filter.suppressing = false
      } else if (!isPiResumeOutput(line)) {
        output += line
      }
      input = input.slice(newlineIndex + 1)
      continue
    }

    if (filter.suppressing) {
      return output
    }

    if (isPiResumeOutput(input)) {
      filter.suppressing = true
      return output
    }

    if (isPotentialPiResumeOutput(input)) {
      filter.pending = input
      return output
    }

    output += input
    return output
  }

  return output
}

function isPiResumeOutput(text: string): boolean {
  if (!text) {
    return false
  }
  const plain = stripAnsi(text)
  return /To resume this session:\s*pi\s+--session(?:-dir|\s)/u.test(plain)
    || /To resume this session:\s*pi\s+/u.test(plain)
}

function isPotentialPiResumeOutput(text: string): boolean {
  const plain = stripAnsi(text).trimStart()
  if (!plain || plain.length >= 512) {
    return false
  }

  const marker = 'To resume this session:'
  if (marker.startsWith(plain)) {
    return true
  }
  if (!plain.startsWith(marker)) {
    return false
  }

  const commandPrefix = plain.slice(marker.length).trimStart()
  return !commandPrefix
    || 'pi --session-dir'.startsWith(commandPrefix)
    || 'pi --session'.startsWith(commandPrefix)
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, '')
}
