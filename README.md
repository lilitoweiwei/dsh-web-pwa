# @lilitoweiwei/dsh-web-pwa

Install metadata for an installed **DeepSeek Harness (DSH) Web app**: a Web App
Manifest with raster icons, served from the plugin's own routes, plus an
`index.html` tap that points the browser's manifest link at those routes with
credentials included.

It exists because two browser behaviours make a stock DSH deployment
uninstallable as a PWA, and neither can be fixed from the manifest alone:

| Behaviour | Consequence |
|---|---|
| Chrome resolves a manifest icon declared as an SVG with `"sizes": "any"` to **`0x0`** ([crbug.com/40925759](https://issues.chromium.org/issues/40925759)), while installability requires an icon of at least 144px | the install menu entry stays greyed out — *"Can't install this app"* |
| A manifest fetch is `RequestMode::kCors` with credentials **omitted** (`third_party/blink/renderer/modules/manifest/manifest_fetcher.cc`), so `crossorigin="use-credentials"` is the only way to send cookies | behind an authenticating reverse proxy (Authelia, oauth2-proxy, …) the fetch answers the **login page**, the manifest never parses, and installs fail |

Both were first fixed on this deployment by editing `apps/web/dist/` — which
`pnpm run build:web` replaces. This package moves the same fix outside the build
output and outside the Harness source tree.

## What it contributes

| Path (default) | Response |
|---|---|
| `/pwa/manifest.webmanifest` | the manifest, `application/manifest+json`, `Cache-Control: no-cache` |
| `/pwa/icon-192.png`, `/pwa/icon-512.png`, `/pwa/icon-512-maskable.png` | the shipped raster icons, `image/png`, `Cache-Control: public, max-age=3600` |
| anything else under `/pwa` | `404`; a method other than `GET`/`HEAD` is `405` |

and one `index.html` transform, applied on every rendered index: any
`<link rel="manifest">` and any `<link rel="apple-touch-icon">` are replaced by
this package's canonical tags (the manifest one carrying
`crossorigin="use-credentials"`), inserted immediately before `</head>`, plus a
`<meta name="theme-color">` when one is configured. The transform is idempotent
and preserves every other head tag.

Serving the manifest from the plugin rather than from the dist directory also
means the icons are sent as `image/png` — the dist server has no MIME entry for
`.png` and answers `application/octet-stream` for them.

## Install

The package is loaded by path, so it needs no build step and no publish. Add it
to a profile's `cordis.patch.yml` (this is the shape used on the deployment it
was written for, where the package is a submodule at `~/.dsh/plugins/dsh-web-pwa`):

```yaml
- insert:
    - id: web-pwa
      name: '../../plugins/dsh-web-pwa/src/index.js'
      # config:            # every field is optional
      #   path: /pwa
```

Restart `dsh-web.service` afterwards; the plugin mounts as
`web-pwa` and disappears with the entry.

## Config

| Field | Default | Notes |
|---|---|---|
| `path` | `/pwa` | absolute URL path, no trailing slash, and not `/` (that would own the whole origin) |
| `name` | `DeepSeek Harness` | manifest `name` |
| `shortName` | `DSH` | manifest `short_name` |
| `startUrl` | `/` | manifest `start_url` |
| `scope` | `/` | manifest `scope` |
| `display` | `fullscreen` | `fullscreen`, `standalone`, `minimal-ui`, or `browser` |
| `themeColor` | *(unset)* | when set, emitted as `theme_color` and as `<meta name="theme-color">` |
| `backgroundColor` | *(unset)* | when set, emitted as `background_color` |

`id` is deliberately **not** configurable and is always `/`, and `start_url`/
`scope` default to the values the shipped Harness manifest already declares: app
identity is what tells a browser that an already-installed app is the same app,
so changing these re-identifies it (the user ends up with a second icon).

Every unusable value is refused at load with a message naming the field — the
plugin never silently falls back. No `schemastery` `Config` schema is declared:
`@deepseek-ai/*` specifiers resolve in a path-loaded plugin only under the
source launcher's tsx path mapping, and importing nothing but `node:` builtins
keeps this package loadable under every launch mode (it also lets the tests run
with plain `node`).

## Scope

Deliberately not included:

- **No service worker.** Chrome 108+ installs from the menu without one, and a
  careless cache strategy would break DSH's streaming responses.
- **No change to `display`.** Whatever the deployment declares stays declared.
- **No cookie or session handling.** A cross-site top-level navigation withholds
  a `SameSite=Strict` session cookie, which is why an installed Android WebAPK
  can open to DSH's `authentication required` page. That is fixed at the
  reverse proxy with one same-origin bounce, not here
  ([deepseek-harness#5362](https://github.com/deepseek-ai/deepseek-harness/discussions/5362)).

## Tests

Plain `node`, no framework, no Harness tree, no keys:

```sh
node test/settings.test.mjs    # config resolution, refusals, manifest members
node test/index-tap.test.mjs   # the index transform, including idempotency
node test/plugin.test.mjs      # the wiring, against a fake Cordis context
```

Verified in a real DSH process (isolated `DSH_HOME`, spare port) by driving the
plugin through an injected loader entry: the three routes answer as above, the
served index carries the tapped tags, and Chrome's own `Page.getAppManifest`
reports `sizes: 192x192 / 512x512 / 512x512` with
`Page.getInstallabilityErrors` empty.

## License

MIT
