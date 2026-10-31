import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { observeProviderRuntime, assertSameProviderRuntime } from './rc-provider-runtime.mjs'

function fixture() {
  const child = `sha256:${'a'.repeat(64)}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    manifests: [{ digest: child, platform: { os: 'linux', architecture: 'amd64' } }],
  })
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  const image = `ghcr.io/undefinedsco/xpod@${digest}`
  return {
    manifest,
    deployment: { metadata: { uid: 'deployment-1', generation: 4 }, spec: {
      replicas: 1, template: { spec: { containers: [{ name: 'xpod', image }] } },
    }, status: { observedGeneration: 4, readyReplicas: 1, updatedReplicas: 1 } },
    pods: { items: [{ metadata: { uid: 'pod-1' }, spec: { containers: [{ name: 'xpod', image }] },
      status: { phase: 'Running', containerStatuses: [{ name: 'xpod', ready: true,
        imageID: `docker-pullable://ghcr.io/undefinedsco/xpod@${child}`,
        containerID: 'containerd://instance-1', restartCount: 0, state: { running: {} } }] } }] },
  }
}
const observe = (f) => observeProviderRuntime(f.deployment, f.pods, f.manifest)

test('records the immutable selected image and its actual platform child, unchanged across acceptance', () => {
  const f = fixture()
  const before = observe(f)
  const after = observeProviderRuntime(f.deployment, f.pods, `${f.manifest}\n`)
  assert.equal(before.image, f.deployment.spec.template.spec.containers[0].image)
  assert.equal(before.runtimeDigest, `sha256:${'a'.repeat(64)}`)
  assert.deepEqual(assertSameProviderRuntime(before, after), before)
})

test('rejects mutable images, substituted registry bytes and an unlisted runtime digest', () => {
  let f = fixture()
  f.deployment.spec.template.spec.containers[0].image = 'ghcr.io/undefinedsco/xpod:latest'
  assert.throws(() => observe(f), /immutable/)
  f = fixture()
  f.manifest = f.manifest.replace('amd64', 'arm64')
  assert.throws(() => observe(f), /manifest bytes/)
  f = fixture()
  f.pods.items[0].status.containerStatuses[0].imageID = `ghcr.io/undefinedsco/xpod@sha256:${'b'.repeat(64)}`
  assert.throws(() => observe(f), /running backend image/)
})

test('rejects incomplete rollout, multiple running Pods and an unready container', () => {
  let f = fixture()
  f.deployment.status.observedGeneration = 3
  assert.throws(() => observe(f), /converged/)
  f = fixture()
  f.pods.items.push(structuredClone(f.pods.items[0]))
  assert.throws(() => observe(f), /exactly one/)
  f = fixture()
  f.pods.items[0].status.containerStatuses[0].ready = false
  assert.throws(() => observe(f), /not ready/)
})

test('a replacement or restart of the same image invalidates the browser evidence', () => {
  const f = fixture()
  const before = observe(f)
  for (const change of [{ podUid: 'pod-2' }, { containerId: 'containerd://instance-2' },
    { restartCount: 1 }, { generation: 5 }]) {
    assert.throws(() => assertSameProviderRuntime(before, { ...before, ...change }), /changed/)
  }
})
