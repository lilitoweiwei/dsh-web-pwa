/**
 * `@lilitoweiwei/dsh-web-pwa`: install metadata for an installed DSH Web app.
 * A function plugin (NOT a default-export service) that owns two contributions:
 *
 * - a named route subtree (`config.path`, default `/pwa`) serving a Web App
 *   Manifest and the raster icons it references, and
 * - an `index.html` tap pointing the browser's manifest link at that route with
 *   `crossorigin="use-credentials"`.
 *
 * Both exist because browsers, not this deployment, decide the rules: Chrome
 * resolves an SVG manifest icon declared `"sizes": "any"` to `0x0` and then
 * refuses to install (crbug.com/40925759), and it fetches a manifest with
 * credentials omitted, so an authenticating reverse proxy in front of DSH
 * answers with its login page. Routing the manifest through this plugin keeps
 * that fix outside `apps/web/dist` (which every `pnpm run build:web` replaces)
 * and outside the Harness source tree.
 *
 * The plugin declares `inject: ['webServer']` statically, so its `apply` runs
 * only once the service exists — the property read is authorized by that
 * declaration rather than by a load-order accident.
 *
 * @module @lilitoweiwei/dsh-web-pwa
 */

import { loadIconAssets, ICON_CONTENT_TYPE } from './assets.js'
import { applyIndexInstallMetadata } from './index-tap.js'
import { buildManifestBody } from './manifest.js'
import { resolveSettings } from './settings.js'

/** Stable Cordis plugin name; also the recommended loader entry id. */
export const name = 'web-pwa'

/** The route registry and index tap both come from the webserver service. */
export const inject = ['webServer']

/** Content type for the manifest body. */
const MANIFEST_CONTENT_TYPE = 'application/manifest+json'

/** Content type for refusal responses. */
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8'

/** The manifest is small and identity-bearing: revalidate it on every page load. */
const MANIFEST_CACHE_CONTROL = 'no-cache'

/** Icons are content-addressed only by name, so a redesign must expire within the hour. */
const ICON_CACHE_CONTROL = 'public, max-age=3600'

/** Answer one request, owning the whole response lifecycle. */
function respond(req, res, status, contentType, body, cacheControl) {
  const headers = { 'content-type': contentType }
  if (cacheControl !== undefined) headers['cache-control'] = cacheControl
  res.writeHead(status, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
}

/** Build the route handler for one settings value. */
function createHandler(settings, icons, manifestBody) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respond(req, res, 405, TEXT_CONTENT_TYPE, 'method not allowed\n')
      return
    }
    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://dsh.invalid').pathname
    } catch {
      // node:http supplies a parsable url; a shape it cannot parse is answered here because this handler owns the response.
      respond(req, res, 400, TEXT_CONTENT_TYPE, 'bad request\n')
      return
    }
    const route = pathname.slice(settings.path.length)
    if (route === '/manifest.webmanifest') {
      respond(req, res, 200, MANIFEST_CONTENT_TYPE, manifestBody, MANIFEST_CACHE_CONTROL)
      return
    }
    const icon = route.startsWith('/') ? icons.get(route.slice(1)) : undefined
    if (icon !== undefined) {
      respond(req, res, 200, ICON_CONTENT_TYPE, icon, ICON_CACHE_CONTROL)
      return
    }
    respond(req, res, 404, TEXT_CONTENT_TYPE, 'not found\n')
  }
}

/**
 * Mount the install metadata: icon bytes are read once (an incomplete package
 * fails the load), then the route subtree and the index tap are registered as
 * effects so both are removed with the plugin.
 * @param ctx - plugin context carrying the {@link webServer} service.
 * @param config - loader entry config; see {@link resolveSettings} for the accepted fields.
 */
export async function apply(ctx, config) {
  const settings = resolveSettings(config)
  const icons = await loadIconAssets()
  const manifestBody = buildManifestBody(settings)

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: settings.path,
      handler: createHandler(settings, icons, manifestBody),
    }),
    'dsh-web-pwa: install metadata routes',
  )

  let warnedAboutHead = false
  ctx.effect(
    () => ctx.webServer.tapIndex((html) => {
      if (!warnedAboutHead && !/<\/head/i.test(html)) {
        warnedAboutHead = true
        ctx.logger?.warn?.('dsh-web-pwa: served index.html has no </head>; install metadata was appended at the end')
      }
      return applyIndexInstallMetadata(html, settings)
    }),
    'dsh-web-pwa: manifest link',
  )

  ctx.logger?.info?.(`dsh-web-pwa: serving ${settings.manifestPath} with ${String(icons.size)} icons`)
}
