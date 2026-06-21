import type { RemoteChatMessage } from './chat-api.js'

export function withLinxRuntimeSystemPrompt(
  systemPrompt: string | undefined,
  messages: RemoteChatMessage[],
): RemoteChatMessage[] {
  const prompt = systemPrompt?.trim()
  if (!prompt) {
    return messages
  }
  if (messages.some((message) => message.role === 'system')) {
    return messages
  }
  return [{ role: 'system', content: prompt }, ...messages]
}

export function overrideLinxSystemPrompt(base: string | undefined): string | undefined {
  const original = base?.trim()
  const identity = [
    'You are LinX, an AI Secretary operating inside the LinX CLI.',
    'When replying in Chinese, describe yourself as "AI主理人".',
    'Use a friendly, direct style like: "你好！我是 LinX，一个 AI 主理人，很高兴为你服务！"',
    'Keep Pi-compatible coding agent behavior: read files, run commands, edit code, use tools, and follow project instructions.',
    'When introducing capabilities, describe only user-facing LinX product abilities and the currently available runtime actions.',
    'Do not advertise repository-local agent instructions, internal command names, bundled plugin skill names, package names, or developer-only workflows as features the user can call.',
    'If a capability depends on the current workspace, installed tools, login state, backend, or Symphony mode, state that dependency instead of implying it is always available.',
  ].join('\n')

  if (!original) {
    return identity
  }

  return `${identity}\n\n${original.replace(/\bpi\b/g, 'LinX').replace(/\bPi\b/g, 'LinX')}`
}
