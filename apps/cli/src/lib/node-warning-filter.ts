const SHOW_NODE_DEPRECATIONS = process.env.LINX_SHOW_NODE_DEPRECATIONS === '1'

if (!SHOW_NODE_DEPRECATIONS) {
  const originalEmitWarning = process.emitWarning.bind(process) as (...args: unknown[]) => void
  const processWithPatchedWarning = process as unknown as { emitWarning: (...args: unknown[]) => void }

  processWithPatchedWarning.emitWarning = (...args: unknown[]) => {
    if (isPunycodeDeprecation(args)) {
      return
    }
    originalEmitWarning(...args)
  }
}

function isPunycodeDeprecation(args: unknown[]): boolean {
  const warning = args[0]
  const options = args[1]
  const code = warning instanceof Error
    ? (warning as Error & { code?: string }).code
    : typeof options === 'object' && options !== null && 'code' in options
      ? String((options as { code?: unknown }).code ?? '')
      : typeof args[2] === 'string'
        ? args[2]
        : ''

  if (code === 'DEP0040') {
    return true
  }

  const type = typeof options === 'string'
    ? options
    : typeof options === 'object' && options !== null && 'type' in options
      ? String((options as { type?: unknown }).type ?? '')
      : ''
  const message = warning instanceof Error ? warning.message : String(warning ?? '')
  return type === 'DeprecationWarning' && message.includes('punycode')
}
