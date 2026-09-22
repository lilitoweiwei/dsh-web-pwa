/**
 * Standalone proof-of-correctness for the plugin's wiring.
 *
 * Run with plain node:  node test/plugin.test.mjs
 *
 * The plugin is applied against a fake Cordis context: `effect` invokes its
 * callback and keeps the disposer (as Cordis does), and `webServer` records the
 * route and tap registrations. Covers: what gets registered, every route's
 * response, the refusals, config overrides, the missing-`</head>` warning, and
 * disposal.
 */

import assert from 'node:assert/strict'
import { apply, inject, name } from '../src/index.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A context that records what the plugin registers, plus one request helper. */
function fakeContext() {
  const routes = []
  const taps = []
  const effects = []
  const logs = []
  const ctx = {
    effect(callback, label) {
      const disposer = callback()
      effects.push({ label, disposer })
      return disposer
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const at = routes.indexOf(route)
          if (at !== -1) routes.splice(at, 1)
        }
      },
      tapIndex(transform) {
        taps.push(transform)
        return () => {
          const at = taps.indexOf(transform)
          if (at !== -1) taps.splice(at, 1)
        }
      },
    },
    logger: {
      info: (message) => logs.push({ level: 'info', message }),
      warn: (message) => logs.push({ level: 'warn', message }),
    },
  }
  return { ctx, routes, taps, effects, logs }
}

/** Run one request through a handler, capturing the response. */
function request(handler, { method = 'GET', url = '/' } = {}) {
  const res = {
    status: undefined,
    headers: undefined,
    body: undefined,
    ended: false,
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.body = body; this.ended = true },
  }
  handler({ method, url }, res)
  return res
}

assert.equal(name, 'web-pwa')
assert.deepEqual(inject, ['webServer'])

// --- mount ---------------------------------------------------------------
const primary = fakeContext()
await apply(primary.ctx, undefined)
assert.equal(primary.routes.length, 1, 'one route subtree')
assert.equal(primary.routes[0].kind, 'prefix')
assert.equal(primary.routes[0].path, '/pwa')
assert.equal(primary.taps.length, 1, 'one index tap')
assert.deepEqual(primary.effects.map((entry) => entry.label), [
  'dsh-web-pwa: install metadata routes',
  'dsh-web-pwa: manifest link',
])
assert.deepEqual(primary.logs, [{ level: 'info', message: 'dsh-web-pwa: serving /pwa/manifest.webmanifest with 3 icons' }])

const handler = primary.routes[0].handler

// --- the manifest --------------------------------------------------------
const manifest = request(handler, { url: '/pwa/manifest.webmanifest' })
assert.equal(manifest.status, 200)
assert.equal(manifest.headers['content-type'], 'application/manifest+json')
assert.equal(manifest.headers['cache-control'], 'no-cache')
const parsed = JSON.parse(manifest.body)
assert.equal(parsed.id, '/')
assert.equal(parsed.start_url, '/')
assert.equal(parsed.display, 'fullscreen')
assert.deepEqual(parsed.icons.map((icon) => [icon.src, icon.sizes, icon.type, icon.purpose]), [
  ['/pwa/icon-192.png', '192x192', 'image/png', 'any'],
  ['/pwa/icon-512.png', '512x512', 'image/png', 'any'],
  ['/pwa/icon-512-maskable.png', '512x512', 'image/png', 'maskable'],
])
assert.equal(parsed.theme_color, undefined)

// A query string does not change the route.
assert.equal(request(handler, { url: '/pwa/manifest.webmanifest?rev=2' }).status, 200)

// --- the icons -----------------------------------------------------------
for (const file of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
  const icon = request(handler, { url: `/pwa/${file}` })
  assert.equal(icon.status, 200, file)
  assert.equal(icon.headers['content-type'], 'image/png')
  assert.equal(icon.headers['cache-control'], 'public, max-age=3600')
  assert.ok(Buffer.isBuffer(icon.body), `${file} is bytes`)
  assert.ok(icon.body.subarray(0, 8).equals(PNG_SIGNATURE), `${file} is a PNG`)
  assert.ok(icon.body.length > 1000, `${file} has content`)
}

// --- refusals ------------------------------------------------------------
assert.equal(request(handler, { url: '/pwa' }).status, 404)
assert.equal(request(handler, { url: '/pwa/' }).status, 404)
assert.equal(request(handler, { url: '/pwa/unknown.png' }).status, 404)
assert.equal(request(handler, { url: '/elsewhere/manifest.webmanifest' }).status, 404)
const rejected = request(handler, { method: 'POST', url: '/pwa/manifest.webmanifest' })
assert.equal(rejected.status, 405)
assert.equal(rejected.headers['content-type'], 'text/plain; charset=utf-8')

// --- HEAD sends headers, no body ----------------------------------------
const head = request(handler, { method: 'HEAD', url: '/pwa/manifest.webmanifest' })
assert.equal(head.status, 200)
assert.equal(head.headers['content-type'], 'application/manifest+json')
assert.equal(head.body, undefined)
assert.equal(head.ended, true)

// --- the tap -------------------------------------------------------------
const tapHtml = '<html><head><link rel="manifest" href="./manifest.webmanifest" /></head><body>x</body></html>'
const tapped = primary.taps[0](tapHtml)
assert.ok(tapped.includes('<link rel="manifest" href="/pwa/manifest.webmanifest" crossorigin="use-credentials" />'))
assert.ok(tapped.includes('<link rel="apple-touch-icon" href="/pwa/icon-192.png" />'))
assert.ok(!tapped.includes('./manifest.webmanifest'))
assert.equal(primary.taps[0](tapped), tapped, 'tap is idempotent')

// A body without </head> is still patched, and says so once.
const headless = '<html><body>x</body></html>'
assert.ok(primary.taps[0](headless).includes('rel="manifest"'))
primary.taps[0](headless)
assert.deepEqual(primary.logs.filter((entry) => entry.level === 'warn'), [{
  level: 'warn',
  message: 'dsh-web-pwa: served index.html has no </head>; install metadata was appended at the end',
}])

// --- config overrides ----------------------------------------------------
const secondary = fakeContext()
await apply(secondary.ctx, { path: '/install', name: 'Harness', shortName: 'H', display: 'standalone', themeColor: '#151517' })
assert.equal(secondary.routes[0].path, '/install')
const installHandler = secondary.routes[0].handler
const installManifest = JSON.parse(request(installHandler, { url: '/install/manifest.webmanifest' }).body)
assert.equal(installManifest.name, 'Harness')
assert.equal(installManifest.short_name, 'H')
assert.equal(installManifest.display, 'standalone')
assert.equal(installManifest.theme_color, '#151517')
assert.equal(installManifest.icons[0].src, '/install/icon-192.png')
assert.equal(request(installHandler, { url: '/pwa/manifest.webmanifest' }).status, 404)
assert.ok(secondary.taps[0](tapHtml).includes('<meta name="theme-color" content="#151517" />'))

// --- a bad config fails the load -----------------------------------------
for (const config of [{ path: 'pwa' }, { display: 'full-screen' }, { themeColor: '"><script>' }, 'nope']) {
  await assert.rejects(apply(fakeContext().ctx, config), /^Error: dsh-web-pwa: config/)
}

// --- disposal ------------------------------------------------------------
primary.effects[0].disposer()
primary.effects[1].disposer()
assert.equal(primary.routes.length, 0)
assert.equal(primary.taps.length, 0)

console.log('plugin.test.mjs: ok')
