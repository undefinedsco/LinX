/**
 * The fields of `profile/card#me` the person edits on 个人资料. They map 1:1
 * onto `solidProfileResource` columns (vcard:fn, foaf:nick, vcard:note,
 * vcard:region, vcard:hasGender, vcard:hasEmail, vcard:hasTelephone); the
 * avatar (vcard:hasPhoto) has its own control.
 */

export type ProfileFieldKey = 'name' | 'nick' | 'note' | 'region' | 'gender' | 'email' | 'phone'

export interface ProfileFieldOption {
  value: string
  label: string
}

export interface ProfileFieldSpec {
  key: ProfileFieldKey
  label: string
  maxLength?: number
  /** Show "9 / 60" while editing. */
  showCount?: boolean
  inputType?: 'text' | 'email' | 'tel'
  options?: readonly ProfileFieldOption[]
}

export const GENDER_OPTIONS: readonly ProfileFieldOption[] = [
  { value: '', label: '不填' },
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'non-binary', label: '非二元' },
]

export const CARD_FIELDS: readonly ProfileFieldSpec[] = [
  { key: 'name', label: '名字', maxLength: 40 },
  { key: 'nick', label: '昵称', maxLength: 40 },
  { key: 'note', label: '签名', maxLength: 60, showCount: true },
  { key: 'region', label: '地区', maxLength: 40 },
  { key: 'gender', label: '性别', options: GENDER_OPTIONS },
]

export const CONTACT_FIELDS: readonly ProfileFieldSpec[] = [
  { key: 'email', label: '邮箱', inputType: 'email', maxLength: 120 },
  { key: 'phone', label: '电话', inputType: 'tel', maxLength: 40 },
]

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey | 'avatar', string> = {
  name: '名字',
  nick: '昵称',
  note: '签名',
  region: '地区',
  gender: '性别',
  email: '邮箱',
  phone: '电话',
  avatar: '头像',
}

export type ProfileValues = Record<ProfileFieldKey | 'avatar', string>

const ALL_KEYS: Array<ProfileFieldKey | 'avatar'> = ['name', 'nick', 'note', 'region', 'gender', 'email', 'phone', 'avatar']

/** Plain strings for every field; contact values lose their mailto:/tel: scheme. */
export function readProfileValues(record: Record<string, unknown> | null | undefined): ProfileValues {
  const values = {} as ProfileValues
  for (const key of ALL_KEYS) {
    const raw = record?.[key]
    values[key] = typeof raw === 'string' ? displayValue(key, raw) : ''
  }
  return values
}

function displayValue(key: ProfileFieldKey | 'avatar', raw: string): string {
  const value = raw.trim()
  if (key === 'email') return value.replace(/^mailto:/iu, '')
  if (key === 'phone') return value.replace(/^tel:/iu, '')
  return value
}

export function fieldDisplayText(spec: ProfileFieldSpec, value: string): string {
  if (spec.options) return spec.options.find((option) => option.value === value)?.label ?? value
  return value
}

/** Name shown everywhere: 名字, else 昵称, else a neutral placeholder. */
export function profileDisplayName(values: Pick<ProfileValues, 'name' | 'nick'>): string {
  return values.name.trim() || values.nick.trim() || 'LinX 用户'
}
