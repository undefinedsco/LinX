import { MatrixClientError } from '@linx/agent-runtime/matrix-client'
import {
  MatrixInterfaceAuthorizationRequiredError,
  MatrixInterfaceScopeError,
} from './pod-interface-access'

/**
 * Shared Matrix user-facing error vocabulary.
 *
 * Matrix failures are produced in the shared `lib/matrix` layer and consumed by
 * more than one module (Chat group operations, Contacts group creation). They
 * live here so consumers do not reach into Chat internals; Chat re-exports these
 * symbols through its existing public facade to keep its call sites unchanged.
 */

/**
 * A Matrix failure already worded for the person. The shared error formatter must
 * not replace it (its internal-diagnostic filter drops words like "Pod"), and it
 * must never be interpreted as an expired Solid login.
 */
export class MatrixUserFacingError extends Error {
  readonly code = 'matrix_user_facing_error'

  constructor(message: string) {
    super(message)
    this.name = 'MatrixUserFacingError'
  }
}

const SAFE_MATRIX_REASON_LIMIT = 160

export function isMatrixUserFacingError(error: unknown): error is MatrixUserFacingError {
  return error instanceof MatrixUserFacingError
}

/**
 * Matrix failures belong to the group-chat operation, not to the Solid login.
 * Show the server's own refusal when it is safe, and never turn a 403 into an
 * expired-login state.
 */
export function formatMatrixErrorForUser(error: unknown): string | null {
  if (error instanceof MatrixUserFacingError) {
    return error.message
  }
  if (error instanceof MatrixInterfaceAuthorizationRequiredError) {
    return error.message
  }
  if (error instanceof MatrixInterfaceScopeError) {
    return error.message
  }
  if (!(error instanceof MatrixClientError)) {
    return null
  }
  const reason = safeMatrixReason(error.message)
  if (error.status === 401) {
    return '群聊授权已失效，请重新授权后再试。'
  }
  if (error.status === 403) {
    return reason
      ? `群聊操作没有完成：${reason}`
      : '当前空间没有允许这次群聊操作。'
  }
  if (error.status === 404) {
    return reason ? `群聊操作没有完成：${reason}` : '找不到这个群聊，它可能已被删除。'
  }
  if (error.status >= 500) {
    return '群聊服务暂时不可用，请稍后重试。'
  }
  return reason ? `群聊操作没有完成：${reason}` : null
}

function safeMatrixReason(value: string): string | null {
  const reason = value.trim()
  if (!reason || reason.length > SAFE_MATRIX_REASON_LIMIT) return null
  if (/[\u0000-\u001f\u007f]/.test(reason)) return null
  if (/https?:\/\/|bearer\s|sk-|token|secret|password|client[_-]?id|client[_-]?secret/i.test(reason)) return null
  if (/\bat\s+\S+\(|\/Users\/|\.tsx?:\d+/.test(reason)) return null
  return reason
}
