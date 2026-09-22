/**
 * Web App Manifest assembly. Pure: no Harness imports, no I/O.
 *
 * Identity fields (`id`, and by default `start_url`/`scope`) are deliberately
 * left at the values the shipped Harness manifest already declares, so a
 * deployment that switches from a patched manifest to this plugin keeps the
 * app identity of anything already installed. Only the icon URLs (and the
 * optional colors) differ.
 *
 * @module @lilitoweiwei/dsh-web-pwa/manifest
 */

import { APP_ID } from './settings.js'
import { ICON_ASSETS, ICON_CONTENT_TYPE } from './assets.js'

/**
 * Build the manifest object for one settings value.
 * @param settings - resolved settings from {@link resolveSettings}.
 * @returns the manifest members a browser reads; optional colors appear only when configured.
 */
export function buildManifest(settings) {
  const manifest = {
    id: APP_ID,
    name: settings.name,
    short_name: settings.shortName,
    start_url: settings.startUrl,
    scope: settings.scope,
    display: settings.display,
    icons: ICON_ASSETS.map((asset) => ({
      src: `${settings.path}/${asset.file}`,
      sizes: asset.sizes,
      type: ICON_CONTENT_TYPE,
      purpose: asset.purpose,
    })),
  }
  if (settings.themeColor !== undefined) manifest.theme_color = settings.themeColor
  if (settings.backgroundColor !== undefined) manifest.background_color = settings.backgroundColor
  return manifest
}

/**
 * Build the manifest response body.
 * @param settings - resolved settings from {@link resolveSettings}.
 * @returns pretty-printed JSON with a trailing newline.
 */
export function buildManifestBody(settings) {
  return `${JSON.stringify(buildManifest(settings), null, 2)}\n`
}
