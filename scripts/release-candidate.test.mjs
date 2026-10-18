import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCandidate } from './release-candidate.mjs'

const sha = '0b5772dd808c78c549b8828177478ccc65415c60'

test('a staging push becomes <version>-rc.<run>', () => {
  assert.deepEqual(resolveCandidate({ branch: 'staging', runNumber: '7', runAttempt: '1', sha, version: '0.3.34' }), {
    candidate: '0.3.34-rc.7',
    sourceSha: sha,
    shaTag: `sha-${sha}`,
    version: '0.3.34',
  })
})

test('a whole-workflow rerun keeps the run number and adds the attempt', () => {
  assert.equal(resolveCandidate({ branch: 'staging', runNumber: '7', runAttempt: '2', sha, version: '0.3.34' }).candidate, '0.3.34-rc.7.2')
})

test('only staging produces candidates', () => {
  assert.throws(() => resolveCandidate({ branch: 'main', runNumber: '7', runAttempt: '1', sha, version: '0.3.34' }), /staging/)
})

test('rejects short shas and non-SemVer versions', () => {
  assert.throws(() => resolveCandidate({ branch: 'staging', runNumber: '7', runAttempt: '1', sha: '0b5772dd', version: '0.3.34' }), /full commit sha/)
  assert.throws(() => resolveCandidate({ branch: 'staging', runNumber: '7', runAttempt: '1', sha, version: 'v0.3' }), /X\.Y\.Z/)
})
