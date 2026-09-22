/**
 * `index.html` transform that points the browser at this plugin's manifest.
 *
 * Two browser behaviours make the transform necessary, and neither can be
 * fixed from the manifest itself:
 *
 * - A manifest fetch is `RequestMode::kCors` with credentials **omitted**
 *   (`manifest_fetcher.cc`), so behind an authenticating reverse proxy the
 *   fetch answers the login page and the manifest never parses. The
 *   `crossorigin="use-credentials"` attribute switches that fetch to
 *   `CredentialsMode::kInclude`.
 * - The manifest must therefore live somewhere the browser can also reach with
 *   credentials, which is what the plugin's own routes provide.
 *
 * The transform is pure and idempotent: it removes the tags it owns — any
 * `<link rel="manifest">`, any `<link rel="apple-touch-icon">`, and (only when
 * a theme color is configured) any `<meta name="theme-color">` — then writes
 * its own canonical tags immediately before `</head>`. Attributes on a removed
 * upstream tag other than the ones restated here are not preserved; the served
 * markup is the contract, not the original tag.
 *
 * @module @lilitoweiwei/dsh-web-pwa/index-tap
 */

/** Indentation of the injected tags, matching the built `index.html`. */
const INDENT = '    '

/**
 * Closing head tag and the indentation that precedes it. The indentation is
 * captured so it stays attached to `</head>`: injecting in front of it (rather
 * than in front of the tag alone) is what makes a second pass over the result
 * produce the same bytes.
 */
const HEAD_END = /([ \t]*)<\/head\s*>/i

/** One `<link rel="…">` tag with the given rel value, including its own line. */
function linkTag(rel) {
  return new RegExp(
    `[ \\t]*<link\\b[^>]*\\brel\\s*=\\s*(?:"${rel}"|'${rel}'|${rel}(?=[\\s/>]))[^>]*>[ \\t]*\\r?\\n?`,
    'gi',
  )
}

/** One `<meta name="theme-color">` tag, including its own line. */
const THEME_COLOR_META = /[ \t]*<meta\b[^>]*\bname\s*=\s*(?:"theme-color"|'theme-color'|theme-color(?=[\s/>]))[^>]*>[ \t]*\r?\n?/gi

/**
 * Rewrite one served `index.html` body.
 * @param html - the index body, as Vite built it or as a tap upstream of this one changed it.
 * @param settings - resolved settings from {@link resolveSettings}.
 * @returns the body with this plugin's install metadata tags in place.
 * @throws when `html` is not a string, which the webserver never does and a miswired tap would.
 */
export function applyIndexInstallMetadata(html, settings) {
  if (typeof html !== 'string') {
    throw new Error('dsh-web-pwa: index tap received a non-string body')
  }
  let body = html
    .replace(linkTag('manifest'), '')
    .replace(linkTag('apple-touch-icon'), '')
  if (settings.themeColor !== undefined) body = body.replace(THEME_COLOR_META, '')

  const tags = [
    `<link rel="manifest" href="${settings.manifestPath}" crossorigin="use-credentials" />`,
    `<link rel="apple-touch-icon" href="${settings.iconPath}" />`,
  ]
  if (settings.themeColor !== undefined) {
    tags.push(`<meta name="theme-color" content="${settings.themeColor}" />`)
  }
  const block = `${tags.map((tag) => `${INDENT}${tag}`).join('\n')}\n`

  const head = HEAD_END.exec(body)
  if (head === null) return `${body}${body.endsWith('\n') ? '' : '\n'}${block}`
  const indent = head[1] ?? ''
  return `${body.slice(0, head.index)}${block}${indent}${body.slice(head.index + indent.length)}`
}
