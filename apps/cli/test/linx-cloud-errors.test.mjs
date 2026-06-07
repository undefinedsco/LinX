import test from 'node:test'
import assert from 'node:assert/strict'

test('formatLinxCliErrorMessage rewrites cloud completion timeouts mislabeled as Pod requests', async () => {
  const { formatLinxCliErrorMessage } = await import('../dist/lib/linx-cloud-errors.js')

  for (const input of [
    'LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions',
    'Error: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions',
    'Retry failed after 3 attempts: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions.',
    '\u001b[31mError: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions\u001b[0m',
  ]) {
    assert.equal(formatLinxCliErrorMessage(input), 'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.')
  }
})

test('formatLinxCliErrorMessage preserves real Pod data request timeouts', async () => {
  const { formatLinxCliErrorMessage } = await import('../dist/lib/linx-cloud-errors.js')

  const input = 'LinX Pod request timed out after 30s: POST https://id.undefineds.co/gcloud/.data/chat/index.ttl'

  assert.equal(formatLinxCliErrorMessage(input), input)
})
