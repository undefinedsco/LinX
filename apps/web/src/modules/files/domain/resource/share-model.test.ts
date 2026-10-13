import { describe, expect, it } from 'vitest'

import {
  projectLinkCopy,
  projectShareInheritance,
  projectShareRows,
  projectShareState,
  projectShareSummary,
  projectShareWarning,
  shareAddressLabel,
  shareModesFromRole,
  shareRoleFromModes,
} from './share-model'

const none = { read: false, append: false, write: false, control: false }
const ME = 'https://lin.pod.example/profile/card#me'
const ZHOU = 'https://zhou.pod.example/profile/card#me'

describe('share model', () => {
  it('translates access modes to plain roles and back', () => {
    expect(shareRoleFromModes({ ...none, read: true })).toBe('view')
    expect(shareRoleFromModes({ ...none, read: true, write: true })).toBe('edit')
    expect(shareRoleFromModes({ read: true, append: true, write: true, control: true })).toBe('owner')
    expect(shareRoleFromModes(none)).toBeNull()
    expect(shareModesFromRole('edit')).toMatchObject({ read: true, write: true, control: false })
    expect(shareModesFromRole(null)).toEqual(none)
  })

  it('lists who has access, owner first, never raw WebIDs', () => {
    const state = projectShareState({
      agents: { [ZHOU]: { ...none, read: true, write: true }, [ME]: { read: true, append: true, write: true, control: true } },
      publicModes: { ...none },
      followsParent: false,
      canManage: true,
    })
    const rows = projectShareRows({ state, selfWebId: ME, names: new Map([[ZHOU, '周禾']]) })
    expect(rows.map((row) => [row.name, row.role, row.editable])).toEqual([['你', 'owner', false], ['周禾', 'edit', true]])
    expect(projectShareSummary(rows)).toBe('你、周禾 可以访问')
    expect(state.linkOn).toBe(false)
    expect(shareAddressLabel(ZHOU)).toBe('zhou@pod.example')
  })

  it('writes the consequences of turning the link on', () => {
    expect(projectLinkCopy({ itemName: '活动', isFolder: true, childCount: 12 }).confirmBody).toContain('12 个文件')
  })

  it('warns about private chat quotes and hidden board cards', () => {
    expect(projectShareWarning({ privateChat: { quote: '…', withName: '陈一' }, cardName: '维护成本', personName: '周禾' })?.kind).toBe('private-chat')
    expect(projectShareWarning({ hiddenCards: { boardName: '志愿者排班', count: 3, personName: '周禾' } })?.options[1]).toBe('一起共享这 3 张')
    expect(projectShareWarning({})).toBeNull()
  })

  it('says when an item differs from its folder', () => {
    expect(projectShareInheritance({ followsParent: false, isFolder: false }).differs).toBe(true)
    expect(projectShareInheritance({ followsParent: true, isFolder: false, parentName: '活动' }).note).toBe('跟“活动”文件夹一样')
  })
})
