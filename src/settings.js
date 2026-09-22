/**
 * Plugin settings: the plain config object a loader entry passes, resolved and
 * validated into the frozen value the manifest, index tap, and route handler
 * all read. Pure — no Harness imports, no I/O, no `schemastery` schema.
 *
 * A `schemastery` `Config` export would validate at load, but this package is
 * loaded by absolute path from outside the Harness tree, where bare
 * `@deepseek-ai/*` specifiers resolve only under the source launcher's tsx
 * path mapping. Importing nothing but `node:` builtins keeps the plugin
 * loadable under every launch mode (and lets `node test/*.test.mjs` run
 * without tsx). Validation therefore happens here, once, and throws.
 *
 * @module @lilitoweiwei/dsh-web-pwa/settings
 */

/** Base path of the plugin's own routes. */
export const DEFAULT_PATH = '/pwa'

/** App identity: the values the shipped Harness manifest already uses, so an app installed from an unpatched deployment keeps its identity. */
export const DEFAULT_NAME = 'DeepSeek Harness'

/** Short name shown under the launcher icon; see {@link DEFAULT_NAME}. */
export const DEFAULT_SHORT_NAME = 'DSH'

/** Launch URL; a change here re-identifies the installed app. */
export const DEFAULT_START_URL = '/'

/** Navigation scope; a change here re-identifies the installed app. */
export const DEFAULT_SCOPE = '/'

/** Display mode. `fullscreen` matches the shipped manifest; the launcher then shows no browser UI. */
export const DEFAULT_DISPLAY = 'fullscreen'

/** Display modes a Web App Manifest may declare and a browser will accept for install. */
const DISPLAY_MODES = Object.freeze(['fullscreen', 'standalone', 'minimal-ui', 'browser'])

/** Manifest `id`, which pins app identity: never derived from config, because changing it makes the browser treat the app as a new one. */
export const APP_ID = '/'

/** `typeof` test that also rejects arrays, used for the plain-object config. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one string setting, defaulting when absent and throwing when present but unusable. */
function stringSetting(config, key, fallback, validate) {
  const value = config[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`dsh-web-pwa: config.${key} must be a non-empty string`)
  }
  validate(value, key)
  return value
}

/** Reject a CSS color that cannot survive being written into a manifest and a `content` attribute. */
function assertColor(value, key) {
  if (/["'<>\\\r\n]/.test(value)) {
    throw new Error(`dsh-web-pwa: config.${key} must be a CSS color without quotes or angle brackets`)
  }
}

/** Reject a base path that would not be an absolute URL path, or that keeps a trailing slash the route table would double. */
function assertPath(value) {
  if (!value.startsWith('/')) {
    throw new Error(`dsh-web-pwa: config.path must be an absolute URL path starting with "/" (got ${JSON.stringify(value)})`)
  }
  if (value.length > 1 && value.endsWith('/')) {
    throw new Error(`dsh-web-pwa: config.path must not end with "/" (got ${JSON.stringify(value)})`)
  }
  if (value === '/') {
    throw new Error('dsh-web-pwa: config.path must name a subpath ("/" would own the whole origin)')
  }
}

/** Reject a route the manifest or icons could not be reached at. */
function assertAbsolutePath(value, key) {
  if (!value.startsWith('/')) {
    throw new Error(`dsh-web-pwa: config.${key} must be an absolute URL path starting with "/" (got ${JSON.stringify(value)})`)
  }
}

/**
 * Resolve and validate a loader entry's config.
 * @param config - the entry's `config` value, or undefined when the entry omits it.
 * @returns frozen settings every other module in this package reads.
 */
export function resolveSettings(config) {
  if (config !== undefined && !isRecord(config)) {
    throw new Error('dsh-web-pwa: config must be a mapping')
  }
  const source = config ?? {}
  const path = stringSetting(source, 'path', DEFAULT_PATH, assertPath)
  const display = stringSetting(source, 'display', DEFAULT_DISPLAY, (value) => {
    if (!DISPLAY_MODES.includes(value)) {
      throw new Error(`dsh-web-pwa: config.display must be one of ${DISPLAY_MODES.join(', ')} (got ${JSON.stringify(value)})`)
    }
  })
  const themeColor = source.themeColor === undefined
    ? undefined
    : stringSetting(source, 'themeColor', undefined, assertColor)
  const backgroundColor = source.backgroundColor === undefined
    ? undefined
    : stringSetting(source, 'backgroundColor', undefined, assertColor)
  return Object.freeze({
    path,
    manifestPath: `${path}/manifest.webmanifest`,
    iconPath: `${path}/icon-192.png`,
    name: stringSetting(source, 'name', DEFAULT_NAME, () => {}),
    shortName: stringSetting(source, 'shortName', DEFAULT_SHORT_NAME, () => {}),
    startUrl: stringSetting(source, 'startUrl', DEFAULT_START_URL, assertAbsolutePath),
    scope: stringSetting(source, 'scope', DEFAULT_SCOPE, assertAbsolutePath),
    display,
    themeColor,
    backgroundColor,
  })
}
