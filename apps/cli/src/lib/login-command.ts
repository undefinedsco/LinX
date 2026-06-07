import type { CommandModule } from 'yargs'
import {
  listLinxWhoAmIFields,
} from '@undefineds.co/models/client'
import { clearAccountSession, loadAccountSession } from './account-session.js'
import { clearCredentials } from './credentials-store.js'
import { ensureBrowserConsentLogin, openBrowser } from './oidc-auth.js'
import { clearOidcSessionStorage } from './oidc-session-storage.js'
import { resolveAccountBaseUrl } from './account-api.js'
import { promptText } from './prompt.js'

interface LoginArgs {
  url?: string
  fresh?: boolean
  force?: boolean
}

interface WhoAmIArgs {
  verbose?: boolean
}

interface LoginCommandDeps {
  ensureBrowserConsentLogin?: typeof ensureBrowserConsentLogin
  openBrowser?: typeof openBrowser
  promptText?: typeof promptText
  write?: (chunk: string) => unknown
}

interface LogoutCommandDeps {
  write?: (chunk: string) => unknown
}

export async function runLinxLoginCommand(
  argv: LoginArgs,
  deps: LoginCommandDeps = {},
): Promise<void> {
  const doBrowserConsentLogin = deps.ensureBrowserConsentLogin ?? ensureBrowserConsentLogin
  const doOpenBrowser = deps.openBrowser ?? openBrowser
  const doPromptText = deps.promptText ?? promptText
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk))

  let browserLoginStarted = false
  const forceFresh = argv.fresh === true || argv.force === true
  const result = await doBrowserConsentLogin({
    issuerUrl: argv.url,
    forceFresh,
    onAuthUrl(url) {
      browserLoginStarted = true
      write('Opening LinX Cloud login in your browser...\n')
      write(`${url}\n\n`)
      write('Complete LinX Cloud consent in your browser. If the browser cannot return to this terminal, paste the final redirect URL below.\n')
    },
    openBrowser: doOpenBrowser,
    async manualRedirectUrl(signal) {
      return (await doPromptText('redirect URL (leave empty to keep waiting): ', signal)).trim()
    },
  })

  if (browserLoginStarted) {
    write('\n')
  }
  write('LinX login successful.\n')
  write(`server: ${result.url}\n`)
  write(`webId: ${result.webId}\n`)
  write('auth: oidc_oauth\n')
  write(`session: ${result.reusedExistingSession ? 'reused' : 'browser-consent'}\n`)
}

export function runLinxLogoutCommand(deps: LogoutCommandDeps = {}): void {
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk))
  clearAccountSession()
  clearCredentials()
  clearOidcSessionStorage()
  write('Logged out. Local Solid auth credentials removed.\n')
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
      })
      .option('fresh', {
        alias: 'force',
        type: 'boolean',
        default: false,
        description: 'Ignore saved LinX OIDC session and start a fresh browser consent flow',
      }),
  handler: async (argv) => {
    await runLinxLoginCommand(argv)
    process.exit(0)
  },
}

export const logoutCommand: CommandModule = {
  command: 'logout',
  describe: 'Remove LinX cloud session and local credentials',
  handler: async () => {
    runLinxLogoutCommand()
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
