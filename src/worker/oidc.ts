import {
  createClient,
  createOidcUser,
  getClientById,
  getUserByName,
  getUserByOidcId,
  getUserOidcId,
  linkUserToOidc,
  updateClientElevation
} from './db'
import type { EnvBindings, UserRow } from './types'
import {
  ApiError,
  boolFromEnv,
  gotifyClientCookie,
  jsonError,
  maybeString,
  readJsonBody,
  requireNonEmptyString,
  toUserExternal
} from './utils'

interface PendingOidcSession {
  state: string
  redirect_uri: string
  client_name: string
  code_verifier: string
  nonce: string
  flow: 'browser' | 'native' | 'elevate'
  client_id: number | null
  duration_seconds: number | null
  created_at: string
  expires_at: string
}

interface DiscoveryDocument {
  issuer?: string
  authorization_endpoint?: string
  token_endpoint?: string
  userinfo_endpoint?: string
  jwks_uri?: string
}

interface TokenResponse {
  access_token?: string
  token_type?: string
  id_token?: string
}

interface JwtClaims {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  nonce?: string
  [key: string]: unknown
}

const pendingMaxAgeMs = 10 * 60 * 1000

function envValue(env: EnvBindings, key: string): string {
  const value = (env as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function oidcEnabled(env: EnvBindings): boolean {
  return boolFromEnv(envValue(env, 'GOTIFY_OIDC_ENABLED'), false)
}

function randomBase64Url(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ''
  for (const byte of value) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T
}

function nowIso(): string {
  return new Date().toISOString()
}

async function getDiscovery(env: EnvBindings): Promise<DiscoveryDocument> {
  const issuer = envValue(env, 'GOTIFY_OIDC_ISSUER').replace(/\/$/, '')
  if (!issuer) {
    throw new ApiError(500, 'OIDC issuer is not configured')
  }
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: 'application/json' }
  })
  if (!response.ok) {
    throw new ApiError(502, 'OIDC discovery request failed')
  }
  const discovery = (await response.json()) as DiscoveryDocument
  if (
    typeof discovery.authorization_endpoint !== 'string' ||
    typeof discovery.token_endpoint !== 'string' ||
    typeof discovery.jwks_uri !== 'string'
  ) {
    throw new ApiError(502, 'OIDC discovery document is incomplete')
  }
  return discovery
}

async function createPendingSession(
  env: EnvBindings,
  input: Omit<PendingOidcSession, 'created_at' | 'expires_at'>
): Promise<void> {
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + pendingMaxAgeMs).toISOString()
  await env.DB.prepare('DELETE FROM oidc_pending_sessions WHERE expires_at <= ?')
    .bind(createdAt)
    .run()
  await env.DB.prepare(
    `INSERT INTO oidc_pending_sessions
      (state, redirect_uri, client_name, code_verifier, nonce, flow, client_id, duration_seconds, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.state,
      input.redirect_uri,
      input.client_name,
      input.code_verifier,
      input.nonce,
      input.flow,
      input.client_id,
      input.duration_seconds,
      createdAt,
      expiresAt
    )
    .run()
}

async function consumePendingSession(
  env: EnvBindings,
  state: string
): Promise<PendingOidcSession | null> {
  const session = await env.DB.prepare(
    `SELECT state, redirect_uri, client_name, code_verifier, nonce, flow,
            client_id, duration_seconds, created_at, expires_at
       FROM oidc_pending_sessions
      WHERE state = ? AND expires_at > ?`
  )
    .bind(state, nowIso())
    .first<PendingOidcSession>()
  if (!session) {
    return null
  }
  await env.DB.prepare('DELETE FROM oidc_pending_sessions WHERE state = ?')
    .bind(state)
    .run()
  return session
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  )
  let binary = ''
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function buildAuthorizeUrl(
  env: EnvBindings,
  discovery: DiscoveryDocument,
  input: {
    state: string
    nonce: string
    codeChallenge: string
    redirectUri: string
  }
): Promise<string> {
  const clientId = envValue(env, 'GOTIFY_OIDC_CLIENTID')
  if (!clientId) {
    throw new ApiError(500, 'OIDC client id is not configured')
  }
  const scopes = (envValue(env, 'GOTIFY_OIDC_SCOPES') || 'openid,profile,email')
    .split(/[ ,]+/)
    .filter(Boolean)
  const url = new URL(discovery.authorization_endpoint as string)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', input.state)
  url.searchParams.set('nonce', input.nonce)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  const prompt = envValue(env, 'GOTIFY_OIDC_PROMPT')
  if (prompt) {
    url.searchParams.set('prompt', prompt.split(/[ ,]+/).filter(Boolean).join(' '))
  }
  return url.toString()
}

async function exchangeCode(
  env: EnvBindings,
  discovery: DiscoveryDocument,
  session: PendingOidcSession,
  code: string
): Promise<TokenResponse> {
  const clientId = envValue(env, 'GOTIFY_OIDC_CLIENTID')
  const clientSecret = envValue(env, 'GOTIFY_OIDC_CLIENTSECRET')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: session.redirect_uri,
    client_id: clientId,
    code_verifier: session.code_verifier
  })
  const headers = new Headers({
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded'
  })
  if (clientSecret) {
    headers.set('authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`)
  }
  const response = await fetch(discovery.token_endpoint as string, {
    method: 'POST',
    headers,
    body
  })
  const payload = (await response.json().catch(() => null)) as TokenResponse | null
  if (!response.ok || !payload?.id_token) {
    throw new ApiError(401, 'OIDC token exchange failed')
  }
  return payload
}

async function verifyIdToken(
  discovery: DiscoveryDocument,
  env: EnvBindings,
  idToken: string,
  nonce: string
): Promise<JwtClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new ApiError(401, 'OIDC ID token is malformed')
  }
  const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0])
  const claims = decodeJsonPart<JwtClaims>(parts[1])
  const signature = decodeBase64Url(parts[2])
  if (!header.alg || !claims.iss || !claims.sub || !claims.exp) {
    throw new ApiError(401, 'OIDC ID token claims are incomplete')
  }
  const issuer = envValue(env, 'GOTIFY_OIDC_ISSUER').replace(/\/$/, '')
  if (claims.iss.replace(/\/$/, '') !== issuer || claims.exp <= Date.now() / 1000) {
    throw new ApiError(401, 'OIDC ID token issuer or expiry is invalid')
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes(envValue(env, 'GOTIFY_OIDC_CLIENTID'))) {
    throw new ApiError(401, 'OIDC ID token audience is invalid')
  }
  if (claims.nonce !== nonce) {
    throw new ApiError(401, 'OIDC ID token nonce is invalid')
  }

  const jwksResponse = await fetch(discovery.jwks_uri as string, {
    headers: { accept: 'application/json' }
  })
  if (!jwksResponse.ok) {
    throw new ApiError(502, 'OIDC JWKS request failed')
  }
  const jwks = (await jwksResponse.json()) as {
    keys?: Array<Record<string, unknown>>
  }
  const jwk = jwks.keys?.find((key) => !header.kid || key.kid === header.kid)
  if (!jwk) {
    throw new ApiError(401, 'OIDC signing key was not found')
  }

  let algorithm: any // WebCrypto's algorithm union differs across Worker and browser lib types.
  let verifyAlgorithm: any // eslint-disable-line @typescript-eslint/no-explicit-any
  if (header.alg === 'RS256') {
    algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    verifyAlgorithm = algorithm
  } else if (header.alg === 'PS256') {
    algorithm = { name: 'RSA-PSS', hash: 'SHA-256' }
    verifyAlgorithm = { name: 'RSA-PSS', saltLength: 32 }
  } else if (header.alg === 'ES256') {
    algorithm = { name: 'ECDSA', namedCurve: 'P-256' }
    verifyAlgorithm = { name: 'ECDSA', hash: 'SHA-256' }
  } else if (header.alg === 'EdDSA') {
    algorithm = { name: 'Ed25519', namedCurve: 'Ed25519' }
    verifyAlgorithm = algorithm
  } else {
    throw new ApiError(401, `OIDC signing algorithm ${header.alg} is unsupported`)
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk as unknown as JsonWebKey,
    algorithm,
    false,
    ['verify']
  )
  const valid = await crypto.subtle.verify(
    verifyAlgorithm,
    key,
    signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  )
  if (!valid) {
    throw new ApiError(401, 'OIDC ID token signature is invalid')
  }
  return claims
}

async function resolveUser(
  env: EnvBindings,
  claims: JwtClaims,
  userInfo: Record<string, unknown>
): Promise<UserRow> {
  const issuer = String(claims.iss ?? '').replace(/\/$/, '')
  const subject = String(claims.sub ?? '')
  if (!issuer || !subject) {
    throw new ApiError(500, 'OIDC issuer or subject claim is empty')
  }
  const oidcId = `${issuer}#${subject}`
  const existing = await getUserByOidcId(env.DB, oidcId)
  if (existing) {
    return existing
  }

  const usernameClaim = envValue(env, 'GOTIFY_OIDC_USERNAMECLAIM') || 'preferred_username'
  const usernameClaims = [...new Set([
    usernameClaim,
    'preferred_username',
    'email',
    'name',
    'nickname'
  ])]
  const username = usernameClaims
    .map((claim) => maybeString(userInfo[claim] ?? claims[claim]).trim())
    .find(Boolean) ?? ''
  if (!username) {
    throw new ApiError(
      500,
      `OIDC username claims '${usernameClaims.join(', ')}' are empty`
    )
  }
  const byUsername = await getUserByName(env.DB, username)
  if (byUsername) {
    const bound = await getUserOidcId(env.DB, byUsername.id)
    if (bound?.oidc_id && bound.oidc_id !== oidcId) {
      throw new ApiError(403, `the user ${username} is already bound to a different OIDC identity`)
    }
    if (!boolFromEnv(envValue(env, 'GOTIFY_OIDC_LINK_BY_USERNAME'), false)) {
      throw new ApiError(
        403,
        `a local user with the username ${username} already exists and linking by username is disabled`
      )
    }
    await linkUserToOidc(env.DB, byUsername.id, oidcId)
    return { ...byUsername, oidc_id: oidcId }
  }

  if (!boolFromEnv(envValue(env, 'GOTIFY_OIDC_AUTOREGISTER'), false)) {
    throw new ApiError(403, 'user does not exist and auto-registration is disabled')
  }
  return createOidcUser(env.DB, { name: username, oidcId })
}

async function authenticateOidcCode(
  env: EnvBindings,
  session: PendingOidcSession,
  code: string
): Promise<UserRow> {
  const discovery = await getDiscovery(env)
  const tokens = await exchangeCode(env, discovery, session, code)
  const claims = await verifyIdToken(discovery, env, tokens.id_token as string, session.nonce)
  let userInfo: Record<string, unknown> = {}
  if (tokens.access_token && discovery.userinfo_endpoint) {
    const response = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    })
    if (response.ok) {
      userInfo = (await response.json()) as Record<string, unknown>
    }
  }
  return resolveUser(env, claims, { ...userInfo, ...claims })
}

async function browserLogin(env: EnvBindings, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const clientName = requireNonEmptyString(url.searchParams.get('name'), 'name')
  const redirectUri =
    envValue(env, 'GOTIFY_OIDC_REDIRECTURL') ||
    `${url.origin}/auth/oidc/callback`
  const state = randomBase64Url(24)
  const nonce = randomBase64Url(24)
  const verifier = randomBase64Url(48)
  await createPendingSession(env, {
    state,
    redirect_uri: redirectUri,
    client_name: clientName,
    code_verifier: verifier,
    nonce,
    flow: 'browser',
    client_id: null,
    duration_seconds: null
  })
  const discovery = await getDiscovery(env)
  const authorizeUrl = await buildAuthorizeUrl(env, discovery, {
    state,
    nonce,
    codeChallenge: await sha256Base64Url(verifier),
    redirectUri
  })
  return Response.redirect(authorizeUrl, 302)
}

async function browserElevation(env: EnvBindings, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const clientId = Number(url.searchParams.get('id'))
  const durationSeconds = Number(url.searchParams.get('durationSeconds'))
  if (!Number.isInteger(clientId) || !Number.isInteger(durationSeconds)) {
    throw new ApiError(400, 'invalid elevation request')
  }
  const redirectUri = envValue(env, 'GOTIFY_OIDC_REDIRECTURL') || `${url.origin}/auth/oidc/callback`
  const state = randomBase64Url(24)
  const nonce = randomBase64Url(24)
  const verifier = randomBase64Url(48)
  await createPendingSession(env, {
    state,
    redirect_uri: redirectUri,
    client_name: '',
    code_verifier: verifier,
    nonce,
    flow: 'elevate',
    client_id: clientId,
    duration_seconds: durationSeconds
  })
  const discovery = await getDiscovery(env)
  const authorizeUrl = await buildAuthorizeUrl(env, discovery, {
    state,
    nonce,
    codeChallenge: await sha256Base64Url(verifier),
    redirectUri
  })
  return Response.redirect(authorizeUrl, 302)
}

async function browserCallback(env: EnvBindings, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const state = requireNonEmptyString(url.searchParams.get('state'), 'state')
  const code = requireNonEmptyString(url.searchParams.get('code'), 'code')
  const session = await consumePendingSession(env, state)
  if (!session) {
    throw new ApiError(400, 'unknown or expired state')
  }
  const user = await authenticateOidcCode(env, session, code)
  if (session.flow === 'elevate') {
    const client = session.client_id === null
      ? null
      : await getClientById(env.DB, session.client_id)
    if (!client || client.user_id !== user.id) {
      throw new ApiError(404, 'client does not exist')
    }
    const until = session.duration_seconds && session.duration_seconds > 0
      ? new Date(Date.now() + session.duration_seconds * 1000).toISOString()
      : null
    await updateClientElevation(env.DB, client.id, until)
    return new Response(
      '<!doctype html><title>Gotify</title><p>OIDC session elevation successful. You can close this tab.</p><script>window.close()</script>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    )
  }
  const client = await createClient(env.DB, {
    name: session.client_name,
    userId: user.id,
    elevatedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    expiresAfterInactivitySeconds: 7 * 24 * 60 * 60
  })
  const headers = new Headers({
    Location: '../../',
    'Set-Cookie': gotifyClientCookie(
      client.token,
      boolFromEnv(envValue(env, 'GOTIFY_SERVER_SECURECOOKIE'), true)
    )
  })
  return new Response(null, { status: 307, headers })
}

async function externalAuthorize(env: EnvBindings, request: Request): Promise<Response> {
  const body = await readJsonBody<Record<string, unknown>>(request)
  const codeChallenge = requireNonEmptyString(body.code_challenge, 'code_challenge')
  const redirectUri = requireNonEmptyString(body.redirect_uri, 'redirect_uri')
  const clientName = requireNonEmptyString(body.name, 'name')
  const state = randomBase64Url(24)
  const nonce = randomBase64Url(24)
  await createPendingSession(env, {
    state,
    redirect_uri: redirectUri,
    client_name: clientName,
    code_verifier: '',
    nonce,
    flow: 'native',
    client_id: null,
    duration_seconds: null
  })
  const discovery = await getDiscovery(env)
  const authorizeUrl = await buildAuthorizeUrl(env, discovery, {
    state,
    nonce,
    codeChallenge,
    redirectUri
  })
  return Response.json({ authorize_url: authorizeUrl, state })
}

async function externalToken(env: EnvBindings, request: Request): Promise<Response> {
  const body = await readJsonBody<Record<string, unknown>>(request)
  const state = requireNonEmptyString(body.state, 'state')
  const code = requireNonEmptyString(body.code, 'code')
  const codeVerifier = requireNonEmptyString(body.code_verifier, 'code_verifier')
  const stored = await consumePendingSession(env, state)
  if (!stored) {
    throw new ApiError(400, 'unknown or expired state')
  }
  const session = { ...stored, code_verifier: codeVerifier }
  const user = await authenticateOidcCode(env, session, code)
  const client = await createClient(env.DB, {
    name: stored.client_name,
    userId: user.id,
    elevatedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    expiresAfterInactivitySeconds: 7 * 24 * 60 * 60
  })
  return Response.json({ token: client.token, user: toUserExternal(user) })
}

export async function maybeHandleOidcRequest(
  request: Request,
  env: EnvBindings
): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  if (!path.startsWith('/auth/oidc/')) {
    return null
  }
  if (!oidcEnabled(env)) {
    return jsonError(403, 'OIDC authentication is disabled')
  }

  try {
    if (path === '/auth/oidc/login' && request.method === 'GET') {
      return await browserLogin(env, request)
    }
    if (path === '/auth/oidc/elevate' && request.method === 'GET') {
      return await browserElevation(env, request)
    }
    if (path === '/auth/oidc/callback' && request.method === 'GET') {
      return await browserCallback(env, request)
    }
    if (path === '/auth/oidc/external/authorize' && request.method === 'POST') {
      return await externalAuthorize(env, request)
    }
    if (path === '/auth/oidc/external/token' && request.method === 'POST') {
      return await externalToken(env, request)
    }
    return jsonError(404, 'Not Found')
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.status, error.message)
    }
    console.error(error)
    return jsonError(500, error instanceof Error ? error.message : 'OIDC request failed')
  }
}
