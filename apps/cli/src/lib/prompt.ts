import { createInterface as createLegacyInterface } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export async function promptText(prompt: string): Promise<string> {
  const rl = createInterface({ input, output })
  try {
    return await rl.question(prompt)
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

    function cleanup(): void {
      stdin.off('data', handleData)
      if (setRawMode) {
        setRawMode(originalRawMode)
      }
      rl.close()
    }

    function handleData(chunk: string | Buffer): void {
      const value = chunk.toString('utf8')

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
            output.write('\b \b')
          }
          break
        default:
          password += value
          output.write('*')
      }
    }

    if (setRawMode) {
      setRawMode(true)
    }

    output.write(prompt)
    stdin.on('data', handleData)
  })
}
