import { createInterface as createLegacyInterface } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export async function promptText(prompt: string, signal?: AbortSignal): Promise<string> {
  const rl = createInterface({ input, output })
  try {
    return signal
      ? await rl.question(prompt, { signal })
      : await rl.question(prompt)
  } finally {
    rl.close()
  }
}

export async function promptPassword(prompt: string): Promise<string> {
  return await new Promise((resolve) => {
    const rl = createLegacyInterface({ input, output })
    const stdin = process.stdin
    const setRawMode = 'setRawMode' in stdin ? stdin.setRawMode.bind(stdin) : null
    const originalRawMode = setRawMode ? Boolean(stdin.isRaw) : false
    let password = ''
    let cleanedLine = false

    function cleanup(): void {
      stdin.off('data', handleData)
      if (setRawMode) {
        setRawMode(originalRawMode)
      }
      rl.close()
    }

    function handleData(chunk: string | Buffer): void {
      const value = chunk.toString('utf8')

      if (!cleanedLine) {
        output.write('\r')
        output.write(' '.repeat(prompt.length + Math.max(password.length, 1) + 8))
        output.write('\r')
        output.write(prompt)
        output.write('*'.repeat(password.length))
        cleanedLine = true
      }

      switch (value) {
        case '\n':
        case '\r':
        case '\u0004':
          cleanup()
          output.write('\n')
          resolve(password)
          break
        case '\u0003':
          cleanup()
          process.exit(1)
        case '\u007f':
        case '\b':
          if (password.length > 0) {
            password = password.slice(0, -1)
            output.write('\r')
            output.write(prompt)
            output.write('*'.repeat(password.length))
            output.write(' ')
            output.write('\r')
            output.write(prompt)
            output.write('*'.repeat(password.length))
          }
          break
        default:
          {
            const normalized = value.replace(/\r/g, '').replace(/\n/g, '')
            if (!normalized) {
              break
            }
            password += normalized
            output.write('*'.repeat(normalized.length))
          }
      }
    }

    if (setRawMode) {
      setRawMode(true)
    }

    output.write(prompt)
    stdin.on('data', handleData)
  })
}
