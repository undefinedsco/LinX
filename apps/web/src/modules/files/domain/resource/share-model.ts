/**
 * R6 K9: sharing in plain words. A person either "可以查看" or "可以编辑" an item; the link is
 * off unless someone turns it on. The Pod's access rules (WAC) are translated both ways here.
 */
export type ShareRole = 'view' | 'edit'

export interface ShareAccessModes {
  read: boolean
  append: boolean
  write: boolean
  control: boolean
}

export interface SharePerson {
  webId: string
  role: ShareRole | 'owner'
}

export interface ShareState {
  /** Everyone named in the rules (owner included). */
  people: SharePerson[]
  /** "知道链接的人也能看". */
  linkOn: boolean
  /** The item has no rules of its own: it follows the folder it lives in. */
  followsParent: boolean
  /** The signed-in person may change the rules. */
  canManage: boolean
}

export const SHARE_ROLE_LABEL: Record<ShareRole, string> = {
  view: '可以查看',
  edit: '可以编辑',
}

export function shareRoleFromModes(modes: ShareAccessModes): SharePerson['role'] | null {
  if (modes.control) return 'owner'
  if (modes.write || modes.append) return 'edit'
  if (modes.read) return 'view'
  return null
}

export function shareModesFromRole(role: ShareRole | null): ShareAccessModes {
  if (role === 'edit') return { read: true, append: true, write: true, control: false }
  if (role === 'view') return { read: true, append: false, write: false, control: false }
  return { read: false, append: false, write: false, control: false }
}

export function projectShareState(input: {
  agents: Record<string, ShareAccessModes>
  publicModes: ShareAccessModes | null
  followsParent: boolean
  canManage: boolean
}): ShareState {
  const people: SharePerson[] = []
  for (const [webId, modes] of Object.entries(input.agents)) {
    const role = shareRoleFromModes(modes)
    if (role) people.push({ webId, role })
  }
  people.sort((left, right) => (left.role === 'owner' ? -1 : right.role === 'owner' ? 1 : 0))
  return {
    people,
    linkOn: !!input.publicModes?.read,
    followsParent: input.followsParent,
    canManage: input.canManage,
  }
}

/** name@provider, never the raw WebID. */
export function shareAddressLabel(webId: string): string {
  try {
    const url = new URL(webId)
    const segments = url.pathname.split('/').filter(Boolean)
    const profileIndex = segments.indexOf('profile')
    const owner = (profileIndex >= 0 ? segments.slice(0, profileIndex) : segments)[0]
    if (owner) return `${decodeURIComponent(owner)}@${url.host}`
    const labels = url.hostname.split('.')
    if (labels.length >= 3) return `${labels[0]}@${labels.slice(1).join('.')}${url.port ? `:${url.port}` : ''}`
    return url.host
  } catch {
    return webId
  }
}

export interface ShareRow {
  webId: string
  name: string
  address: string
  role: SharePerson['role']
  isYou: boolean
  /** Can be changed or revoked from this dialog. */
  editable: boolean
}

export function projectShareRows({
  state,
  selfWebId,
  names,
}: {
  state: ShareState
  selfWebId: string | null | undefined
  /** Display names from contacts, by WebID. */
  names: ReadonlyMap<string, string>
}): ShareRow[] {
  return state.people.map((person) => {
    const isYou = !!selfWebId && person.webId === selfWebId
    const address = shareAddressLabel(person.webId)
    return {
      webId: person.webId,
      name: isYou ? '你' : names.get(person.webId) ?? address.split('@')[0] ?? address,
      address,
      role: person.role,
      isYou,
      editable: state.canManage && person.role !== 'owner' && !isYou,
    }
  })
}

export function projectShareSummary(rows: readonly ShareRow[]): string {
  if (rows.length <= 1) return '只有你能访问'
  const names = rows.map((row) => row.name)
  return `${names.join('、')} 可以访问`
}

/** What the "知道链接的人" switch says, and what turning it on means. */
export function projectLinkCopy(input: { itemName: string; isFolder: boolean; childCount?: number | null }) {
  const scope = input.isFolder
    ? `“${input.itemName}”里的${input.childCount != null ? ` ${input.childCount} 个` : ''}文件`
    : `“${input.itemName}”`
  return {
    off: '关 · 只有上面的人能打开',
    on: '开 · 任何拿到链接的人都能看',
    confirmTitle: '让拿到链接的人都能看？',
    confirmBody: `${scope}，任何拿到链接的人都能打开，包括你不认识的人。只能看，不能改。`,
  }
}

export type ShareWarning =
  | { kind: 'private-chat'; title: string; body: string; options: [string, string] }
  | { kind: 'hidden-cards'; title: string; body: string; options: [string, string] }

export function projectShareWarning(input: {
  /** Sharing a card whose quote comes from a private chat. */
  privateChat?: { quote: string; withName: string } | null
  /** Sharing a board whose cards some people cannot see. */
  hiddenCards?: { boardName: string; count: number; personName: string } | null
  cardName?: string
  personName?: string
}): ShareWarning | null {
  if (input.privateChat) {
    return {
      kind: 'private-chat',
      title: `共享“${input.cardName ?? ''}”给 ${input.personName ?? ''}`.trim(),
      body: `这句原话来自你和${input.privateChat.withName}的私聊。共享后，${input.personName ?? 'TA'}也能看到这句原话。`,
      options: ['只共享判断，不带原话', '一起共享'],
    }
  }
  if (input.hiddenCards && input.hiddenCards.count > 0) {
    const { boardName, count, personName } = input.hiddenCards
    return {
      kind: 'hidden-cards',
      title: `“${boardName}”上有 ${count} 张卡片 ${personName} 看不到`,
      body: '不一起共享的话，TA 看到的是“没有权限查看”的空位置。',
      options: ['只共享白板', `一起共享这 ${count} 张`],
    }
  }
  return null
}

/** Folder rules vs an item's own rules ("和文件夹不同"). */
export function projectShareInheritance(input: { followsParent: boolean; isFolder: boolean; parentName?: string | null }) {
  if (input.isFolder) return { differs: false, note: '里面的文件和卡片跟着这个文件夹共享；单独设置过的写“和文件夹不同”。' }
  if (input.followsParent) {
    return { differs: false, note: input.parentName ? `跟“${input.parentName}”文件夹一样` : '跟所在文件夹一样' }
  }
  return { differs: true, note: '和文件夹不同' }
}

/** Plain sentences for each way sharing can fail (K9b). */
export function projectShareErrorMessage(error: unknown, personName?: string, options: { sharedWithYou?: boolean } = {}): string {
  const message = error instanceof Error ? error.message : ''
  if (/Failed to fetch|NetworkError|offline/i.test(message)) return '没有网络，现在不能改共享'
  if (options.sharedWithYou && /401|403|forbidden|unauthorized/i.test(message)) return '这个文件夹是别人共享给你的，你不能再共享给别人'
  if (personName) return `没加上 ${personName}：TA 的空间暂时连不上`
  return '没改成功，还是原来的人能看'
}
