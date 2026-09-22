/**
 * The raster icon set this package ships, and the one-time read that loads it.
 *
 * Icons are PNGs on purpose: Chrome resolves a manifest entry declared as an
 * SVG with `"sizes": "any"` to `0x0` (crbug.com/40925759), which fails the
 * installability check that requires an icon of at least 144px. The images are
 * read once per process by {@link loadIconAssets} so a request never touches
 * the filesystem and an incomplete package fails at load, not at install time.
 *
 * @module @lilitoweiwei/dsh-web-pwa/assets
 */

import { readFile } from 'node:fs/promises'

/** Content type sent for every shipped icon. */
export const ICON_CONTENT_TYPE = 'image/png'

/**
 * Shipped icons in manifest order. `sizes` is the real pixel size of each file:
 * 192x192 and 512x512 satisfy Chrome's installability check, and the maskable
 * 512 keeps the mark inside the launcher's safe zone.
 */
export const ICON_ASSETS = Object.freeze([
  Object.freeze({ file: 'icon-192.png', sizes: '192x192', purpose: 'any' }),
  Object.freeze({ file: 'icon-512.png', sizes: '512x512', purpose: 'any' }),
  Object.freeze({ file: 'icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' }),
])

/**
 * Read every shipped icon into memory.
 * @returns file name to PNG bytes, in {@link ICON_ASSETS} order.
 * @throws when a file is missing, which means the package was shipped incomplete.
 */
export async function loadIconAssets() {
  const loaded = new Map()
  for (const asset of ICON_ASSETS) {
    const bytes = await readFile(new URL(`./assets/${asset.file}`, import.meta.url))
    loaded.set(asset.file, bytes)
  }
  return loaded
}
