/**
 * "TA 的空间与权限" (W5 / W5c), worded from what the Pod's access control
 * actually says. Anything that cannot be read is reported as unknown rather
 * than guessed.
 */

export interface AccessModes {
  read?: boolean
  append?: boolean
  write?: boolean
  controlRead?: boolean
  controlWrite?: boolean
}

/** Places in my space whose access we check for a person. */
export type ContactAccessPlace = 'space' | 'profile'

export interface ContactAccessProbeItem {
  place: ContactAccessPlace
  url: string
  /** Access given to this person by name; null when it could not be read. */
  agent: AccessModes | null
  /** Access given to everyone; null when it could not be read. */
  public: AccessModes | null
}

export interface ContactAccessProbe {
  items: ContactAccessProbeItem[]
}

export interface ContactAccessLine {
  label: string
  value: string
}

export interface ContactSharedItem {
  place: ContactAccessPlace
  label: string
  value: string
  url: string
}

export interface ContactAccessSummary {
  /** False when none of the places could be read. */
  known: boolean
  /** "TA 在我空间里能做什么", one line per place. */
  canDo: ContactAccessLine[]
  /** What I gave this person by name — what "收回" would take back. */
  sharedWithThem: ContactSharedItem[]
  /** Short value for the detail row. */
  canDoText: string
  sharedText: string
}

const PLACE_LABELS: Record<ContactAccessPlace, string> = {
  space: '你的整个空间',
  profile: '你的公开资料',
}

export function hasAnyAccess(modes: AccessModes | null | undefined): boolean {
  return !!modes && Object.values(modes).some((value) => value === true)
}

export function describeAccessModes(modes: AccessModes | null | undefined): string | null {
  if (!hasAnyAccess(modes)) return null
  const control = !!(modes?.controlRead || modes?.controlWrite)
  if (control && modes?.write) return '可以管理'
  if (modes?.write) return '可以编辑'
  if (modes?.append && modes?.read) return '可以查看和添加'
  if (modes?.append) return '可以添加'
  if (modes?.read) return '可以查看'
  return '可以管理权限'
}

function profileLine(item: ContactAccessProbeItem | undefined): ContactAccessLine {
  const label = '看你的公开资料'
  if (!item || (item.agent === null && item.public === null)) return { label, value: '查不到' }
  if (item.public?.read) return { label, value: '所有人都能' }
  if (item.agent?.read) return { label, value: '可以' }
  return { label, value: '不能' }
}

function spaceLine(item: ContactAccessProbeItem | undefined): ContactAccessLine {
  const label = PLACE_LABELS.space
  if (!item || item.agent === null) return { label, value: '查不到' }
  return { label, value: describeAccessModes(item.agent) ?? '没有单独给 TA' }
}

export function summarizeContactAccess(probe: ContactAccessProbe | null | undefined): ContactAccessSummary {
  const items = probe?.items ?? []
  const known = items.some((item) => item.agent !== null || item.public !== null)
  const profile = items.find((item) => item.place === 'profile')
  const space = items.find((item) => item.place === 'space')
  const canDo = [profileLine(profile), spaceLine(space)]
  const sharedWithThem = items
    .filter((item) => hasAnyAccess(item.agent))
    .map((item) => ({
      place: item.place,
      label: PLACE_LABELS[item.place],
      value: describeAccessModes(item.agent) ?? '',
      url: item.url,
    }))

  const abilities: string[] = []
  if (profile?.public?.read || profile?.agent?.read) abilities.push('看公开资料')
  if (space?.agent?.write) abilities.push('改你的空间')
  else if (space?.agent?.read) abilities.push('看你的空间')
  else if (space?.agent?.append) abilities.push('往你的空间里添加')

  return {
    known,
    canDo,
    sharedWithThem,
    canDoText: !known ? '查不到' : abilities.length ? abilities.join('、') : '没有',
    sharedText: sharedWithThem.length
      ? `${sharedWithThem.length} 项`
      : known ? '没有查到' : '暂时看不到',
  }
}
