import type {
  ApplicationExternal,
  ApplicationRow,
  ClientExternal,
  ClientRow,
  MessageExternal,
  MessageRow,
  UserExternal,
  UserRow
} from './types'

const tokenCharacters =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_'
const randomTokenLength = 14
const defaultAppImagesPrefix = 'gotify/'
const appImageNamePattern = /^[A-Za-z0-9._-]+$/

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function jsonError(status: number, description: string): Response {
  return Response.json(
    {
      error: statusText(status),
      errorCode: status,
      errorDescription: description
    },
    { status }
  )
}

export function statusText(status: number): string {
  return new Response(null, { status }).statusText || 'Error'
}

export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, `Field '${field}' is required`)
  }
  return value.trim()
}

export function maybeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function maybeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

export function parseId(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, 'invalid id')
  }
  return parsed
}

export function parsePaging(url: URL): { limit: number; since: number } {
  const limitParam = url.searchParams.get('limit')
  const sinceParam = url.searchParams.get('since')
  const limit = limitParam === null ? 100 : Number(limitParam)
  const since = sinceParam === null ? 0 : Number(sinceParam)

  if (!Number.isInteger(limit) || limit < 1) {
    throw new ApiError(400, "Field 'limit' must be more or equal to 1")
  }
  if (limit > 200) {
    throw new ApiError(400, "Field 'limit' must be less or equal to 200")
  }
  if (!Number.isInteger(since) || since < 0) {
    throw new ApiError(400, "Field 'since' must be more or equal to 0")
  }
  return { limit, since }
}

export function buildNextUrl(
  currentUrl: string,
  limit: number,
  since: number
): string {
  const next = new URL(currentUrl)
  next.searchParams.set('limit', String(limit))
  next.searchParams.set('since', String(since))
  return `${next.pathname}${next.search}${next.hash}`
}

export function parseJsonObject<T>(input: unknown): T {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'request body must be a json object')
  }
  return input as T
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    const contentType = request.headers.get('content-type') || ''

    let body: any

    if (contentType.includes('application/json')) {
      body = await request.json()
    }
    else if (
      contentType.includes('multipart/form-data')
      || contentType.includes('application/x-www-form-urlencoded')
    ) {
      const formData = await request.formData()

      body = Object.fromEntries(formData.entries())
    }
    else {
      throw new ApiError(400, `unsupported content-type: ${contentType}`)
    }

    return parseJsonObject<T>(body)
  }
  catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    throw new ApiError(400, 'request body parse failed')
  }
}

export function boolFromEnv(
  value: string | undefined,
  fallback = false
): boolean {
  if (value === undefined) {
    return fallback
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export const gotifyCookieMaxAge = 7 * 24 * 60 * 60

export function gotifyClientCookie(
  token: string,
  secure: boolean,
  maxAge = gotifyCookieMaxAge
): string {
  const parts = [
    `gotify-client-token=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict'
  ]
  if (secure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export function passwordRounds(value: string | undefined): number {
  const rounds = Number(value ?? '10')
  return Number.isInteger(rounds) && rounds >= 4 ? rounds : 10
}

export function getTokenFromRequest(request: Request): string {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) {
    return queryToken
  }

  const gotifyKey = request.headers.get('X-Gotify-Key')
  if (gotifyKey) {
    return gotifyKey
  }

  const authorization = request.headers.get('Authorization')
  if (
    authorization &&
    authorization.length >= 7 &&
    authorization.slice(0, 7).toLowerCase() === 'bearer '
  ) {
    return authorization.slice(7)
  }

  const cookieHeader = request.headers.get('Cookie') ?? ''
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator < 0) {
      continue
    }
    const name = cookie.slice(0, separator).trim()
    if (name === 'gotify-client-token') {
      try {
        return decodeURIComponent(cookie.slice(separator + 1).trim())
      } catch {
        return ''
      }
    }
  }

  return ''
}

export function getBasicCredentials(
  request: Request
): { name: string; pass: string } | null {
  const authorization = request.headers.get('Authorization')
  if (!authorization) {
    return null
  }
  if (
    authorization.length < 6 ||
    authorization.slice(0, 6).toLowerCase() !== 'basic '
  ) {
    return null
  }

  try {
    const decoded = atob(authorization.slice(6))
    const separator = decoded.indexOf(':')
    if (separator === -1) {
      return null
    }
    return {
      name: decoded.slice(0, separator),
      pass: decoded.slice(separator + 1)
    }
  } catch {
    return null
  }
}

export function generateRandomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let output = ''
  for (const byte of bytes) {
    output += tokenCharacters[byte % tokenCharacters.length]
  }
  return output
}

export function generateToken(prefix: string): string {
  return prefix + generateRandomString(randomTokenLength)
}

export function generateSortKey(): string {
  return `${Date.now().toString(36).padStart(10, '0')}-${generateRandomString(8)}`
}

export function generateImageName(extension: string): string {
  return `${generateRandomString(25)}${extension}`
}

export function normalizeBucketObjectPrefix(
  value: string | undefined,
  fallback = defaultAppImagesPrefix
): string {
  const normalized = (value ?? fallback).trim().replace(/^\/+|\/+$/g, '')
  if (normalized === '') {
    const fallbackNormalized = fallback.trim().replace(/^\/+|\/+$/g, '')
    return fallbackNormalized === '' ? '' : `${fallbackNormalized}/`
  }
  return `${normalized}/`
}

export function parseStoredAppImageName(key: string): string {
  const normalized = key.trim()
  if (normalized === '' || !appImageNamePattern.test(normalized)) {
    throw new ApiError(404, 'image does not exist')
  }
  return normalized
}

export function buildAppImageObjectKey(
  prefix: string | undefined,
  imageName: string
): string {
  return `${normalizeBucketObjectPrefix(prefix)}${parseStoredAppImageName(imageName)}`
}

export function isOlderThan(lastUsed: string | null, ms: number): boolean {
  if (!lastUsed) {
    return true
  }
  const parsed = Date.parse(lastUsed)
  if (Number.isNaN(parsed)) {
    return true
  }
  return parsed + ms < Date.now()
}

export function validImageExtension(extension: string): boolean {
  switch (extension.toLowerCase()) {
    case '.gif':
    case '.jpg':
    case '.jpeg':
    case '.png':
      return true
    default:
      return false
  }
}

export function contentTypeFromExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.gif':
      return 'image/gif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

export function isSupportedImage(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true
  }
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6))
    if (header === 'GIF87a' || header === 'GIF89a') {
      return true
    }
  }
  return false
}

export function toUserExternal(
  user: UserRow,
  session?: { clientId?: number; elevatedUntil?: string | null }
): UserExternal {
  const response: UserExternal = {
    id: user.id,
    name: user.name,
    admin: Boolean(user.admin)
  }
  if (user.created_at) {
    response.createdAt = user.created_at
  }
  if (session?.clientId !== undefined) {
    response.clientId = session.clientId
    response.elevatedUntil = session.elevatedUntil ?? null
  }
  return response
}

export function toClientExternal(
  client: ClientRow,
  includeToken = false
): ClientExternal {
  const response: ClientExternal = {
    id: client.id,
    name: client.name,
    lastUsed: client.last_used,
    createdAt: client.created_at,
    elevatedUntil: client.elevated_until,
    expiresAfterInactivitySeconds: client.expires_after_inactivity_seconds
  }
  if (includeToken) {
    response.token = client.token
  }
  return response
}

export function toApplicationExternal(
  app: ApplicationRow,
  includeToken = false
): ApplicationExternal {
  const response: ApplicationExternal = {
    id: app.id,
    name: app.name,
    description: app.description,
    internal: Boolean(app.internal),
    image: app.image ? `image/${app.image}` : 'static/defaultapp.png',
    defaultPriority: app.default_priority,
    lastUsed: app.last_used,
    sortKey: app.sort_key,
    createdAt: app.created_at
  }
  if (includeToken) {
    response.token = app.token
  }
  return response
}

export function toMessageExternal(message: MessageRow): MessageExternal {
  const response: MessageExternal = {
    id: message.id,
    appid: message.application_id,
    message: message.message,
    title: message.title,
    priority: message.priority,
    date: message.date
  }
  if (message.extras) {
    try {
      response.extras = JSON.parse(message.extras) as Record<string, unknown>
    } catch {
      response.extras = undefined
    }
  }
  return response
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes('unique')
  )
}

export function corsHeaders(
  originHeader: string | null,
  allowOrigin: string | undefined
): Headers {
  const headers = new Headers()
  const allowValue = allowOrigin?.trim() || originHeader || '*'
  headers.set('Access-Control-Allow-Origin', allowValue)
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Gotify-Key'
  )
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('Access-Control-Expose-Headers', 'Content-Type')
  return headers
}
