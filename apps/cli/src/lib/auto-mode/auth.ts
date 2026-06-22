import { spawn } from 'node:child_process'
import {
  detectAutoModeAuthFailure as detectSharedAutoModeAuthFailure,
  parseAutoModeClaudeAuthStatus,
  type AutoModeBackend,
  type AutoModeAuthFailure,
  type AutoModeAuthStatus,
} from '@linx/agent-runtime/auto-mode'
import type { AutoModeWorkerBackend } from './types.js'
import type { AutoModeDisplay } from './display.js'
import { runLinxLoginCommand as defaultRunLinxLoginCommand, runLinxLogoutCommand as defaultRunLinxLogoutCommand } from '../login-command.js'
import { promptText } from '../prompt.js'
import { clearDefaultPodDataSession, createPodDataSession } from '../pod-data-session.js'
import { saveAccountSession } from '../account-session.js'
import { clearCredentials, loadCredentials, saveCredentials } from '../credentials-store.js'
import { resolveAccountBaseUrl } from '../account-api.js'
import { parseSolidClientCredentials, persistSolidClientCredentialsLogin, type SolidClientCredentialsLoginRuntime } from '../solid-client-credentials-login.js'

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

export async function preflightAutoModeAuth(backend: AutoModeWorkerBackend): Promise<AutoModeAuthPreflightResult> {
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


export type LinxCloudAuthPromptReason = 'startup' | 'expired' | 'manual'
export type LinxCloudAuthPromptAction = 'retry' | 'cancel'

export interface AutoModeAuthPromptRuntime extends SolidClientCredentialsLoginRuntime {
  promptText: typeof promptText
  clearDefaultPodDataSession: typeof clearDefaultPodDataSession
  persistSolidClientCredentialsLogin: typeof persistSolidClientCredentialsLogin
  runLinxLoginCommand: typeof defaultRunLinxLoginCommand
  runLinxLogoutCommand: typeof defaultRunLinxLogoutCommand
}

export const autoModeAuthRuntime: AutoModeAuthPromptRuntime = {
  promptText,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  saveAccountSession,
  createPodDataSession,
  resolveAccountBaseUrl,
  clearDefaultPodDataSession,
  persistSolidClientCredentialsLogin,
  runLinxLoginCommand: defaultRunLinxLoginCommand,
  runLinxLogoutCommand: defaultRunLinxLogoutCommand,
}

export async function promptLinxCloudAuth(
  display: AutoModeDisplay,
  lines: string[],
  reason: LinxCloudAuthPromptReason = 'manual',
  runtime: AutoModeAuthPromptRuntime = autoModeAuthRuntime,
): Promise<LinxCloudAuthPromptAction> {
  while (true) {
    display.setPhase('question', reason === 'expired' ? 'LinX Cloud login expired' : 'LinX Cloud login required')
    const answer = (await display.chooseOption(
      reason === 'expired' ? 'LinX Cloud login expired' : 'LinX Cloud login required',
      lines,
      [
        { label: 'Authorize in browser', value: 'browser', description: 'refresh the LinX Cloud Solid session', shortcuts: ['b', '1'] },
        { label: 'Enter Solid client credentials', value: 'client-credentials', description: 'use LinX Cloud client credentials', shortcuts: ['k', '2'] },
        { label: 'Exit', value: 'exit', description: 'leave this session', shortcuts: ['x', '3'] },
      ],
    )).trim().toLowerCase()

    if (answer === 'browser' || answer === 'b' || answer === '1') {
      await runBackendLinxLogin(display, runtime)
      return 'retry'
    }

    if (answer === 'client-credentials' || answer === 'k' || answer === '2') {
      const saved = await promptBackendSolidClientCredentials(display, runtime)
      if (saved) {
        return 'retry'
      }
      continue
    }

    if (answer === 'exit' || answer === 'x' || answer === '3' || answer === 'cancel') {
      display.setPhase('running', 'Authentication cancelled')
      return 'cancel'
    }
  }
}

export async function runBackendLinxLogin(
  display: AutoModeDisplay,
  runtime: AutoModeAuthPromptRuntime = autoModeAuthRuntime,
): Promise<void> {
  display.showActivity('Opening LinX Cloud login in your browser...')
  await runtime.runLinxLoginCommand({}, {
    promptText: runtime.promptText,
    write(chunk) {
      for (const line of chunk.split(/\r?\n/u)) {
        const trimmed = line.trim()
        if (trimmed) {
          display.showActivity(trimmed)
        }
      }
    },
  })
  runtime.clearDefaultPodDataSession()
  display.showActivity('LinX Cloud login refreshed.', 'success')
}

export function runBackendLinxLogout(
  display: AutoModeDisplay,
  runtime: AutoModeAuthPromptRuntime = autoModeAuthRuntime,
): void {
  runtime.runLinxLogoutCommand({
    write(chunk) {
      for (const line of chunk.split(/\r?\n/u)) {
        const trimmed = line.trim()
        if (trimmed) {
          display.showActivity(trimmed)
        }
      }
    },
  })
  runtime.clearDefaultPodDataSession()
  display.showActivity('Use /login or choose browser authorization to sign in again.', 'note')
}

async function promptBackendSolidClientCredentials(
  display: AutoModeDisplay,
  runtime: AutoModeAuthPromptRuntime,
): Promise<boolean> {
  display.setPhase('question', 'Solid client credentials required')
  const credentialsText = await display.promptSecret({
    header: 'Solid client credentials',
    question: 'Paste Solid client credentials in client_id:client_secret format.',
    note: 'Input is hidden and saved locally as LinX Cloud client credentials.',
  })
  const parsed = parseSolidClientCredentials(credentialsText)
  if (!parsed) {
    display.showActivity('Solid client credentials entry cancelled or invalid. Expected client_id:client_secret.', 'error')
    return false
  }

  runtime.clearDefaultPodDataSession()

  try {
    await runtime.persistSolidClientCredentialsLogin(credentialsText, runtime)
    runtime.clearDefaultPodDataSession()
    display.showActivity('Solid client credentials saved. Retrying backend startup.', 'success')
    return true
  } catch (error) {
    runtime.clearDefaultPodDataSession()
    const message = error instanceof Error ? error.message : String(error)
    display.showActivity(`Solid client credentials rejected: ${message}`, 'error')
    return false
  }
}
