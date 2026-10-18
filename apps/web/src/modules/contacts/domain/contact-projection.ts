import {
  ContactGender,
  isAgentContact,
  isGroupContact,
  normalizeContactGender,
  type AgentRow,
  type ContactRow,
} from '@undefineds.co/models'
import type {
  ContactSection,
  GroupContactInfo,
  UnifiedContact,
} from './types'
import { formatAccountAddress } from './account-address'
import { displayAssistantName } from '@/lib/assistant-name'

export interface ContactListProjection {
  /** One A–Z list where people and assistants sit together. */
  sections: ContactSection[]
  letters: string[]
  /** Saved groups live behind the "群聊" entry, not in the A–Z list. */
  groups: UnifiedContact[]
}

export interface ContactProjectionOptions {
  groupInfo?: GroupContactInfo
  agentConfig?: UnifiedContact['agentConfig']
}

export interface ContactListProjectionOptions {
  groupInfoById?: ReadonlyMap<string, GroupContactInfo>
}

// First syllable of each pinyin initial in the zh pinyin collation order.
// A collator lookup keeps Chinese names under their pinyin letter (陈 → C)
// without shipping a pinyin dictionary. Polyphonic surnames use their common
// reading (曾 → C), as most phone contact lists do.
const PINYIN_BOUNDARIES = ['阿', '八', '嚓', '哒', '妸', '发', '旮', '哈', '丌', '咔', '垃', '呣', '拏', '噢', '妑', '七', '呥', '仨', '他', '屲', '夕', '丫', '帀'] as const
const PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ'
const HAN_CHARACTER = /\p{Script=Han}/u

let pinyinCollator: Intl.Collator | null | undefined
function getPinyinCollator(): Intl.Collator | null {
  if (pinyinCollator !== undefined) return pinyinCollator
  try {
    pinyinCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base', numeric: true })
  } catch {
    pinyinCollator = null
  }
  return pinyinCollator
}

function pinyinInitial(character: string): string {
  const collator = getPinyinCollator()
  if (!collator) return '#'
  let letter = '#'
  for (let index = 0; index < PINYIN_BOUNDARIES.length; index += 1) {
    if (collator.compare(character, PINYIN_BOUNDARIES[index]) < 0) break
    letter = PINYIN_LETTERS[index]
  }
  return letter
}

export function getContactInitial(name: string): string {
  const first = name.trim().charAt(0)
  const upper = first.toUpperCase()
  if (/[A-Z]/.test(upper)) return upper
  if (HAN_CHARACTER.test(first)) return pinyinInitial(first)
  return '#'
}

function startsWithLatin(name: string): boolean {
  return /^[A-Za-z]/.test(name.trim())
}

/** Latin names first inside a letter, then Chinese names in pinyin order. */
export function compareContactNames(left: string, right: string): number {
  const leftLatin = startsWithLatin(left)
  const rightLatin = startsWithLatin(right)
  if (leftLatin !== rightLatin) return leftLatin ? -1 : 1
  const collator = getPinyinCollator()
  return collator ? collator.compare(left, right) : left.localeCompare(right)
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
  isGroup: boolean,
  options: ContactProjectionOptions,
): string | undefined {
  // List rows are names only (W5); groups add a member summary.
  if (isGroup && options.groupInfo) {
    const preview = options.groupInfo.memberPreview.slice(0, 2).join('、')
    return preview
      ? `${options.groupInfo.memberCount}人 · ${preview}`
      : `${options.groupInfo.memberCount}人`
  }
  return undefined
}

export function projectContact(
  contact: ContactRow,
  options: ContactProjectionOptions = {},
): UnifiedContact {
  const sourceType = getContactSourceType(contact)
  const storedName = contact.alias?.trim() || contact.name?.trim() || formatAccountAddress(contact.about) || '未命名'
  const displayName = sourceType === 'agent' ? displayAssistantName(storedName) : storedName
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
    subtitle: getContactSubtitle(isGroup, options),
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

function sortByDisplayName(contacts: UnifiedContact[]): UnifiedContact[] {
  return [...contacts].sort((left, right) => compareContactNames(left.displayName, right.displayName))
}

function compareLetters(left: string, right: string): number {
  if (left === '#') return 1
  if (right === '#') return -1
  return left.localeCompare(right)
}

export function buildContactListProjection(
  contacts: readonly ContactRow[],
  options: ContactListProjectionOptions = {},
): ContactListProjection {
  const projected = contacts.map((contact) => projectContact(contact, {
    groupInfo: options.groupInfoById?.get(contact.id),
  }))

  const groups = sortByDisplayName(projected.filter((contact) => contact.isGroup))
  const people = projected.filter((contact) => !contact.isGroup)
  const alphabetical = new Map<string, UnifiedContact[]>()

  for (const contact of people) {
    alphabetical.set(contact.initial, [...(alphabetical.get(contact.initial) ?? []), contact])
  }

  const sortedLetters = [...alphabetical.keys()].sort(compareLetters)

  const sections: ContactSection[] = [
    ...sortedLetters.map((letter) => ({
      key: 'letter' as const,
      title: letter,
      items: sortByDisplayName(alphabetical.get(letter) ?? []),
    })),
  ]

  return {
    sections,
    letters: sortedLetters,
    groups,
  }
}

const RECENT_FRIEND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * "新的朋友": people you added recently. Incoming friend requests are not
 * modelled yet, so only real, already-added contacts show up here.
 */
export function buildRecentFriends(
  contacts: readonly ContactRow[],
  now: Date = new Date(),
): UnifiedContact[] {
  return contacts
    .map((contact) => projectContact(contact))
    .filter((contact) => !contact.isGroup && contact.sourceType !== 'agent')
    .filter((contact) => {
      const created = contact.createdAt ? new Date(contact.createdAt).getTime() : Number.NaN
      return Number.isFinite(created) && now.getTime() - created <= RECENT_FRIEND_WINDOW_MS && created <= now.getTime()
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20)
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

/**
 * Models are stored as provider resource IRIs (…/providers/x.ttl#model-id).
 * People only need the model's own name.
 */
export function formatModelLabel(model: string | null | undefined): string | null {
  if (typeof model !== 'string' || !model.trim()) return null
  const value = model.trim()
  const hashIndex = value.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < value.length - 1) return value.slice(hashIndex + 1)
  if (/^https?:\/\//i.test(value)) return value.split('/').filter(Boolean).pop() ?? value
  return value
}
