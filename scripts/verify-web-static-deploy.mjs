import process from 'node:process'

export function collectStaticAssetUrls(html, pageUrl) {
  const assets = new Set()
  const attributePattern = /\b(?:src|href)=["']([^"']+)["']/gi

  for (const match of html.matchAll(attributePattern)) {
    const value = match[1]
    if (!value || value.startsWith('data:') || value.startsWith('#')) continue

    const assetUrl = new URL(value, pageUrl)
    if (assetUrl.origin === pageUrl.origin) assets.add(assetUrl.href)
  }

  return [...assets]
}

export async function verifyWebStaticDeploy(rawUrl, fetchImpl = fetch) {
  const pageUrl = new URL(rawUrl)
  const pageResponse = await fetchImpl(pageUrl, { redirect: 'follow' })
  if (!pageResponse.ok) {
    throw new Error(`page returned HTTP ${pageResponse.status}: ${pageUrl.href}`)
  }

  const html = await pageResponse.text()
  const assetUrls = collectStaticAssetUrls(html, pageUrl)
  if (assetUrls.length === 0) throw new Error('page did not reference any same-origin static assets')

  const failures = []
  await Promise.all(assetUrls.map(async (assetUrl) => {
    const response = await fetchImpl(assetUrl, { redirect: 'follow' })
    const contentType = response.headers.get('content-type') ?? ''
    const isScript = /\.m?js(?:\?|$)/i.test(assetUrl)
    const returnedHtmlForScript = isScript && contentType.includes('text/html')

    if (!response.ok || returnedHtmlForScript) {
      failures.push(`${response.status} ${contentType || 'unknown content type'} ${assetUrl}`)
    }
  }))

  if (failures.length > 0) {
    throw new Error(`static deployment is incomplete:\n${failures.join('\n')}`)
  }

  return { pageUrl: pageUrl.href, assetCount: assetUrls.length }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node scripts/verify-web-static-deploy.mjs <url>')
    process.exitCode = 2
  } else {
    verifyWebStaticDeploy(target)
      .then(({ pageUrl, assetCount }) => console.log(`Verified ${assetCount} assets for ${pageUrl}`))
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
