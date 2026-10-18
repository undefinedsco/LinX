import { describe, expect, it } from 'vitest'

import {
  applyShareChangeToRules,
  isOwnPodResource,
  projectShareStateFromAccess,
  renderShareAclTurtle,
  shareRulesFromGrants,
} from './share-acl-model'
import type { FilesAccessBasics } from './resource-model'

const ME = 'https://lin.pod.example/profile/card#me'
const ZHOU = 'https://zhou.pod.example/profile/card#me'
const POD = 'https://lin.pod.example/'
const none = { read: false, append: false, write: false, control: false }

describe('share ownership', () => {
  it('treats anything in the current Pod as the owner\'s own', () => {
    expect(isOwnPodResource('https://lin.pod.example/profile/card', [POD])).toBe(true)
    expect(isOwnPodResource('https://lin.pod.example/docs/', ['https://lin.pod.example'])).toBe(true)
    expect(isOwnPodResource('https://zhou.pod.example/docs/a.md', [POD])).toBe(false)
    expect(isOwnPodResource('https://lin.pod.example.evil.com/a', [POD])).toBe(false)
  })

  it('does not decide "shared with you" from a missing ACL', () => {
    const state = projectShareStateFromAccess({
      access: { ownerUri: 'x', activeSource: null, effectiveAccess: null, policySummary: null, candidates: [] },
      ownAclUri: 'https://lin.pod.example/profile/card.acl',
      isOwnPod: true,
      selfWebId: ME,
    })
    expect(state.canManage).toBe(true)
    expect(state.people).toEqual([{ webId: ME, role: 'owner' }])
    const foreign = projectShareStateFromAccess({ access: null, ownAclUri: 'u.acl', isOwnPod: false, selfWebId: ME })
    expect(foreign.canManage).toBe(false)
  })

  it('lets a shared-with-you item be managed only with control', () => {
    const access = {
      ownerUri: 'u', activeSource: null, policySummary: null, candidates: [],
      effectiveAccess: { user: { read: true, append: true, write: true, control: true } },
    } as FilesAccessBasics
    expect(projectShareStateFromAccess({ access, ownAclUri: 'u.acl', isOwnPod: false }).canManage).toBe(true)
  })
})

describe('share rules', () => {
  const grants = [
    { audience: 'agent' as const, audienceRef: ME, modes: { read: true, append: true, write: true, control: true } },
    { audience: 'agent' as const, audienceRef: ZHOU, modes: { ...none, read: true } },
  ]

  it('reads people and link from the linked policy', () => {
    const access = {
      ownerUri: 'u', candidates: [], effectiveAccess: null,
      activeSource: { provider: 'acl', uri: 'u.acl', confidence: 'linked', inheritance: 'direct' },
      policySummary: { uri: 'u.acl', provider: 'acl', state: 'exists', grants: [...grants, { audience: 'public', audienceRef: 'foaf:Agent', modes: { ...none, read: true } }] },
    } as FilesAccessBasics
    const state = projectShareStateFromAccess({ access, ownAclUri: 'u.acl', isOwnPod: true, selfWebId: ME })
    expect(state.people.map((p) => p.role)).toEqual(['owner', 'view'])
    expect(state.linkOn).toBe(true)
    expect(state.followsParent).toBe(false)
  })

  it('adds, changes, revokes and toggles the link without dropping the owner', () => {
    let rules = shareRulesFromGrants([grants[0]])
    rules = applyShareChangeToRules(rules, { type: 'person', webId: ZHOU, role: 'edit' }, ME)
    expect(rules.agents[ZHOU]).toMatchObject({ read: true, write: true, control: false })
    rules = applyShareChangeToRules(rules, { type: 'link', on: true }, ME)
    expect(rules.publicModes).toMatchObject({ read: true, write: false })
    rules = applyShareChangeToRules(rules, { type: 'person', webId: ZHOU, role: null }, ME)
    expect(rules.agents[ZHOU]).toBeUndefined()
    rules = applyShareChangeToRules(rules, { type: 'person', webId: ME, role: null }, ME)
    expect(rules.agents[ME].control).toBe(true)
  })

  it('renders a WAC document, with defaults for folders', () => {
    const rules = applyShareChangeToRules(shareRulesFromGrants([grants[0]]), { type: 'person', webId: ZHOU, role: 'view' }, ME)
    const file = renderShareAclTurtle({ ownerUri: 'https://lin.pod.example/a.md', isFolder: false, rules })
    expect(file).toContain(`acl:agent <${ZHOU}>`)
    expect(file).toContain('acl:mode acl:Read ;')
    expect(file).not.toContain('acl:default')
    expect(renderShareAclTurtle({ ownerUri: 'https://lin.pod.example/d/', isFolder: true, rules })).toContain('acl:default <https://lin.pod.example/d/>')
  })
})
