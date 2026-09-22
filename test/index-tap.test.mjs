/**
 * Standalone proof-of-correctness for the `index.html` transform.
 *
 * Run with plain node:  node test/index-tap.test.mjs
 *
 * Covers: both manifest-link spellings the Harness build has produced, the
 * credential attribute, idempotency, the no-`</head>` fallback, duplicate
 * upstream tags, attribute order and quoting, and the rule that an upstream
 * theme-color is only removed when this plugin is configured to replace it.
 */

import assert from 'node:assert/strict'
import { applyIndexInstallMetadata } from '../src/index-tap.js'
import { resolveSettings } from '../src/settings.js'

const settings = resolveSettings(undefined)
const count = (haystack, needle) => haystack.split(needle).length - 1

/** The built dist shape: relative href, each tag on its own indented line. */
const builtIndex = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '    <link rel="manifest" href="./manifest.webmanifest" />',
  '    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />',
  '    <title>DSH Local Build</title>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
  '',
].join('\n')

const rewritten = applyIndexInstallMetadata(builtIndex, settings)
assert.equal(count(rewritten, 'rel="manifest"'), 1, 'exactly one manifest link remains')
assert.ok(rewritten.includes('<link rel="manifest" href="/pwa/manifest.webmanifest" crossorigin="use-credentials" />'))
assert.ok(rewritten.includes('<link rel="apple-touch-icon" href="/pwa/icon-192.png" />'))
assert.ok(!rewritten.includes('manifest.webmanifest" />'), 'the upstream relative href is gone')
assert.ok(!rewritten.includes('./manifest.webmanifest'))
assert.ok(rewritten.includes('rel="icon" type="image/svg+xml"'), 'unrelated head tags are untouched')
assert.ok(rewritten.includes('<title>DSH Local Build</title>'))
assert.ok(rewritten.indexOf('rel="manifest"') < rewritten.indexOf('</head>'), 'injected inside head')
assert.ok(rewritten.endsWith('\n'))
assert.ok(!/\n\s*\n\s*<\/head>/.test(rewritten), 'no blank line left where the upstream tag was')

// Idempotent: a second pass over its own output is a no-op.
assert.equal(applyIndexInstallMetadata(rewritten, settings), rewritten)

// The source spelling, a duplicate upstream tag, reversed attribute order, and single quotes.
const messy = '<html><head><link href="/manifest.webmanifest" rel="manifest"><link rel="manifest" href="x"><title>t</title></head><body>b</body></html>'
const messyRewritten = applyIndexInstallMetadata(messy, settings)
assert.equal(count(messyRewritten, 'rel="manifest"'), 1)
assert.ok(messyRewritten.includes('href="/pwa/manifest.webmanifest" crossorigin="use-credentials"'))
assert.ok(messyRewritten.includes('<title>t</title>'))
assert.equal(count(messyRewritten, '</head>'), 1)

// Unquoted rel value, and an already-patched link from an earlier deployment.
const unquoted = '<head><link rel=manifest href=./manifest.webmanifest></head>'
const unquotedRewritten = applyIndexInstallMetadata(unquoted, settings)
assert.equal(count(unquotedRewritten, 'rel="manifest"'), 1)
assert.ok(!unquotedRewritten.includes('rel=manifest'), 'the unquoted upstream tag is gone')
assert.ok(unquotedRewritten.includes('crossorigin="use-credentials"'))
assert.equal(applyIndexInstallMetadata(unquotedRewritten, settings), unquotedRewritten)

// No </head>: the metadata is appended rather than dropped, and nothing is lost.
const headless = '<!doctype html><div id="root"></div>\n'
const headlessRewritten = applyIndexInstallMetadata(headless, settings)
assert.ok(headlessRewritten.startsWith(headless), 'the original body is a prefix')
assert.ok(headlessRewritten.includes('rel="manifest" href="/pwa/manifest.webmanifest"'))

// An upstream theme-color survives when this plugin is not configured to replace it...
const withTheme = '<head><meta name="theme-color" content="#000" />\n</head>'
const keptTheme = applyIndexInstallMetadata(withTheme, settings)
assert.ok(keptTheme.includes('<meta name="theme-color" content="#000" />'), 'untouched when unconfigured')
assert.equal(count(keptTheme, 'theme-color'), 1)

// ...and is replaced exactly once when it is.
const themed = resolveSettings({ themeColor: '#151517' })
const replacedTheme = applyIndexInstallMetadata(withTheme, themed)
assert.equal(count(replacedTheme, 'theme-color'), 1)
assert.ok(replacedTheme.includes('<meta name="theme-color" content="#151517" />'))
assert.equal(applyIndexInstallMetadata(replacedTheme, themed), replacedTheme)

// A configured base path reaches every injected tag.
const install = resolveSettings({ path: '/install' })
const installRewritten = applyIndexInstallMetadata(builtIndex, install)
assert.ok(installRewritten.includes('href="/install/manifest.webmanifest"'))
assert.ok(installRewritten.includes('href="/install/icon-192.png"'))

// A non-string body is a wiring bug, not an empty document.
assert.throws(() => applyIndexInstallMetadata(undefined, settings), /index tap received a non-string body/)

console.log('index-tap.test.mjs: ok')
