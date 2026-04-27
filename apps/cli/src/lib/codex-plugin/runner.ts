import { createInterface } from 'node:readline'
import {
  createCodexAttachBridge,
  createCodexAttachSessionRecord,
  type CodexAttachBridge,
  type CodexAttachBridgeRuntime,
} from './bridge.js'
import type { WatchSessionRecord } from '../watch/types.js'

interface WritableLike {
  write(chunk: string): unknown
}

export interface CodexAttachRunnerOptions {
  backendSessionId: string
  workspacePath?: string
  cwd?: string
  model?: string
  prompt?: string
  input?: NodeJS.ReadableStream
  output?: WritableLike
  log?: WritableLike
  runtime?: CodexAttachBridgeRuntime
}

export interface CodexAttachRunner {
  readonly record: WatchSessionRecord
  readonly bridge: CodexAttachBridge
  run(): Promise<number>
  handleLine(line: string): Promise<void>
}

export function createCodexAttachRunner(options: CodexAttachRunnerOptions): CodexAttachRunner {
  const record = createCodexAttachSessionRecord({
    workspacePath: options.workspacePath,
    cwd: options.cwd,
    backendSessionId: options.backendSessionId,
    model: options.model,
    prompt: options.prompt,
  })
  const bridge = createCodexAttachBridge(record, options.runtime)
  const output = options.output ?? process.stdout
  const log = options.log ?? process.stderr
  const input = options.input ?? process.stdin

  async function handleLine(line: string): Promise<void> {
    const responses = await bridge.handleCodexRpcLine(line)
    for (const response of responses) {
      output.write(`${JSON.stringify(response)}\n`)
    }
  }

  return {
    record,
    bridge,
    async run(): Promise<number> {
      log.write(
        `[linx] background codex attach active: codex=${options.backendSessionId} linx=${record.id} backend=xpod\n`,
      )

      const rl = createInterface({
        input,
        crlfDelay: Infinity,
      })

      for await (const line of rl) {
        await handleLine(line)
      }

      return 0
    },
    handleLine,
  }
}
