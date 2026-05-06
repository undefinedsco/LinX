import test from 'node:test'
import assert from 'node:assert/strict'

test('node warning filter suppresses punycode DEP0040 warning only', async () => {
  const originalEmitWarning = process.emitWarning
  const calls = []
  process.emitWarning = (...args) => {
    calls.push(args)
  }

  try {
    await import(`../dist/lib/node-warning-filter.js?test=${Date.now()}`)

    process.emitWarning('The `punycode` module is deprecated. Please use a userland alternative instead.', 'DeprecationWarning', 'DEP0040')
    process.emitWarning('other warning', 'DeprecationWarning', 'DEP9999')

    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], 'other warning')
  } finally {
    process.emitWarning = originalEmitWarning
  }
})
