import assert from 'node:assert/strict'
import test from 'node:test'
import { restorePatch, upPatch } from './xpod-rc-provider-patch.mjs'

const deployment = {
  spec: {
    replicas: 0,
    template: {
      spec: {
        volumes: [{ name: 'xpod-data', emptyDir: {} }, { name: 'xpod-rc-seed', secret: { secretName: 'xpod-rc-seed-1-1' } }],
        containers: [{ name: 'xpod', env: [{ name: 'CSS_SEED_CONFIG', value: '/app/config/seeds/rc.json' }, { name: 'CSS_BASE_URL', value: 'https://old' }] }],
      },
    },
  },
}

test('up points the seed volume at the run Secret, overrides the identity and scales to 1 in one patch', () => {
  assert.deepEqual(upPatch(deployment, {
    seedSecret: 'xpod-rc-seed-linx-9-1',
    providerUrl: 'https://ids.sealosgzg.site/',
    apiUrl: 'https://apis.sealosgzg.site',
    allowedHosts: 'ids.sealosgzg.site,podss.sealosgzg.site,apis.sealosgzg.site',
  }), [
    { op: 'replace', path: '/spec/template/spec/volumes/1/secret/secretName', value: 'xpod-rc-seed-linx-9-1' },
    { op: 'add', path: '/spec/template/spec/containers/0/env', value: [
      { name: 'CSS_SEED_CONFIG', value: '/app/config/seeds/rc.json' },
      { name: 'CSS_BASE_URL', value: 'https://ids.sealosgzg.site' },
      { name: 'XPOD_API_BASE_URL', value: 'https://apis.sealosgzg.site' },
      { name: 'CSS_ALLOWED_HOSTS', value: 'ids.sealosgzg.site,podss.sealosgzg.site,apis.sealosgzg.site' },
    ] },
    { op: 'replace', path: '/spec/replicas', value: 1 },
  ])
})

test('restore puts the saved seed Secret and env back and scales to 0', () => {
  assert.deepEqual(restorePatch(deployment), [
    { op: 'replace', path: '/spec/template/spec/volumes/1/secret/secretName', value: 'xpod-rc-seed-1-1' },
    { op: 'add', path: '/spec/template/spec/containers/0/env', value: deployment.spec.template.spec.containers[0].env },
    { op: 'replace', path: '/spec/replicas', value: 0 },
  ])
})

test('rejects a deployment without the seed volume', () => {
  assert.throws(() => upPatch({ spec: { template: { spec: { volumes: [], containers: [{ name: 'xpod' }] } } } }, {}), /xpod-rc-seed/)
})
