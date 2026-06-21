import { normalizeMisclassifiedCloudCompletionPodTimeoutMessage } from './linx-cloud-errors.js'

export function formatLinxStreamErrorMessage(error: unknown): string {
  if (isLinxStreamAbortError(error)) {
    return 'Request was aborted.'
  }
  if (isLinxStreamAuthExpiredError(error)) {
    return 'LinX Cloud login expired.'
  }
  const misclassifiedPodRuntimeTimeout = normalizeMisclassifiedCloudCompletionPodTimeoutMessage(error)
  if (misclassifiedPodRuntimeTimeout) {
    return misclassifiedPodRuntimeTimeout
  }
  return appendCloudDebugDetails(
    error instanceof Error ? error.message : String(error),
    error,
  )
}

export function isLinxStreamAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isLinxStreamAuthExpiredError(error: unknown): boolean {
  if (isRecord(error) && error.authExpired === true) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('invalid solid token')
    || (normalized.includes('chat request failed (401)') && normalized.includes('unauthorized'))
}

function appendCloudDebugDetails(message: string, error: unknown): string {
  if (!isTruthyEnv('LINX_DEBUG_CLOUD') || !isRecord(error)) {
    return message
  }

  const responseBody = typeof error.responseBody === 'string' ? error.responseBody : ''
  const status = typeof error.status === 'number' ? error.status : undefined
  if (!responseBody && status === undefined) {
    return message
  }

  const parts = [
    status === undefined ? undefined : `status=${status}`,
    responseBody ? `response=${truncateCloudDebug(responseBody)}` : undefined,
  ].filter(Boolean)

  return `${message}\nCloud debug: ${parts.join(' ')}`
}

function isTruthyEnv(name: string): boolean {
  const raw = process.env[name]
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function truncateCloudDebug(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
