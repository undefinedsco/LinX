import { describe, expect, it } from 'vitest'

import { summarizeWacAclPolicy } from './access-policy-model'

describe('Files access policy model', () => {
  it('summarizes common WAC ACL Turtle grants without Pod transport', () => {
    expect(summarizeWacAclPolicy('https://pod.example/public/README.md.acl', [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
      '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
      '<#owner> a acl:Authorization ;',
      '  acl:agent <https://alice.example/profile#me> ;',
      '  acl:mode acl:Read, acl:Write, acl:Control .',
      '<#public> a acl:Authorization ;',
      '  acl:agentClass foaf:Agent ;',
      '  acl:mode acl:Read .',
    ].join('\n'))).toMatchObject({
      uri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      state: 'exists',
      grants: [
        {
          audience: 'agent',
          audienceRef: 'https://alice.example/profile#me',
          modes: { read: true, append: false, write: true, control: true },
        },
        {
          audience: 'public',
          audienceRef: 'foaf:Agent',
          modes: { read: true, append: false, write: false, control: false },
        },
      ],
    })
  })
})
