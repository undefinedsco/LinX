import type { CommandModule } from 'yargs'
import {
  listLinxWhoAmIFields,
  performLinxPasswordLogin,
  type LinxStoredCredentials,
} from '@linx/models/client'
import { clearAccountSession, loadAccountSession, saveAccountSession } from './account-session.js'
import { checkServer, createClientCredentials, getAccountData, login as loginAccount, resolveAccountBaseUrl } from './account-api.js'
import { clearCredentials, getClientCredentials, loadCredentials, saveCredentials } from './credentials-store.js'
import { promptPassword, promptText } from './prompt.js'
import { getAccessToken } from './solid-auth.js'

interface LoginArgs {
  url?: string
  email?: string
  password?: string
  name?: string
  'web-id'?: string
}

interface WhoAmIArgs {
  verbose?: boolean
}

async function requireEmail(argv: LoginArgs): Promise<string> {
  if (argv.email?.trim()) {
    return argv.email.trim()
  }

  const email = (await promptText('Email: ')).trim()
  if (!email) {
    throw new Error('Email is required')
  }

  return email
}

async function requirePassword(argv: LoginArgs): Promise<string> {
  if (argv.password?.trim()) {
    return argv.password
  }

  const password = await promptPassword('Password: ')
  if (!password) {
    throw new Error('Password is required')
  }

  return password
}

async function canReuseLocalClientCredentials(baseUrl: string, webId: string): Promise<boolean> {
  const existing = loadCredentials()
  if (!existing || existing.url !== baseUrl || existing.webId !== webId) {
    return false
  }

  const clientCredentials = getClientCredentials(existing)
  if (!clientCredentials) {
    return false
  }

  const tokenResult = await getAccessToken(clientCredentials.clientId, clientCredentials.clientSecret, baseUrl)
  return tokenResult !== null
}

export const loginCommand: CommandModule<object, LoginArgs> = {
  command: 'login',
  describe: 'Login to LinX cloud and bootstrap local client credentials',
  builder: (yargs) =>
    yargs
      .option('url', {
        alias: 'u',
        type: 'string',
        default: resolveAccountBaseUrl(),
        description: 'Solid / account base URL',
      })
      .option('email', { type: 'string', description: 'Account email' })
      .option('password', { type: 'string', description: 'Account password' })
      .option('name', { type: 'string', description: 'Local client credential label' })
      .option('web-id', { type: 'string', description: 'WebID to bind local client credentials to' }),
  handler: async (argv) => {
    const email = await requireEmail(argv)
    const password = await requirePassword(argv)
    const existingCredentials = loadCredentials()
    const fallbackBaseUrl = resolveAccountBaseUrl()

    const result = await performLinxPasswordLogin({
      baseUrl: argv.url,
      fallbackBaseUrl,
      email,
      password,
      requestedWebId: argv['web-id'],
      credentialName: argv.name,
      existingCredentials: existingCredentials
        ? existingCredentials as LinxStoredCredentials
        : null,
    }, {
      checkServer,
      login: loginAccount,
      getAccountData,
      validateClientCredentials: async (credentials) => canReuseLocalClientCredentials(credentials.url, credentials.webId),
      createClientCredentials,
    })

    if (result.credentialsToSave) {
      saveCredentials(result.credentialsToSave)
    }

    saveAccountSession(result.session)

    process.stdout.write('LinX login successful.\n')
    process.stdout.write(`server: ${result.baseUrl}\n`)
    process.stdout.write(`email: ${email}\n`)
    process.stdout.write(`webId: ${result.webId}\n`)
    process.stdout.write(`local client credentials: ${result.credentialStatus}\n`)
  },
}

export const logoutCommand: CommandModule = {
  command: 'logout',
  describe: 'Remove LinX cloud session and local client credentials',
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
