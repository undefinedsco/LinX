import { spawn } from 'node:child_process'
import {
  detectWatchAuthFailure as detectSharedWatchAuthFailure,
  parseWatchClaudeAuthStatus,
  type WatchAuthFailure,
  type WatchAuthStatus,
} from '@linx/models/watch'
import type { WatchBackend } from './types.js'

export type WatchAuthPreflightResult = WatchAuthStatus

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

export async function preflightWatchAuth(backend: WatchBackend): Promise<WatchAuthPreflightResult> {
  if (backend !== 'claude') {
    return { state: 'unknown' }
  }

  const result = await runCommandCapture('claude', ['auth', 'status', '--json'])
  if (result.error) {
    return { state: 'unknown' }
  }

  return parseWatchClaudeAuthStatus(result.stdout)
}

export function detectWatchAuthFailure(backend: WatchBackend, line: string): WatchAuthFailure | null {
  return detectSharedWatchAuthFailure(backend, line)
}

export const __internal = {
  parseClaudeAuthStatus: parseWatchClaudeAuthStatus,
}
