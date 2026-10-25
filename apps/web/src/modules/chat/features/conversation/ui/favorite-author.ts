/**
 * The author shown on a favorited message: 我 for the person's own messages,
 * a contact name for others, and never the raw name@provider label.
 */
export function favoriteAuthorLabel(input: {
  role: 'user' | 'assistant'
  speaker: string | null
  selfName?: string
  agentName?: string
}): string | undefined {
  const { role, speaker, selfName, agentName } = input
  if (speaker && speaker !== selfName) return speaker
  if (role === 'user') return '我'
  return agentName
}
