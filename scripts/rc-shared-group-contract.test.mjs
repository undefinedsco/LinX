import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const workflow = readFileSync(path.join(root, '.github/workflows/candidate.yml'), 'utf8')
const spec = readFileSync(path.join(root, 'tests/e2e/specs/rc-shared-group.spec.ts'), 'utf8')

function stepBody(name) {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  assert.ok(start >= 0, `candidate.yml must keep the step ${name}`)
  const next = workflow.indexOf('\n      - name:', start + marker.length)
  return workflow.slice(start, next < 0 ? undefined : next)
}

test('RC brings up the per-run seed with Bob and both seeded WebIDs', () => {
  const seed = stepBody('Bring up the xpod RC provider with a per-run seed')
  assert.match(seed, /scripts\/rc-provider-seed\.mjs/)
  assert.match(seed, /--github-env "\$GITHUB_ENV"/)
  assert.match(seed, /--provider-url "\$RC_PROVIDER_URL"/)
})

test('the shared-group acceptance is a mandatory RC step on the same xpod-rc provider', () => {
  const shared = stepBody('Shared-group acceptance (Alice and Bob on the real RC provider)')
  assert.match(shared, /LINX_E2E_SHARED_GROUP: '1'/)
  assert.match(shared, /LINX_E2E_CLOUD_IDENTITY_URL: \$\{\{ env\.RC_PROVIDER_URL \}\}/)
  assert.match(shared, /LINX_E2E_BASE_URL: \$\{\{ env\.RC_URL \}\}/)
  assert.match(shared, /specs\/rc-shared-group\.spec\.ts/)
  // The acceptance step itself has no ignore/continue/conditional escape; the
  // following failure-only artifact upload must not be mistaken for a step guard.
  const acceptanceStep = shared.slice(0, shared.indexOf('\n      - uses:'))
  assert.doesNotMatch(acceptanceStep, /continue-on-error|\n\s+if:/)
  // It must run after the provider is up and after the single-account signed-in check.
  assert.ok(workflow.indexOf('Shared-group acceptance') > workflow.indexOf('Signed-in acceptance'))
})

test('local and standalone jobs never claim to run the shared RC acceptance', () => {
  const local = workflow.slice(workflow.indexOf('  local_e2e:'), workflow.indexOf('  standalone_e2e:'))
  const standalone = workflow.slice(workflow.indexOf('  standalone_e2e:'), workflow.indexOf('  build_image:'))
  assert.doesNotMatch(local, /rc-shared-group/)
  assert.doesNotMatch(standalone, /rc-shared-group/)
  assert.doesNotMatch(local, /LINX_E2E_SHARED_GROUP/)
  assert.doesNotMatch(standalone, /LINX_E2E_SHARED_GROUP/)
})

test('the browser flow is bound to the unchanged immutable backend before cleanup and publication', () => {
  const before = stepBody('Bind acceptance to the exact running xpod provider')
  const after = stepBody('Verify the xpod provider stayed unchanged during acceptance')
  assert.match(before, /imagetools inspect "\$provider_image" --raw/)
  assert.match(before, /rc-provider-runtime\.mjs observe/)
  assert.match(after, /rc-provider-runtime\.mjs compare/)
  const positions = ['Bind acceptance to the exact running xpod provider',
    'Signed-in acceptance', 'Shared-group acceptance',
    'Verify the xpod provider stayed unchanged', 'Scale the xpod RC provider back down',
    'Write acceptance record'].map((name) => workflow.indexOf(`- name: ${name}`))
  assert.ok(positions.every((position, i) => position >= 0 && (i === 0 || position > positions[i - 1])))
  assert.match(workflow, /rcUrl, provider, providerRuntime, runUrl/)
  const promote = readFileSync(path.join(root, '.github/workflows/promote.yml'), 'utf8')
  assert.match(promote, /missing exact xpod provider runtime evidence/)
})

test('the shared-group spec is a real two-browser UI flow with no credential artifacts', () => {
  assert.match(spec, /test\.use\(\{ trace: 'off', screenshot: 'off', video: 'off' \}\)/)
  assert.match(spec, /LINX_E2E_BOB_ACCOUNT_WEBID/)
  assert.match(spec, /browser\.newContext\(\)/)
  assert.match(spec, /添加朋友、创建助手/)
  assert.match(spec, /创建群组/)
  assert.match(spec, /getByRole\('textbox', \{ name: '消息' \}\)/)
  assert.match(spec, /toBeVisible\(\{ timeout: 60_000 \}\)/)
  assert.match(spec, /reload\(/)
  // Real identities only: no API-only room creation, no per-request auth
  // substitution, no shared storage state between the two contexts.
  assert.doesNotMatch(spec, /page\.request|request\.(?:get|post|put)|storageState|addInitScript|__matrix/i)
  // The only skip is the explicit non-RC guard; RC must fail on missing inputs.
  const skips = spec.match(/test\.skip\(/g) ?? []
  assert.equal(skips.length, 1)
  assert.match(spec, /test\.skip\(!enabled,/)
  assert.match(spec, /requiredEnv\('LINX_E2E_BOB_ACCOUNT_WEBID'\)/)
})

test('the shared-group failure artifacts are dropped before any upload, fail-closed', () => {
  const cleanupMarker = '      - name: Drop the shared-group spec\'s failure artifacts before upload\n'
  const cleanupStart = workflow.indexOf(cleanupMarker)
  assert.ok(cleanupStart >= 0, 'candidate.yml must sanitize shared-group artifacts before upload')
  const cleanup = stepBody("Drop the shared-group spec's failure artifacts before upload")
  // It must actually invoke the helper on the RC results tree.
  assert.match(cleanup, /node scripts\/rc-shared-group-artifact-cleanup\.mjs/)
  assert.match(cleanup, /tests\/e2e\/test-results/)
  // always(): the evidence it sanitizes only exists after a failure.
  assert.match(cleanup, /if: always\(\)/)
  // A guarded upload needs a step id to read the cleanup outcome from.
  assert.match(cleanup, /id: \s*shared_group_cleanup/)

  const upload = workflow.slice(workflow.indexOf('      - uses: actions/upload-artifact@v4', cleanupStart))
  const uploadStep = upload.slice(0, upload.indexOf('\n      - '))
  assert.match(uploadStep, /rc-acceptance-results-/)
  // Fail closed: only upload the sanitized tree, and only when cleanup succeeded.
  assert.match(uploadStep, /if: failure\(\) && steps\.shared_group_cleanup\.outcome == 'success'/)
  // The cleanup must be ordered before the upload it protects.
  assert.ok(cleanupStart < workflow.indexOf('      - uses: actions/upload-artifact@v4', cleanupStart))
  // Exactly one upload of the RC results tree remains, so no unguarded copy lingers.
  const rcUploads = workflow.match(/name: rc-acceptance-results-\$\{\{ github\.sha \}\}/g) ?? []
  assert.equal(rcUploads.length, 1)

  // The acceptance step itself stays mandatory: no continue-on-error, no if-guard.
  const shared = stepBody('Shared-group acceptance (Alice and Bob on the real RC provider)')
  const acceptanceStep = shared.slice(0, shared.indexOf('\n      - uses:'))
  assert.doesNotMatch(acceptanceStep, /continue-on-error|\n\s+if:/)

  // The workflow's own cleanup step must stay after acceptance and before upload,
  // and provider restore / seed cleanup must still run unconditionally.
  const order = ['Shared-group acceptance', "Drop the shared-group spec's failure artifacts before upload",
    'rc-acceptance-results-'].map((needle) => workflow.indexOf(needle))
  assert.ok(order.every((position, i) => position >= 0 && (i === 0 || position > order[i - 1])))
  assert.match(stepBody('Scale the xpod RC provider back down'), /^\s+if: always\(\)$/m)
})
