/**
 * Package-owned invariant companion for `@lilitoweiwei/dsh-web-pwa`.
 * @module @lilitoweiwei/dsh-web-pwa/invariant
 */

const PACKAGE_NAME = '@lilitoweiwei/dsh-web-pwa'

/** Cordis companion plugin name. */
const name = 'web-pwa-invariant'

/** Service required before the companion can reserve package ownership. */
const inject = ['invariants']

/** No runtime invariant: this package owns no mutable data relation or event sequence of its own. Its two contributions are registrations in the webserver's route and index-tap registries, which enforce their own uniqueness (a duplicate route throws) and are both disposed with the plugin. */
const install = () => {}

/** Register this package's invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

export { apply, inject, name }
