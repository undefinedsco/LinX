import { Session } from '@inrupt/solid-client-authn-node'

export interface PodAuth {
  session: Session
  apiKey: string
}

export async function authenticate(
  clientId: string,
  clientSecret: string,
  oidcIssuer: string,
): Promise<PodAuth> {
  const session = new Session()

  await session.login({
    clientId,
    clientSecret,
    oidcIssuer,
    tokenType: 'Bearer',
  })

  if (!session.info.isLoggedIn) {
    throw new Error('Failed to authenticate with Pod')
  }

  const credentials = `${clientId}:${clientSecret}`
  const apiKey = `sk-${Buffer.from(credentials, 'utf-8').toString('base64')}`

  return { session, apiKey }
}
