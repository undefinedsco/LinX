import assert from 'node:assert/strict'
import test from 'node:test'

import { collectStaticAssetUrls, verifyWebStaticDeploy } from './verify-web-static-deploy.mjs'

test('collects only same-origin assets and resolves relative paths', () => {
  const pageUrl = new URL('https://example.test/chat')
  const html = `
    <link rel="stylesheet" href="/assets/app.css">
    <script src="assets/app.js"></script>
    <script src="https://cdn.example.test/chatkit.js"></script>
  `

  assert.deepEqual(collectStaticAssetUrls(html, pageUrl), [
    'https://example.test/assets/app.css',
    'https://example.test/assets/app.js',
  ])
})

test('rejects a deployment whose entry script is missing', async () => {
  const responses = new Map([
    ['https://example.test/chat', new Response('<script src="/assets/missing.js"></script>', {
      headers: { 'content-type': 'text/html' },
    })],
    ['https://example.test/assets/missing.js', new Response('not found', { status: 404 })],
  ])

  await assert.rejects(
    verifyWebStaticDeploy('https://example.test/chat', async (url) => responses.get(String(url))),
    /static deployment is incomplete/,
  )
})

test('accepts a deployment with reachable entry assets', async () => {
  const responses = new Map([
    ['https://example.test/chat', new Response(`
      <link rel="stylesheet" href="/assets/app.css">
      <script src="/assets/app.js"></script>
    `, { headers: { 'content-type': 'text/html' } })],
    ['https://example.test/assets/app.css', new Response('body {}', {
      headers: { 'content-type': 'text/css' },
    })],
    ['https://example.test/assets/app.js', new Response('export {}', {
      headers: { 'content-type': 'text/javascript' },
    })],
  ])

  const result = await verifyWebStaticDeploy(
    'https://example.test/chat',
    async (url) => responses.get(String(url)),
  )
  assert.equal(result.assetCount, 2)
})
