import { spawn } from 'node:child_process'
import {
  detectAutoModeAuthFailure as detectSharedAutoModeAuthFailure,
  parseAutoModeClaudeAuthStatus,
  type AutoModeAuthFailure,
  type AutoModeAuthStatus,
} from '@linx/agent-runtime/auto-mode'
import type { AutoModeBackend } from './types.js'

export type AutoModeAuthPreflightResult = AutoModeAuthStatus

interface CommandCaptureResult {
  stdout: string
  stderr: string
  code: number | null
  error?: Error
}

async function runCommandCapture(command: string, args: string[]): Promise<CommandCaptureResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result: CommandCaptureResult) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      finish({ stdout, stderr, code: null, error })
    })
    child.on('exit', (code) => {
      finish({ stdout, stderr, code })
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ stdout, stderr, code: null, error: new Error(`Timed out running ${command}`) })
    }, 4000)
  })
}

export async function preflightAutoModeAuth(backend: AutoModeBackend): Promise<AutoModeAuthPreflightResult> {
  if (backend !== 'claude') {
    return { state: 'unknown' }
  }

  const result = await runCommandCapture('claude', ['auth', 'status', '--json'])
  if (result.error) {
    return { state: 'unknown' }
  }

  return parseAutoModeClaudeAuthStatus(result.stdout)
}

export function detectAutoModeAuthFailure(backend: AutoModeBackend, line: string): AutoModeAuthFailure | null {
  return detectSharedAutoModeAuthFailure(backend, line)
}

export const __internal = {
  parseClaudeAuthStatus: parseAutoModeClaudeAuthStatus,
}
