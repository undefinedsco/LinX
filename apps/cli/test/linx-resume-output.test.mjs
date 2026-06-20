import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('resume output module suppresses upstream Pi resume hints and preserves LinX resume output', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-resume-output.ts')
  t.after(() => cleanup())
  const writes = captureProcessStreamWrites(t, process.stdout)

  await module.withLinxResumeOutputStyle(async () => {
    process.stdout.write('\x1b[2mTo resume this session:')
    process.stdout.write('\x1b[22m pi --session-dir /Users/ganlu/.solid/apps/linx/agent/sessions ')
    process.stdout.write('--session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
    process.stdout.write('Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
  })

  assert.equal(writes.join(''), 'Resume: linx --session 019e5cf6-cbfa-75c2-9d50-5a736c158c17\n')
})

function captureProcessStreamWrites(t, stream) {
  const originalWrite = stream.write
  const writes = []
  stream.write = ((chunk, encodingOrCallback, callback) => {
    writes.push(String(chunk))
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback()
    } else if (typeof callback === 'function') {
      callback()
    }
    return true
  })
  t.after(() => {
    stream.write = originalWrite
  })
  return writes
}
