const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

function resetGuardModule() {
  const modulePath = resolveCompiledDesktopModule('lib/stdio-error-guard.js')
  delete require.cache[require.resolve(modulePath)]
  delete globalThis[Symbol.for('linx.desktop.stdioErrorGuardInstalled')]
  return require(modulePath)
}

function makeThrowingConsoleMethod(errorCode) {
  return () => {
    const error = new Error(`stdio ${errorCode}`)
    error.code = errorCode
    throw error
  }
}

test('stdio guard swallows console writes after stdout is closed', { concurrency: false }, () => {
  const originalLog = console.log
  console.log = makeThrowingConsoleMethod('EIO')

  try {
    const { installStdIoErrorGuard } = resetGuardModule()
    installStdIoErrorGuard()
    assert.doesNotThrow(() => console.log('xpod exited'))
  } finally {
    console.log = originalLog
    delete globalThis[Symbol.for('linx.desktop.stdioErrorGuardInstalled')]
  }
})

test('stdio guard does not swallow unrelated console failures', { concurrency: false }, () => {
  const originalLog = console.log
  console.log = makeThrowingConsoleMethod('EINVAL')

  try {
    const { installStdIoErrorGuard } = resetGuardModule()
    installStdIoErrorGuard()
    assert.throws(() => console.log('real failure'), /stdio EINVAL/)
  } finally {
    console.log = originalLog
    delete globalThis[Symbol.for('linx.desktop.stdioErrorGuardInstalled')]
  }
})
