/**
 * Host half of DSH WorkBuddy Subscription.
 *
 * It gives the WorkBuddy products the same settings experience the Codex
 * subscription plugin gives ChatGPT: a dedicated "WorkBuddy" page in Settings
 * where the user signs in, sees the remaining credit and the account's model
 * list — and, once signed in, those models are selectable in the composer.
 *
 * Division of labour with `dsh-workbuddy-connect`:
 *
 * - That package owns the reverse-engineered upstream protocol: the HTTP
 *   client, the model catalog parser, the loopback shim, and the pi-ai
 *   adapter. It is a *library* here, not a mounted bundle, so its own settings
 *   card never appears and its desktop-app discovery is never the login path.
 * - This package owns the *sign-in*. `dsh-workbuddy-connect` can only adopt an
 *   account the WorkBuddy desktop app already signed in, which leaves a
 *   headless Linux host with no way in at all. Here the Host drives Tencent's
 *   own plugin sign-in flow — create a state, hand the browser the auth URL,
 *   poll for the token — and writes the result into the credential copy the
 *   library already reads.
 *
 * The credential is therefore written to the *plugin-owned* path the library
 * exposes (`WorkBuddyCredentialStore.ownAuthPath()`), never to a desktop app's
 * file. That path is also the one the library refreshes into and the one its
 * `logout()` removes, so sign-in, token rotation and sign-out all agree on a
 * single file.
 *
 * @module dsh-workbuddy-subscription
 */

import { randomBytes } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  AI_VARIANT,
  CN_VARIANT,
  FALLBACK_WORKBUDDY_AI_MODELS,
  FALLBACK_WORKBUDDY_MODELS,
  WorkBuddyCatalog,
  WorkBuddyCredentialStore,
  WorkBuddyUpstreamClient,
  createWorkBuddyAdapter,
  createWorkBuddyShim,
  normalizeCredits,
  regionOf,
} from '../vendor/dsh-workbuddy-connect/lib/index.js'

/** Stable Cordis plugin name; the bundle row uses the same id. */
export const name = 'workbuddy-subscription'

/** The adapter registry must exist before a provider can be registered. */
export const inject = ['llm']

/** Shared RPC channel; the Client posts through `connection.rpc.call('/api', …)`. */
const CHANNEL = '/api'

/** Every endpoint this plugin owns on the shared channel. */
const ENDPOINT_PREFIX = 'workbuddy-subscription/'
const ENDPOINTS = Object.freeze([
  'status',
  'login/start',
  'login/status',
  'login/cancel',
  'login/submit',
  'logout',
  'usage',
  'models',
  'refresh',
  'checkin/status',
  'checkin/claim',
])

/**
 * One product's sign-in service.
 *
 * These are the two builds of WorkBuddy, and they are separate accounts on
 * separate gateways: a CN credential cannot serve an international request and
 * vice versa. The `platform` value is what Tencent's own sign-in page is keyed
 * by, and `endpoint` is the API host it belongs to.
 */
const SITES = Object.freeze({
  [CN_VARIANT.id]: { endpoint: 'https://copilot.tencent.com', platform: 'workbuddy' },
  [AI_VARIANT.id]: { endpoint: 'https://www.workbuddy.ai', platform: 'workbuddy-ai' },
})

/** The App version the sign-in page is opened with. */
const SIGN_IN_APP_VERSION = '2.0.0'
/** `WorkBuddy/<version>` is the User-Agent the plugin API accepts; anything else is refused. */
const USER_AGENT = 'WorkBuddy/5.5.6'
/** How long a started sign-in may stay pending before it is reported as expired. */
const SIGN_IN_DEADLINE_MS = 5 * 60 * 1000
/** Delay between token polls. */
const POLL_MS = 1500
/** Upstream code meaning "the browser has not finished yet". */
const CODE_PENDING = 11217
/** Upstream code meaning "the account document is not ready yet". */
const CODE_ACCOUNT_PENDING = 12151
/** Format version of the plugin-owned credential copy the library reads. */
const OWN_FORMAT_VERSION = 1
/** How long a credit reading is reused before a new read is allowed. */
const CREDIT_REUSE_MS = 10 * 1000

/** Fallback rosters, used only to keep the provider registrable before the first fetch. */
const FALLBACKS = Object.freeze({
  [CN_VARIANT.id]: FALLBACK_WORKBUDDY_MODELS,
  [AI_VARIANT.id]: FALLBACK_WORKBUDDY_AI_MODELS,
})

/** An upstream failure carrying the envelope code, for the pending paths. */
class UpstreamError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'UpstreamError'
    this.code = code
    this.status = status
  }
}

/**
 * Call the WorkBuddy plugin API. Its answers are `{ code, msg, data }`, and
 * any non-zero code is an error even on HTTP 200.
 */
async function callSite(site, method, path, headers = {}, body, signal) {
  const response = await fetch(site.endpoint + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  const text = await response.text()
  let envelope = {}
  try {
    envelope = JSON.parse(text)
  } catch {
    // A non-JSON body is reported through the status below.
  }
  const code = Number.parseInt(envelope?.code, 10) || 0
  const message = envelope?.msg || envelope?.message || text.slice(0, 200) || response.statusText
  if (!response.ok || code !== 0) {
    throw new UpstreamError(`${path}: ${message}`, code, response.status)
  }
  return envelope?.data
}

/**
 * Ask WorkBuddy for a sign-in session and hand back the page to open.
 *
 * The `X-No-*` headers are what make this an unauthenticated call: without them
 * the gateway answers for whatever account the caller claims to be.
 */
async function startSignIn(site, signal) {
  const state = await callSite(
    site,
    'POST',
    `/v2/plugin/auth/state?platform=${encodeURIComponent(site.platform)}`,
    {
      'X-No-Authorization': 'true',
      'X-No-User-Id': 'true',
      'X-No-Enterprise-Id': 'true',
      'X-No-Department-Info': 'true',
    },
    {},
    signal,
  )
  if (typeof state?.state !== 'string' || state.state === '') {
    throw new Error('WorkBuddy returned no sign-in session')
  }
  if (typeof state?.authUrl !== 'string' || state.authUrl === '') {
    throw new Error('WorkBuddy returned no sign-in page')
  }
  const url = new URL(state.authUrl)
  if (url.protocol !== 'https:') throw new Error("WorkBuddy's sign-in page is not https")
  url.searchParams.set('version', SIGN_IN_APP_VERSION)
  url.searchParams.set('loginSessionId', randomBytes(16).toString('hex'))
  return { state: state.state, url: url.toString() }
}

/** Poll one endpoint until it answers with data, tolerating the "not yet" codes. */
async function pollSite(site, path, headers, retryCodes, deadline, signal) {
  for (;;) {
    if (Date.now() > deadline) throw new Error('sign-in timed out')
    if (signal?.aborted === true) throw new Error('sign-in cancelled')
    try {
      const data = await callSite(site, 'GET', path, headers, undefined, signal)
      if (data !== undefined && data !== null && Object.keys(data).length > 0) return data
    } catch (error) {
      const tolerated =
        error instanceof UpstreamError &&
        (retryCodes.includes(error.code) || error.status === 408 || error.status === 429)
      if (!tolerated) throw error
    }
    await sleep(POLL_MS)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turn an upstream token answer into the library's credential shape.
 *
 * Times arrive either as absolute epoch milliseconds or as a number of seconds
 * from now, and both spellings are in use, so both are accepted.
 */
function credentialFromToken(token, site) {
  const now = Date.now()
  const expiresAtMs =
    typeof token?.expiresAt === 'number' && token.expiresAt > 0
      ? token.expiresAt
      : typeof token?.expiresIn === 'number' && token.expiresIn > 0
        ? now + token.expiresIn * 1000
        : 0
  const refreshExpiresAtMs =
    typeof token?.refreshExpiresAt === 'number' && token.refreshExpiresAt > 0
      ? token.refreshExpiresAt
      : typeof token?.refreshExpiresIn === 'number' && token.refreshExpiresIn > 0
        ? now + token.refreshExpiresIn * 1000
        : undefined
  return {
    accessToken: String(token.accessToken),
    refreshToken: typeof token.refreshToken === 'string' ? token.refreshToken : '',
    expiresAtMs,
    ...(refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs }),
    domain: typeof token.domain === 'string' && token.domain !== '' ? token.domain : new URL(site.endpoint).host,
    uid: typeof token.uid === 'string' ? token.uid : '',
    source: 'dsh',
  }
}

/**
 * The enterprise (team) a sign-in belongs to, when it is not a personal one.
 *
 * WorkBuddy answers as the personal account unless every request names the
 * enterprise, so this has to be resolved at sign-in and carried on the
 * credential. `/login/account` names it directly for a team sign-in; otherwise
 * the account list is consulted for the uid's only entry of the same type.
 */
async function enterpriseOf(site, accessToken, domain, who, signal) {
  const own = typeof who?.enterpriseId === 'string' ? who.enterpriseId.trim() : ''
  if (own !== '') return own
  const type = String(who?.type ?? '').trim().toLowerCase()
  if (type === '' || type === 'personal') return ''
  try {
    const list = await callSite(
      site,
      'GET',
      '/v2/plugin/accounts',
      { Authorization: `Bearer ${accessToken}`, 'X-Domain': domain },
      undefined,
      signal,
    )
    const mine = (list?.accounts ?? []).filter(
      (entry) => entry?.uid === who?.uid && typeof entry?.enterpriseId === 'string' && entry.enterpriseId.trim() !== '',
    )
    const same = mine.filter((entry) => String(entry?.type ?? '').trim().toLowerCase() === type)
    const last = mine.filter((entry) => entry?.lastLogin)
    const pick = same.length === 1 ? same[0] : last.length === 1 ? last[0] : mine.length === 1 ? mine[0] : undefined
    return pick === undefined ? '' : String(pick.enterpriseId).trim()
  } catch {
    return ''
  }
}

/** The account a finished sign-in belongs to. */
async function accountOf(site, credential, state, deadline, signal) {
  const query = encodeURIComponent(state)
  const who = await pollSite(
    site,
    `/v2/plugin/login/account?state=${query}`,
    {
      Authorization: `Bearer ${credential.accessToken}`,
      'X-Domain': credential.domain,
      'X-No-User-Id': 'true',
      'X-No-Enterprise-Id': 'true',
    },
    [CODE_ACCOUNT_PENDING],
    deadline,
    signal,
  )
  const enterpriseId = await enterpriseOf(site, credential.accessToken, credential.domain, who, signal)
  return {
    ...credential,
    uid: typeof who?.uid === 'string' ? who.uid : credential.uid,
    ...(enterpriseId === '' ? {} : { enterpriseId }),
    ...(typeof who?.nickname === 'string' && who.nickname !== '' ? { nickname: who.nickname } : {}),
  }
}

/**
 * Write the plugin-owned credential copy the library reads.
 *
 * The document is `{ version, credential }` because that is the shape
 * `WorkBuddyCredentialStore` accepts at its own path; anything else is rejected
 * there, and a rejection would surface as "signed out" with no explanation.
 * The write is staged and renamed so a reader never sees half a document.
 */
async function writeCredential(store, credential) {
  const path = store.ownAuthPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const staging = `${path}.staging-${randomBytes(4).toString('hex')}`
  const document = { version: OWN_FORMAT_VERSION, credential }
  await writeFile(staging, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
  await rename(staging, path)
  return path
}

/**
 * Parse a document the user pasted instead of signing in in a browser.
 *
 * Both the flat panel form and the nested OAuth form are accepted, because the
 * two are what WorkBuddy's own surfaces hand out. The plugin-owned shape is
 * accepted too, so a credential exported from another host round-trips.
 */
function parsePastedCredential(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('that is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('that is not a WorkBuddy credential document')
  }
  if (parsed.version === OWN_FORMAT_VERSION && typeof parsed.credential === 'object' && parsed.credential !== null) {
    parsed = parsed.credential
  }
  const nested = typeof parsed.auth === 'object' && parsed.auth !== null ? parsed.auth : parsed
  const identity = typeof parsed.account === 'object' && parsed.account !== null ? parsed.account : parsed
  const accessToken = typeof nested.accessToken === 'string' ? nested.accessToken.trim() : ''
  if (accessToken === '') throw new Error('that document carries no accessToken')
  const refreshToken = typeof nested.refreshToken === 'string' ? nested.refreshToken : ''
  const rawExpiry = typeof nested.expiresAt === 'number' ? nested.expiresAt : undefined
  const expiresAtMs = rawExpiry === undefined ? 0 : rawExpiry < 1e12 ? rawExpiry * 1000 : rawExpiry
  const domain = typeof nested.domain === 'string' ? nested.domain.trim() : ''
  const uid = typeof identity.uid === 'string' ? identity.uid.trim() : ''
  const enterpriseId = typeof identity.enterpriseId === 'string' ? identity.enterpriseId.trim() : ''
  const nickname = typeof identity.nickname === 'string' ? identity.nickname.trim() : ''
  return {
    accessToken,
    refreshToken,
    expiresAtMs,
    domain,
    uid,
    ...(enterpriseId === '' ? {} : { enterpriseId }),
    ...(nickname === '' ? {} : { nickname }),
    source: 'dsh',
  }
}

/**
 * One product's live runtime: its credential store, upstream client, catalog,
 * loopback shim, adapter registration, and the sign-in flow in progress.
 */
function createRuntime(ctx, variant) {
  const site = SITES[variant.id]
  const client = new WorkBuddyUpstreamClient()
  const store = new WorkBuddyCredentialStore({
    variant,
    refresh: (credential) => client.refreshToken(credential),
  })
  const catalog = new WorkBuddyCatalog(FALLBACKS[variant.id])
  catalog.setVisible(false)
  return {
    variant,
    site,
    client,
    store,
    catalog,
    /** Invalidate the adapter's cached provider snapshot. */
    invalidate: () => {},
    /** Sign-in in progress, or undefined. */
    login: undefined,
    /** The last catalog fetch failure, for the page's diagnostics. */
    catalogError: undefined,
    /** Catalog provenance for the page. */
    catalogSource: 'fallback',
    /** Last credit reading and when it was taken, so the page can reuse it. */
    credits: undefined,
    creditsAtMs: 0,
    /** Result of registering the provider. */
    provider: 'pending',
    account: undefined,
    /**
     * A daily check-in claim in flight.
     *
     * Single-flight per product: the claim grants a real reward, so a second
     * tab or a double click must not be able to spend the day twice.
     */
    checkin: undefined,
  }
}

/** Fetch the account's model catalog and publish it. */
async function refreshCatalog(runtime, credential) {
  try {
    const models = await runtime.client.fetchModels(credential)
    runtime.catalog.set(models)
    runtime.catalog.setVisible(models.length > 0)
    runtime.catalogSource = 'upstream'
    runtime.catalogError = undefined
  } catch (error) {
    runtime.catalogError = error instanceof Error ? error.message.slice(0, 300) : String(error)
    throw error
  } finally {
    runtime.invalidate()
  }
}

/**
 * Adopt a credential: publish its catalog and remember its account.
 *
 * Signing out hides the whole catalog, which is how the model picker stops
 * offering routes that could only fail.
 *
 * A catalog that cannot be fetched is *not* a failed adoption: the sign-in did
 * succeed, and the failure is recorded for the page to show. Making it fatal
 * would report a working sign-in as broken whenever the upstream catalog is
 * briefly unhappy — and the settings page is where that is worth reading.
 */
async function adopt(runtime, credential) {
  if (credential === undefined) {
    runtime.account = undefined
    runtime.catalog.set(runtime.catalog.fallback())
    runtime.catalogSource = 'fallback'
    runtime.catalogError = undefined
    runtime.credits = undefined
    runtime.creditsAtMs = 0
    if (runtime.catalog.setVisible(false)) runtime.invalidate()
    return
  }
  runtime.account = {
    uid: credential.uid,
    ...(credential.enterpriseId === undefined ? {} : { enterpriseId: credential.enterpriseId }),
    ...(credential.nickname === undefined ? {} : { nickname: credential.nickname }),
    domain: credential.domain,
  }
  runtime.catalog.setVisible(true)
  runtime.invalidate()
  try {
    await refreshCatalog(runtime, credential)
  } catch {
    // Recorded in `runtime.catalogError` by `refreshCatalog`.
  }
}

/** The credential currently in effect, or undefined; never throws. */
async function currentCredential(store) {
  try {
    return await store.current()
  } catch {
    // A file this plugin cannot read is reported through `status()` instead.
    return undefined
  }
}

/**
 * Whether this product runs a daily check-in activity.
 *
 * Only the China build does; the international endpoint answers `active: false`
 * even for a signed-in account, so asking it would only ever show a dead row.
 */
function checkinOffered(runtime) {
  return runtime.variant.region === 'cn'
}

/** One variant's page state, including the sign-in in progress. */
async function variantStatus(runtime) {
  const status = await runtime.store.status()
  const credential = status.state === 'signed-in' ? await currentCredential(runtime.store) : undefined
  return {
    id: runtime.variant.id,
    displayName: runtime.variant.displayName,
    region: runtime.variant.region,
    signedIn: status.state === 'signed-in',
    ...(status.expiresAtMs === undefined ? {} : { expiresAtMs: status.expiresAtMs }),
    ...(status.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: status.refreshExpiresAtMs }),
    ...(status.nickname === undefined ? {} : { nickname: status.nickname }),
    ...(status.domain === undefined ? {} : { domain: status.domain }),
    ...(status.source === undefined ? {} : { source: status.source }),
    ...(status.reason === undefined ? {} : { reason: status.reason }),
    ...(status.reasonCode === undefined ? {} : { reasonCode: status.reasonCode }),
    ...(credential?.uid === undefined || credential.uid === '' ? {} : { uid: credential.uid }),
    ...(credential?.enterpriseId === undefined ? {} : { enterpriseId: credential.enterpriseId }),
    authPath: runtime.store.ownAuthPath(),
    desktopPath: runtime.store.desktopAuthPath() ?? null,
    models: { count: runtime.catalog.current().length, source: runtime.catalogSource },
    ...(runtime.catalogError === undefined ? {} : { catalogError: runtime.catalogError }),
    provider: runtime.provider,
    login: runtime.login === undefined ? null : { state: runtime.login.state, url: runtime.login.url },
  }
}

/** Begin a sign-in; the poll loop runs in the background. */
async function beginLogin(runtime) {
  if (runtime.login !== undefined && runtime.login.state === 'pending') return runtime.login
  const { state, url } = await startSignIn(runtime.site, undefined)
  const entry = { state: 'pending', url, error: undefined, abort: new AbortController() }
  runtime.login = entry
  const deadline = Date.now() + SIGN_IN_DEADLINE_MS
  const query = encodeURIComponent(state)
  void (async () => {
    try {
      const token = await pollSite(
        runtime.site,
        `/v2/plugin/auth/token?state=${query}`,
        {},
        [CODE_PENDING],
        deadline,
        entry.abort.signal,
      )
      const credential = credentialFromToken(token, runtime.site)
      if (credential.accessToken === '') throw new Error('WorkBuddy returned no access token')
      const resolved = await accountOf(runtime.site, credential, state, deadline, entry.abort.signal)
      const region = regionOf(resolved.domain)
      if (region !== runtime.variant.region) {
        throw new Error(
          `that sign-in belongs to the ${region === 'cn' ? 'China' : 'international'} build, not ${runtime.variant.displayName}`,
        )
      }
      await writeCredential(runtime.store, resolved)
      await adopt(runtime, resolved)
      entry.state = 'signed-in'
    } catch (error) {
      if (entry.abort.signal.aborted) entry.state = 'cancelled'
      else {
        entry.state = 'failed'
        entry.error = error instanceof Error ? error.message.slice(0, 300) : String(error)
      }
    }
  })()
  return runtime.login
}

/** Register both providers, each variant independently so one failure is contained. */
async function startProvider(ctx, runtime) {
  const { variant, store, client, catalog } = runtime
  const shim = createWorkBuddyShim({ store, client, catalog, logger: ctx.logger })
  try {
    await shim.ready
  } catch (error) {
    runtime.provider = 'shim-failed'
    ctx.logger?.error?.(`dsh-workbuddy-subscription: ${variant.displayName} loopback endpoint failed to start`, error)
    return
  }
  try {
    const adapter = createWorkBuddyAdapter({
      providerId: variant.id,
      displayName: variant.displayName,
      region: variant.region,
      shim,
      store,
      catalog,
      resolveAttachments: () => ctx.get('attachments'),
    })
    runtime.invalidate = () => {
      adapter.invalidate()
      ctx.emit('llm/adapters-updated')
    }
    const release = ctx.llm.registerAdapter([variant.id], adapter.adapter)
    try {
      ctx.effect(() => () => {
        release()
        void shim.close()
      })
    } catch {
      release()
      void shim.close()
    }
    runtime.provider = 'registered'
  } catch (error) {
    runtime.provider = 'registration-failed'
    ctx.logger?.error?.(`dsh-workbuddy-subscription: ${variant.displayName} provider registration failed`, error)
    void shim.close()
  }
}

/**
 * Publish the settings RPC as exact Fetch routes on the shared `/api` channel.
 *
 * Exact routes, not `connection.rpc.intercept`: the shared channel holds
 * exactly one interceptor and `@deepseek-ai/dsh-api-gateway` already owns it, so
 * an `intercept('/api', …)` call here is rejected outright. That rejection is
 * worse than a plain failure — it lands inside a deferred effect, where nothing
 * surfaces it, and the only symptom is the Client's calls falling through to the
 * channel's 404. An exact route is keyed by its own path, so any number of
 * plugins coexist.
 *
 * The envelope is the channel's own, and both halves must agree on it: the
 * Client posts `{ type: 'client-request', rpcId, method, payload }` and expects
 * `{ type: 'server-response', rpcId, result }` back, where `result` is the
 * success/error union the transport already knows how to read.
 */
function registerTransport(connection, handlers) {
  const disposers = []
  try {
    for (const endpoint of ENDPOINTS) {
      const method = `${ENDPOINT_PREFIX}${endpoint}`
      disposers.push(
        connection.fetch.register({
          path: `${CHANNEL}/${method}`,
          methods: ['POST'],
          requestBody: 'buffered',
          async fetch(request) {
            const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
            if (mediaType !== 'application/json') {
              return new Response('content type must be application/json', { status: 415 })
            }
            let body
            try {
              body = await request.json()
            } catch {
              return new Response('invalid JSON', { status: 400 })
            }
            const envelope =
              body !== null && typeof body === 'object' && !Array.isArray(body) ? body : undefined
            if (
              envelope === undefined ||
              envelope.type !== 'client-request' ||
              typeof envelope.rpcId !== 'string' ||
              envelope.method !== method
            ) {
              return new Response('invalid RPC envelope', { status: 400 })
            }
            let result
            try {
              const value = await handlers[endpoint](envelope.payload)
              result = { ok: true, value }
            } catch (error) {
              result = {
                ok: false,
                error: {
                  code: 'workbuddy-subscription-failed',
                  message: error instanceof Error ? error.message.slice(0, 500) : String(error),
                  details: {},
                },
              }
            }
            return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result })
          },
        }),
      )
    }
  } catch (error) {
    // Registration is all-or-nothing: a half-published surface would answer
    // some endpoints and 404 the rest.
    for (const dispose of disposers.reverse()) void dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.reverse()) void dispose()
  }
}

/**
 * Apply the plugin: start both variants and publish the settings RPC.
 *
 * Each variant registers unconditionally — what varies is whether its catalog
 * is *visible*, which is how a sign-in that happens after startup starts
 * working without re-registering the provider.
 *
 * A second row reaching this module is not hypothetical: the plugin market adds
 * its own hot row for this same directory beside the bundle row. The adapter
 * registry is the precise thing the two would fight over, so it is also the
 * precise test — and unlike a process-wide flag it is self-healing, because a
 * row's registration is released with its fiber and a later row then applies
 * normally.
 */
export function apply(ctx, config) {
  void config
  try {
    if (ctx.llm?.listProviders?.().some((entry) => entry.id === CN_VARIANT.id)) {
      ctx.logger?.warn?.(
        'dsh-workbuddy-subscription: another row already serves the WorkBuddy providers; skipping the duplicate',
      )
      return
    }
  } catch {
    // A registry that cannot answer must not stop this plugin from applying.
  }

  const runtimes = new Map([
    [CN_VARIANT.id, createRuntime(ctx, CN_VARIANT)],
    [AI_VARIANT.id, createRuntime(ctx, AI_VARIANT)],
  ])

  const runtimeFor = (variantId) => {
    const runtime = runtimes.get(variantId)
    if (runtime === undefined) throw new Error(`unknown WorkBuddy product ${JSON.stringify(variantId)}`)
    return runtime
  }

  /**
   * The credential to use for a reading, or a message the user can act on.
   *
   * The store's own "no credential" error talks about the desktop app, because
   * that is the only sign-in the library knows. Here the sign-in lives on this
   * plugin's own page, so the refusal is reworded to point at it.
   */
  const requireCredential = async (runtime) => {
    const status = await runtime.store.status()
    if (status.state !== 'signed-in') {
      const why = status.reason === undefined ? '' : ` (${status.reason})`
      throw new Error(`${runtime.variant.displayName} is not signed in${why}; sign in on this page first`)
    }
    return runtime.store.resolve()
  }

  /** A credit reading, reused briefly so a page redraw does not re-bill. */
  const readCredits = async (runtime, force) => {
    if (!force && runtime.credits !== undefined && Date.now() - runtime.creditsAtMs < CREDIT_REUSE_MS) {
      return runtime.credits
    }
    const credential = await requireCredential(runtime)
    const credits = await runtime.client.fetchCredits(credential)
    runtime.credits = credits
    runtime.creditsAtMs = Date.now()
    return credits
  }

  const handlers = {
    async status() {
      const variants = []
      for (const runtime of runtimes.values()) variants.push(await variantStatus(runtime))
      return { variants }
    },

    async 'login/start'(payload) {
      const runtime = runtimeFor(payload?.variant)
      const entry = await beginLogin(runtime)
      return { state: entry.state, url: entry.url }
    },

    async 'login/status'(payload) {
      const runtime = runtimeFor(payload?.variant)
      const entry = runtime.login
      if (entry === undefined) return { state: 'idle' }
      return { state: entry.state, url: entry.url, ...(entry.error === undefined ? {} : { error: entry.error }) }
    },

    async 'login/cancel'(payload) {
      const runtime = runtimeFor(payload?.variant)
      const entry = runtime.login
      if (entry !== undefined && entry.state === 'pending') entry.abort.abort()
      if (entry !== undefined) entry.state = 'cancelled'
      return { state: 'cancelled' }
    },

    async 'login/submit'(payload) {
      const runtime = runtimeFor(payload?.variant)
      if (typeof payload?.document !== 'string' || payload.document.trim() === '') {
        throw new Error('paste a WorkBuddy credential document first')
      }
      const credential = parsePastedCredential(payload.document)
      if (credential.domain === '') {
        throw new Error(
          'that document names no domain, so the product it belongs to cannot be decided; paste a document that carries a domain',
        )
      }
      const region = regionOf(credential.domain)
      if (region !== runtime.variant.region) {
        throw new Error(
          `that credential belongs to the ${region === 'cn' ? 'China' : 'international'} build, not ${runtime.variant.displayName}`,
        )
      }
      await writeCredential(runtime.store, credential)
      await adopt(runtime, credential)
      runtime.login = { state: 'signed-in', url: undefined, error: undefined, abort: new AbortController() }
      return { state: 'signed-in' }
    },

    async logout(payload) {
      const runtime = runtimeFor(payload?.variant)
      await runtime.store.logout()
      await adopt(runtime, undefined)
      runtime.login = undefined
      return { state: 'idle' }
    },

    async usage(payload) {
      const runtime = runtimeFor(payload?.variant)
      const credits = await readCredits(runtime, payload?.force === true)
      return { credits }
    },

    async models(payload) {
      const runtime = runtimeFor(payload?.variant)
      if (payload?.refresh === true) {
        const credential = await requireCredential(runtime)
        await refreshCatalog(runtime, credential)
      }
      const models = runtime.catalog.current().map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
        // The multiplier reaches the browser as a language-neutral spelling:
        // the China roster appends a `credits` unit word and the international
        // one does not, and whichever arrives would otherwise be printed
        // verbatim in every UI language.
        ...(model.billing === undefined
          ? {}
          : { billing: { ...model.billing, credits: normalizeCredits(model.billing.credits) } }),
        ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
      }))
      return { models, source: runtime.catalogSource, visible: runtime.catalog.isVisible() }
    },

    async refresh(payload) {
      const runtime = runtimeFor(payload?.variant)
      const credential = await requireCredential(runtime)
      await refreshCatalog(runtime, credential)
      return { count: runtime.catalog.current().length }
    },

    /**
     * Today's check-in state, read-only.
     *
     * Only the China build runs a check-in activity; the international endpoint
     * answers `active: false`, so it is refused here without a request at all.
     */
    async 'checkin/status'(payload) {
      const runtime = runtimeFor(payload?.variant)
      if (!checkinOffered(runtime)) return { supported: false }
      const credential = await requireCredential(runtime)
      const status = await runtime.client.fetchCheckinStatus(credential)
      return { supported: true, claiming: runtime.checkin === 'claiming', ...status }
    },

    /**
     * Claim today's check-in reward.
     *
     * The reward is real, so this never runs on its own: the page asks first,
     * and the status is re-read immediately before claiming so a second tab, a
     * double click, or the phone app having claimed already cannot turn into a
     * second write.
     */
    async 'checkin/claim'(payload) {
      const runtime = runtimeFor(payload?.variant)
      if (!checkinOffered(runtime)) {
        throw new Error(`${runtime.variant.displayName} has no daily check-in; only the China build runs one`)
      }
      if (runtime.checkin === 'claiming') return { state: 'busy' }
      runtime.checkin = 'claiming'
      try {
        const credential = await requireCredential(runtime)
        const before = await runtime.client.fetchCheckinStatus(credential)
        if (before.todayCheckedIn === true) return { state: 'already', before }
        const claimed = await runtime.client.claimDailyCheckin(credential)
        // The balance changed, so the cached reading is now a lie.
        runtime.credits = undefined
        runtime.creditsAtMs = 0
        const after = await runtime.client.fetchCheckinStatus(credential).catch(() => undefined)
        return { state: 'claimed', ...claimed, ...(after === undefined ? {} : { after }) }
      } finally {
        runtime.checkin = undefined
      }
    },
  }

  ctx.inject(['connection'], (connectionContext) => {
    connectionContext.effect(
      () => registerTransport(connectionContext.connection, handlers),
      'workbuddy-subscription: settings RPC',
    )
  })

  for (const runtime of runtimes.values()) {
    void startProvider(ctx, runtime).then(
      // A credential from a previous run is adopted here, which is what makes
      // those models appear without asking the user to sign in again. The read
      // must be awaited: handing `adopt` the pending promise instead would look
      // like a *credential* and publish the fallback roster as a live catalog on
      // a signed-out product.
      async () => adopt(runtime, await currentCredential(runtime.store)),
      (error) => ctx.logger?.error?.(`dsh-workbuddy-subscription: ${runtime.variant.displayName} startup failed`, error),
    )
  }
}
