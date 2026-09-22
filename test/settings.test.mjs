/**
 * Standalone proof-of-correctness for `@lilitoweiwei/dsh-web-pwa`.
 *
 * Run with plain node — this package imports nothing but `node:` builtins, so
 * no Harness tree, no tsx, and no keys are involved:
 *   node test/settings.test.mjs
 *
 * Covers: config resolution and its refusals, the manifest members (including
 * the identity fields that must not drift), and the optional colors.
 */

import assert from 'node:assert/strict'
import {
  APP_ID, DEFAULT_DISPLAY, DEFAULT_NAME, DEFAULT_PATH, DEFAULT_SHORT_NAME,
  resolveSettings,
} from '../src/settings.js'
import { buildManifest, buildManifestBody } from '../src/manifest.js'

const defaults = resolveSettings(undefined)
assert.equal(defaults.path, DEFAULT_PATH)
assert.equal(defaults.manifestPath, `${DEFAULT_PATH}/manifest.webmanifest`)
assert.equal(defaults.iconPath, `${DEFAULT_PATH}/icon-192.png`)
assert.equal(defaults.name, DEFAULT_NAME)
assert.equal(defaults.shortName, DEFAULT_SHORT_NAME)
assert.equal(defaults.display, DEFAULT_DISPLAY)
assert.equal(defaults.themeColor, undefined)
assert.equal(defaults.backgroundColor, undefined)
assert.ok(Object.isFrozen(defaults), 'resolved settings are frozen')

// An empty config object behaves exactly like an omitted one.
assert.deepEqual(resolveSettings({}), defaults)

// Overrides land, and identity fields stay on the shipped values unless overridden.
const custom = resolveSettings({ path: '/install', display: 'standalone', themeColor: '#151517', backgroundColor: '#fff' })
assert.equal(custom.manifestPath, '/install/manifest.webmanifest')
assert.equal(custom.iconPath, '/install/icon-192.png')
assert.equal(custom.display, 'standalone')
assert.equal(custom.themeColor, '#151517')
assert.equal(custom.backgroundColor, '#fff')

// Refusals: every unusable value names itself and the reason.
const refusals = [
  [{ path: 'pwa' }, /config\.path must be an absolute URL path/],
  [{ path: '/pwa/' }, /config\.path must not end with "\/"/],
  [{ path: '/' }, /config\.path must name a subpath/],
  [{ path: '' }, /config\.path must be a non-empty string/],
  [{ name: '' }, /config\.name must be a non-empty string/],
  [{ shortName: 42 }, /config\.shortName must be a non-empty string/],
  [{ startUrl: 'relative' }, /config\.startUrl must be an absolute URL path/],
  [{ scope: 'relative' }, /config\.scope must be an absolute URL path/],
  [{ display: 'full-screen' }, /config\.display must be one of fullscreen, standalone, minimal-ui, browser/],
  [{ themeColor: '' }, /config\.themeColor must be a non-empty string/],
  [{ themeColor: '"><script>' }, /config\.themeColor must be a CSS color/],
  [{ backgroundColor: 'a\nb' }, /config\.backgroundColor must be a CSS color/],
  [[], /config must be a mapping/],
  ['/pwa', /config must be a mapping/],
]
for (const [config, expected] of refusals) {
  assert.throws(() => resolveSettings(config), expected, `expected refusal for ${JSON.stringify(config)}`)
}

// The manifest: identity pins, icon entries with real sizes, colors only when configured.
const manifest = buildManifest(defaults)
assert.equal(manifest.id, APP_ID)
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.name, DEFAULT_NAME)
assert.equal(manifest.short_name, DEFAULT_SHORT_NAME)
assert.equal(manifest.display, 'fullscreen')
assert.equal(manifest.theme_color, undefined, 'no theme_color unless configured')
assert.equal(manifest.background_color, undefined, 'no background_color unless configured')
assert.deepEqual(manifest.icons, [
  { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
])

const colored = buildManifest(custom)
assert.equal(colored.theme_color, '#151517')
assert.equal(colored.background_color, '#fff')
assert.equal(colored.icons[0].src, '/install/icon-192.png')
assert.equal(colored.display, 'standalone')

// The body is JSON a manifest parser accepts, and it round-trips to the object.
const body = buildManifestBody(defaults)
assert.ok(body.endsWith('\n'), 'body ends with a newline')
assert.deepEqual(JSON.parse(body), JSON.parse(JSON.stringify(manifest)))

// No icon is declared `sizes: "any"`: that is the SVG-shaped declaration Chrome resolves to 0x0.
assert.ok(manifest.icons.every((icon) => /^\d+x\d+$/.test(icon.sizes)))

console.log('settings.test.mjs: ok')
