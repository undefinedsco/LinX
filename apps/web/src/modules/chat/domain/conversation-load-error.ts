/**
 * User-facing reason for a failed conversation read. Permission problems keep
 * their true cause (so the surface can offer reauthorization) and are never
 * converted into a fake logout or a silent empty room.
 */
export function describeConversationLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/\b(401|403)\b|forbidden|没有.*权限|not authorized|unauthori[sz]ed/iu.test(message)) {
    return `没有读取这个群聊的权限：${message}`
  }
  if (/群聊服务还没有授权|shared_room_authorization_required/iu.test(message)) {
    return '这个群聊需要先授权当前账号的群聊访问。'
  }
  return message || '读不到这个群聊的消息。'
}

export function isConversationPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /\b(401|403)\b|forbidden|没有.*权限|not authorized|unauthori[sz]ed|群聊服务还没有授权|shared_room_authorization_required/iu.test(message)
}
