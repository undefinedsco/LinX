import {
  ContactGender,
  ContactType,
  isAgentContact,
  isGroupContact,
  normalizeContactGender,
  type AgentRow,
  type ContactRow,
} from '@undefineds.co/models'
import type {
  ContactListFilter,
  ContactSection,
  GroupContactInfo,
  UnifiedContact,
} from './types'

export interface ContactListProjection {
  sections: ContactSection[]
  letters: string[]
}

export interface ContactProjectionOptions {
  groupInfo?: GroupContactInfo
  agentConfig?: UnifiedContact['agentConfig']
}

export interface ContactListProjectionOptions {
  filter: ContactListFilter
  groupInfoById?: ReadonlyMap<string, GroupContactInfo>
}

export function getContactInitial(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

export function isContactGroup(contact: Pick<ContactRow, 'contactType' | 'rdfType'>): boolean {
  return isGroupContact(contact)
}

export function isContactAgent(contact: Pick<ContactRow, 'contactType' | 'rdfType'>): boolean {
  return isAgentContact(contact)
}

function getContactSourceType(contact: ContactRow): UnifiedContact['sourceType'] {
  if (isContactAgent(contact)) return 'agent'
  if (contact.externalPlatform === 'wechat') return 'wechat'
  return 'solid'
}

function getContactSubtitle(
  contact: ContactRow,
  isGroup: boolean,
  sourceType: UnifiedContact['sourceType'],
  options: ContactProjectionOptions,
): string | undefined {
  if (isGroup && options.groupInfo) {
    const preview = options.groupInfo.memberPreview.slice(0, 2).join('、')
    return preview
      ? `${options.groupInfo.memberCount}人 · ${preview}`
      : `${options.groupInfo.memberCount}人`
  }
  if (sourceType === 'agent' && options.agentConfig?.model) return options.agentConfig.model
  if (contact.note) return contact.note
  if (contact.about && contact.contactType === ContactType.SOLID) return contact.about
  return undefined
}

export function projectContact(
  contact: ContactRow,
  options: ContactProjectionOptions = {},
): UnifiedContact {
  const displayName = contact.alias || contact.name || 'Unknown'
  const sourceType = getContactSourceType(contact)
  const isGroup = isContactGroup(contact)

  return {
    ...contact,
    gender: normalizeContactGender(
      contact.gender,
      sourceType === 'agent' ? ContactGender.BOT : undefined,
    ),
    displayName,
    displayAvatar: contact.avatarUrl || '',
    initial: getContactInitial(displayName),
    subtitle: getContactSubtitle(contact, isGroup, sourceType, options),
    isGroup,
    sourceType,
    agentConfig: options.agentConfig,
    groupInfo: options.groupInfo,
  }
}

function readAgentConfig(sourceData: unknown): UnifiedContact['agentConfig'] {
  if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) return undefined
  const source = sourceData as Record<string, unknown>
  const tools = Array.isArray(source.tools)
    ? source.tools.filter((tool): tool is string => typeof tool === 'string')
    : []

  return {
    ...(sourceData as Partial<AgentRow>),
    model: typeof source.model === 'string' ? source.model : undefined,
    instructions: typeof source.instructions === 'string' ? source.instructions : undefined,
    ttsModel: typeof source.ttsModel === 'string' ? source.ttsModel : undefined,
    videoModel: typeof source.videoModel === 'string' ? source.videoModel : undefined,
    tools,
  }
}

export function projectContactDetail(contact: ContactRow, sourceData?: unknown): UnifiedContact {
  return projectContact(contact, {
    agentConfig: isContactAgent(contact) ? readAgentConfig(sourceData) : undefined,
  })
}

export function getShortContactId(id: string): string {
  if (!id || !id.startsWith('http')) return id
  try {
    const url = new URL(id)
    const hostnameParts = url.hostname.split('.')
    if (hostnameParts.length >= 3) return hostnameParts[0]
    const pathPart = url.pathname
      .split('/')
      .filter((part) => part && part !== 'profile' && part !== 'card')
      .pop()
    return pathPart || url.hostname
  } catch {
    return id
  }
}

function matchesFilter(contact: UnifiedContact, filter: ContactListFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'personal') return contact.contactType === ContactType.SOLID && !contact.isGroup
  if (filter === 'agents') return contact.sourceType === 'agent'
  return contact.isGroup
}

function sortByDisplayName(contacts: UnifiedContact[]): UnifiedContact[] {
  return [...contacts].sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function buildContactListProjection(
  contacts: readonly ContactRow[],
  options: ContactListProjectionOptions,
): ContactListProjection {
  const projected = contacts
    .map((contact) => projectContact(contact, {
      groupInfo: options.groupInfoById?.get(contact.id),
    }))
    .filter((contact) => matchesFilter(contact, options.filter))

  const starred = projected.filter((contact) => contact.starred)
  const groups = projected.filter((contact) => contact.isGroup && !contact.starred)
  const agents = projected.filter((contact) => contact.sourceType === 'agent' && !contact.starred)
  const personal = projected.filter(
    (contact) => !contact.isGroup && contact.sourceType !== 'agent' && !contact.starred,
  )
  const alphabetical = new Map<string, UnifiedContact[]>()

  for (const contact of personal) {
    alphabetical.set(contact.initial, [...(alphabetical.get(contact.initial) ?? []), contact])
  }

  const sortedLetters = [...alphabetical.keys()].sort((left, right) => {
    if (left === '#') return 1
    if (right === '#') return -1
    return left.localeCompare(right)
  })

  const sections: ContactSection[] = [
    ...(starred.length ? [{ key: 'starred' as const, title: '星标朋友', items: starred }] : []),
    ...(groups.length ? [{ key: 'groups' as const, title: `群组 (${groups.length})`, items: sortByDisplayName(groups) }] : []),
    ...(agents.length ? [{ key: 'agents' as const, title: `AI 助手 (${agents.length})`, items: sortByDisplayName(agents) }] : []),
    ...sortedLetters.map((letter) => ({
      key: 'contacts' as const,
      title: letter,
      items: sortByDisplayName(alphabetical.get(letter) ?? []),
    })),
  ]

  return {
    sections,
    letters: [
      ...(starred.length ? ['⭐'] : []),
      ...(groups.length ? ['群'] : []),
      ...(agents.length ? ['AI'] : []),
      ...sortedLetters,
    ],
  }
}

function getFallbackMemberLabel(memberRef: string): string {
  if (!memberRef) return ''
  if (!memberRef.startsWith('http://') && !memberRef.startsWith('https://')) {
    return memberRef.split('/').filter(Boolean).pop()?.replace(/\.ttl(#.*)?$/, '') ?? memberRef
  }
  try {
    const url = new URL(memberRef)
    return url.pathname
      .split('/')
      .filter((segment) => segment && segment !== 'profile' && segment !== 'card')
      .pop()
      ?.replace(/\.ttl$/, '') ?? url.hostname
  } catch {
    return memberRef
  }
}

export function buildGroupContactInfo(input: {
  memberRefs: readonly string[]
  roleMap: Readonly<Record<string, string>>
  resolvedMembers: readonly ContactRow[]
  currentUserRef?: string
}): GroupContactInfo {
  const resolvedByRef = new Map(
    input.resolvedMembers.flatMap((member) => {
      const refs = new Set<string>([member.id])
      if (member.about) refs.add(member.about)
      return [...refs].map((ref) => [ref, member] as const)
    }),
  )
  const memberPreview = [...new Set(input.memberRefs.map((memberRef) => {
    const member = resolvedByRef.get(memberRef)
    return member?.alias || member?.name || getFallbackMemberLabel(memberRef)
  }).filter(Boolean))].slice(0, 4)

  return {
    memberCount: input.memberRefs.length,
    isOwner: !!input.currentUserRef && input.roleMap[input.currentUserRef] === 'owner',
    memberPreview,
  }
}
