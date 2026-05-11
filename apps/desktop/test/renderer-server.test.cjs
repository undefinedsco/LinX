const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { tmpdir } = require('node:os')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  RendererStaticServer,
  resolveRendererServerPort,
} = require(resolveCompiledDesktopModule('lib/renderer-server.js'))

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        resolve({ statusCode: response.statusCode, headers: response.headers, body })
      })
    }).on('error', reject)
  })
}

test('RendererStaticServer serves assets and falls back SPA routes to index.html', async (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'linx-renderer-'))
  const assetDir = path.join(root, 'assets')
  fs.mkdirSync(assetDir)
  fs.writeFileSync(path.join(root, 'index.html'), '<html><script src="/assets/app.js"></script></html>')
  fs.writeFileSync(path.join(assetDir, 'app.js'), 'console.log("linx")')

  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const server = new RendererStaticServer({ preferredPort: 0 })
  t.after(async () => {
    await server.stop().catch(() => undefined)
  })

  const baseUrl = await server.prepareUrl(path.join(root, 'index.html'))
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/)

  const index = await request(baseUrl)
  assert.equal(index.statusCode, 200)
  assert.equal(index.headers['content-type'], 'text/html; charset=utf-8')
  assert.match(index.body, /app\.js/)

  const asset = await request(new URL('/assets/app.js', baseUrl).href)
  assert.equal(asset.statusCode, 200)
  assert.equal(asset.headers['content-type'], 'text/javascript; charset=utf-8')
  assert.equal(asset.body, 'console.log("linx")')

  const callbackRoute = await request(new URL('/auth/callback?code=abc&state=xyz', baseUrl).href)
  assert.equal(callbackRoute.statusCode, 200)
  assert.equal(callbackRoute.headers['content-type'], 'text/html; charset=utf-8')
  assert.match(callbackRoute.body, /app\.js/)

  const missingAsset = await request(new URL('/assets/missing.js', baseUrl).href)
  assert.equal(missingAsset.statusCode, 404)
})

test('resolveRendererServerPort uses stable default and accepts explicit env override', () => {
  assert.equal(resolveRendererServerPort({}), 42137)
  assert.equal(resolveRendererServerPort({ LINX_DESKTOP_RENDERER_PORT: '0' }), 0)
  assert.equal(resolveRendererServerPort({ LINX_DESKTOP_RENDERER_PORT: '43123' }), 43123)
  assert.equal(resolveRendererServerPort({ LINX_DESKTOP_RENDERER_PORT: 'bad' }), 42137)
})
