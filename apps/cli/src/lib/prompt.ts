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
