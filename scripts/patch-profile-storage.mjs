import 'dotenv/config'
import { Session } from '@inrupt/solid-client-authn-node'
import { getSolidDataset, getThing, setThing, saveSolidDatasetAt, addUrl, getUrl } from '@inrupt/solid-client'

const env = {
  webId: process.env.SOLID_WEBID || 'http://localhost:3000/test/profile/card#me',
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER || 'http://localhost:3000',
}

const PIM_STORAGE = 'http://www.w3.org/ns/pim/space#storage'

async function run() {
  console.log('Logging in...')
  const session = new Session()
  await session.login({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    oidcIssuer: env.oidcIssuer,
    tokenType: 'DPoP',
  })
  console.log('Logged in as', session.info.webId)

  const webId = session.info.webId
  const profileUrl = webId.split('#')[0]

  console.log('Fetching profile:', profileUrl)
  let dataset = await getSolidDataset(profileUrl, { fetch: session.fetch })
  let profile = getThing(dataset, webId)

  if (!profile) {
    console.error('Profile not found in dataset')
    return
  }

  const existingStorage = getUrl(profile, PIM_STORAGE)
  if (existingStorage) {
    console.log('✅ Storage already set to:', existingStorage)
    return
  }

  // Calculate storage root (parent of profile)
  // http://localhost:3000/test/profile/card -> http://localhost:3000/test/
  const storageRoot = new URL(profileUrl).href.replace(/\/profile\/card$/, '/')
  
  console.log('⚠️ Storage not set. Adding pim:storage ->', storageRoot)

  profile = addUrl(profile, PIM_STORAGE, storageRoot)
  dataset = setThing(dataset, profile)

  await saveSolidDatasetAt(profileUrl, dataset, { fetch: session.fetch })
  console.log('✅ Profile updated successfully!')
}

run().catch(console.error)
