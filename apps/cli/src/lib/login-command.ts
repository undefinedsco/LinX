import type { CommandModule } from 'yargs'
import {
  listLinxWhoAmIFields,
} from '@undefineds.co/models/client'
import { clearAccountSession, loadAccountSession } from './account-session.js'
import { clearCredentials } from './credentials-store.js'
import { ensureBrowserConsentLogin, openBrowser } from './oidc-auth.js'
import { resolveAccountBaseUrl } from './account-api.js'
import { promptText } from './prompt.js'

interface LoginArgs {
  url?: string
}

interface WhoAmIArgs {
  verbose?: boolean
}

export const loginCommand: CommandModule<object, LoginArgs> = {
  command: 'login',
  describe: 'Login to LinX cloud in the browser and persist the local OIDC session',
  builder: (yargs) =>
    yargs
      .option('url', {
        alias: 'u',
        type: 'string',
        default: resolveAccountBaseUrl(),
        description: 'Solid / account issuer URL',
      }),
  handler: async (argv) => {
    let browserLoginStarted = false
    const result = await ensureBrowserConsentLogin({
      issuerUrl: argv.url,
      onAuthUrl(url) {
        browserLoginStarted = true
        process.stdout.write('Opening LinX Cloud login in your browser...\n')
        process.stdout.write(`${url}\n\n`)
        process.stdout.write('Complete LinX Cloud consent in your browser. If the browser cannot return to this terminal, paste the final redirect URL below.\n')
      },
      openBrowser,
      async manualRedirectUrl(signal) {
        return (await promptText('redirect URL (leave empty to keep waiting): ', signal)).trim()
      },
    })

    if (browserLoginStarted) {
      process.stdout.write('\n')
    }
    process.stdout.write('LinX login successful.\n')
    process.stdout.write(`server: ${result.url}\n`)
    process.stdout.write(`webId: ${result.webId}\n`)
    process.stdout.write('auth: oidc_oauth\n')
    process.stdout.write(`session: ${result.reusedExistingSession ? 'reused' : 'browser-consent'}\n`)
    process.exit(0)
  },
}

export const logoutCommand: CommandModule = {
  command: 'logout',
  describe: 'Remove LinX cloud session and local credentials',
  handler: async () => {
    clearAccountSession()
    clearCredentials()
    process.stdout.write('Logged out. Local LinX credentials removed.\n')
  },
}

export const whoamiCommand: CommandModule<object, WhoAmIArgs> = {
  command: 'whoami',
  describe: 'Show the current LinX login identity',
  builder: (yargs) => yargs.option('verbose', { type: 'boolean', default: false }),
  handler: async (argv) => {
    const account = loadAccountSession()
    if (!account) {
      throw new Error('Not logged in. Run `linx login` first.')
    }

    for (const field of listLinxWhoAmIFields(account, { verbose: argv.verbose })) {
      process.stdout.write(`${field.key}: ${field.value}\n`)
    }
  },
}
