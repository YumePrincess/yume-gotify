import { compare, hash as hasher } from 'bcryptjs'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { Hono } from 'hono'

import {
  optionalAuth,
  requireAdmin,
  requireApplicationOrClient,
  requireClient,
  requireElevatedClient
} from './auth'
import {
  countAdmins,
  createApplication,
  createClient,
  createMessage,
  createUser,
  deleteApplication,
  deleteClient,
  deleteMessage,
  deleteMessagesByApplication,
  deleteMessagesByUser,
  deleteUser,
  ensureBootstrap,
  getApplicationById,
  getApplicationByToken,
  getApplicationsByUser,
  getClientById,
  getClientByToken,
  getClientsByUser,
  getMessageById,
  getMessagesByApplication,
  getMessagesByUser,
  getUserById,
  getUserByName,
  getUsers,
  ping,
  updateApplication,
  regenerateApplicationToken,
  updateClient,
  updateClientElevation,
  updateUser
} from './db'
import {
  ensurePluginBootstrap,
  getPluginConfig,
  getPluginDisplay,
  listPlugins,
  runScheduledPlugins,
  setPluginConfigById,
  setPluginEnabledById
} from './plugins'
import {
  deliverIgotifyMessage,
  deliverPendingIgotifyMessages,
  getIgotifyVersionResponse,
  maybeHandleIgotifyRequest
} from './igotify'
import { ensureMigrations } from './migrations'
import { StreamHub } from './stream'
import { maybeHandleOidcRequest } from './oidc'
import type { AuthState, EnvBindings, PagedMessages } from './types'
import {
  ApiError,
  boolFromEnv,
  buildNextUrl,
  buildAppImageObjectKey,
  contentTypeFromExtension,
  corsHeaders,
  getBasicCredentials,
  generateImageName,
  getTokenFromRequest,
  gotifyClientCookie,
  isSupportedImage,
  isUniqueConstraintError,
  jsonError,
  maybeNumber,
  maybeString,
  parseId,
  parsePaging,
  passwordRounds,
  readJsonBody,
  requireNonEmptyString,
  toApplicationExternal,
  toClientExternal,
  toMessageExternal,
  toUserExternal,
  validImageExtension
} from './utils'

type AppEnv = {
  Bindings: EnvBindings
  Variables: {
    auth: AuthState | null
  }
}

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  await ensureMigrations(c.env.DB)
  await Promise.all([ensureBootstrap(c.env), ensurePluginBootstrap(c.env.DB)])
  c.set('auth', null)
  await next()

  if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
    return
  }

  const headers = corsHeaders(
    c.req.header('Origin') ?? null,
    c.env.CORS_ALLOW_ORIGIN
  )
  for (const [key, value] of headers.entries()) {
    c.header(key, value)
  }
})

app.options(
  '*',
  (c) =>
    new Response(null, {
      status: 204,
      headers: corsHeaders(
        c.req.header('Origin') ?? null,
        c.env.CORS_ALLOW_ORIGIN
      )
    })
)

app.onError((error) => {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.message)
  }
  console.error(error)
  return jsonError(
    500,
    error instanceof Error ? error.message : 'internal server error'
  )
})

app.get('/health', async (c) => {
  try {
    await ping(c.env.DB)
    return c.json({ health: 'green', database: 'green' })
  } catch {
    return c.json({ health: 'orange', database: 'red' }, 500)
  }
})

app.get('/config', (c) => {
  c.header('cache-control', 'no-store')
  return c.json({
    register: boolFromEnv(c.env.GOTIFY_REGISTRATION, false),
    localAuth: boolFromEnv(c.env.GOTIFY_LOCALAUTH_ENABLED, true),
    oidc: boolFromEnv(c.env.GOTIFY_OIDC_ENABLED, false),
    oidcIdpName: c.env.GOTIFY_OIDC_IDP_NAME ?? 'Yume Account',
    oidcAutoRedirect: boolFromEnv(c.env.GOTIFY_OIDC_AUTO_REDIRECT, false),
    version: {
      version: c.env.GOTIFY_VERSION ?? 'worker-dev',
      commit: c.env.GOTIFY_COMMIT ?? 'unknown',
      buildDate: c.env.GOTIFY_BUILD_DATE ?? 'unknown'
    },
    backgroundImageUrl:
      c.env.GOTIFY_BACKGROUND_IMAGE_URL?.trim() ||
      '/static/yume-background.webp',
    logoBarUrl:
      c.env.GOTIFY_LOGO_BAR_URL?.trim() ||
      'https://www.yume.zone/assets/img/yumegotify.png'
  })
})

app.post('/auth/local/login', async (c) => {
  if (!boolFromEnv(c.env.GOTIFY_LOCALAUTH_ENABLED, true)) {
    throw new ApiError(403, 'local authentication is disabled')
  }

  const credentials = getBasicCredentials(c.req.raw)
  if (!credentials) {
    throw new ApiError(401, 'basic auth required')
  }

  const user = await getUserByName(c.env.DB, credentials.name)
  if (!user || !(await compare(credentials.pass, user.pass))) {
    throw new ApiError(401, 'invalid credentials')
  }

  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const client = await createClient(c.env.DB, {
    name: requireNonEmptyString(body.name, 'name'),
    userId: user.id,
    elevatedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    expiresAfterInactivitySeconds: 7 * 24 * 60 * 60
  })
  c.header(
    'Set-Cookie',
    gotifyClientCookie(
      client.token,
      boolFromEnv(c.env.GOTIFY_SERVER_SECURECOOKIE, true)
    )
  )
  return c.json(
    toUserExternal(user, {
      clientId: client.id,
      elevatedUntil: client.elevated_until
    })
  )
})

app.post('/auth/logout', requireClient, async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const client = token ? await getClientByToken(c.env.DB, token) : null
  if (!client) {
    throw new ApiError(403, 'no client auth provided')
  }
  await deleteClient(c.env.DB, client.id)
  return new Response(null, {
    status: 200,
    headers: {
      'Set-Cookie': gotifyClientCookie(
        '',
        boolFromEnv(c.env.GOTIFY_SERVER_SECURECOOKIE, true),
        -1
      )
    }
  })
})

app.get('/version', (c) =>
  c.json({
    version: c.env.GOTIFY_VERSION ?? 'worker-dev',
    commit: c.env.GOTIFY_COMMIT ?? 'unknown',
    buildDate: c.env.GOTIFY_BUILD_DATE ?? new Date().toISOString()
  })
)

// iGotify Notification Assistant 1.6.x probes the ASP.NET-style root route.
// Keep Gotify's lowercase /version route unchanged for the web client/API.
app.get('/Version', (c) => c.json(getIgotifyVersionResponse(c.env)))

app.get('/gotifyinfo', (c) =>
  c.json({
    version: c.env.GOTIFY_VERSION ?? 'worker-dev',
    register: boolFromEnv(c.env.GOTIFY_REGISTRATION, false),
    localAuth: boolFromEnv(c.env.GOTIFY_LOCALAUTH_ENABLED, true),
    oidc: boolFromEnv(c.env.GOTIFY_OIDC_ENABLED, false),
    oidcIdpName: c.env.GOTIFY_OIDC_IDP_NAME ?? 'Yume Account',
    oidcAutoRedirect: boolFromEnv(c.env.GOTIFY_OIDC_AUTO_REDIRECT, false)
  })
)

app.get('/image/:key', async (c) => {
  if (!c.env.APP_IMAGES) {
    throw new ApiError(404, 'image storage is not configured')
  }
  const key = buildAppImageObjectKey(
    c.env.APP_IMAGES_PREFIX,
    c.req.param('key')
  )
  const object = await c.env.APP_IMAGES.get(key)
  if (!object) {
    throw new ApiError(404, 'image does not exist')
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
})

app.post('/user', optionalAuth, async (c) => {
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const name = requireNonEmptyString(body.name, 'name')
  const pass = requireNonEmptyString(body.pass, 'pass')
  const admin = Boolean(body.admin)

  const existingUser = await getUserByName(c.env.DB, name)
  if (existingUser) {
    throw new ApiError(400, 'username already exists')
  }

  const auth = c.get('auth')
  const requestedBy = auth ? await getUserById(c.env.DB, auth.userId) : null
  const registrationEnabled = boolFromEnv(c.env.GOTIFY_REGISTRATION, false)

  if (!requestedBy?.admin) {
    const status = requestedBy ? 403 : 401
    if (!registrationEnabled) {
      throw new ApiError(status, 'you are not allowed to access this api')
    }
    if (admin) {
      throw new ApiError(status, 'you are not allowed to create an admin user')
    }
  }

  try {
    const created = await createUser(c.env.DB, {
      name,
      pass: await hasher(pass, passwordRounds(c.env.GOTIFY_PASSSTRENGTH)),
      admin
    })
    return c.json(toUserExternal(created))
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(400, 'username already exists')
    }
    throw error
  }
})

app.get('/user', requireAdmin, async (c) => {
  const users = await getUsers(c.env.DB)
  return c.json(users.map((user) => toUserExternal(user)))
})

app.get('/user/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  const user = await getUserById(c.env.DB, id)
  if (!user) {
    throw new ApiError(404, 'user does not exist')
  }
  return c.json(toUserExternal(user))
})

app.post('/user/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const existing = await getUserById(c.env.DB, id)
  if (!existing) {
    throw new ApiError(404, 'user does not exist')
  }

  const nextAdmin = Boolean(body.admin)
  const adminCount = Number((await countAdmins(c.env.DB))?.count ?? 0)
  if (!nextAdmin && Boolean(existing.admin) && adminCount === 1) {
    throw new ApiError(400, 'cannot delete last admin')
  }

  try {
    const updated = await updateUser(c.env.DB, {
      id,
      name: requireNonEmptyString(body.name, 'name'),
      admin: nextAdmin,
      pass:
        typeof body.pass === 'string' && body.pass !== ''
          ? await hasher(
              body.pass,
              passwordRounds(c.env.GOTIFY_PASSSTRENGTH)
            )
          : existing.pass
    })

    return c.json(toUserExternal(updated))
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(400, 'username already exists')
    }
    throw error
  }
})

app.delete('/user/:id', requireAdmin, async (c) => {
  const id = parseId(c.req.param('id'))
  const user = await getUserById(c.env.DB, id)
  if (!user) {
    throw new ApiError(404, 'user does not exist')
  }
  const adminCount = Number((await countAdmins(c.env.DB))?.count ?? 0)
  if (Boolean(user.admin) && adminCount === 1) {
    throw new ApiError(400, 'cannot delete last admin')
  }
  if (c.env.APP_IMAGES) {
    const apps = await getApplicationsByUser(c.env.DB, id)
    await Promise.all(
      apps
        .filter((appRow) => appRow.image)
        .map((appRow) =>
          c.env.APP_IMAGES!.delete(
            buildAppImageObjectKey(c.env.APP_IMAGES_PREFIX, appRow.image)
          )
        )
    )
  }
  await deleteUser(c.env.DB, id)
  return new Response(null, { status: 200 })
})

app.get('/current/user', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const user = await getUserById(c.env.DB, auth.userId)
  if (!user) {
    throw new ApiError(404, 'user does not exist')
  }
  const client = auth.kind === 'client'
    ? await getClientByToken(c.env.DB, auth.token)
    : null
  return c.json(
    toUserExternal(user, {
      clientId: client?.id,
      elevatedUntil: client?.elevated_until
    })
  )
})

app.post('/current/user/password', requireElevatedClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const user = await getUserById(c.env.DB, auth.userId)
  if (!user) {
    throw new ApiError(404, 'user does not exist')
  }

  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  await updateUser(c.env.DB, {
    id: user.id,
    name: user.name,
    admin: Boolean(user.admin),
    pass: await hasher(
      requireNonEmptyString(body.pass, 'pass'),
      passwordRounds(c.env.GOTIFY_PASSSTRENGTH)
    )
  })
  return new Response(null, { status: 200 })
})

app.get('/client', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const clients = await getClientsByUser(c.env.DB, auth.userId)
  return c.json(clients.map((client) => toClientExternal(client)))
})

app.post('/client', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const expiresAfterInactivitySeconds = maybeNumber(
    body.expiresAfterInactivitySeconds,
    0
  )
  if (
    !Number.isInteger(expiresAfterInactivitySeconds) ||
    expiresAfterInactivitySeconds < 0
  ) {
    throw new ApiError(400, 'invalid inactivity expiration')
  }
  const created = await createClient(c.env.DB, {
    name: requireNonEmptyString(body.name, 'name'),
    userId: auth.userId,
    expiresAfterInactivitySeconds
  })
  return c.json(toClientExternal(created, true))
})

app.put('/client/:id', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const client = await getClientById(c.env.DB, id)
  if (!client || client.user_id !== auth.userId) {
    throw new ApiError(404, `client with id ${id} doesn't exists`)
  }

  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const expiresAfterInactivitySeconds = body.expiresAfterInactivitySeconds === undefined
    ? undefined
    : maybeNumber(body.expiresAfterInactivitySeconds, -1)
  if (
    expiresAfterInactivitySeconds !== undefined &&
    (!Number.isInteger(expiresAfterInactivitySeconds) || expiresAfterInactivitySeconds < 0)
  ) {
    throw new ApiError(400, 'invalid inactivity expiration')
  }
  const updated = await updateClient(c.env.DB, {
    id,
    name: requireNonEmptyString(body.name, 'name'),
    expiresAfterInactivitySeconds
  })
  return c.json(toClientExternal(updated))
})

app.post('/client/:id/elevate', requireElevatedClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const client = await getClientById(c.env.DB, id)
  if (!client || client.user_id !== auth.userId) {
    throw new ApiError(404, 'client does not exist')
  }
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const durationSeconds = maybeNumber(body.durationSeconds, 0)
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
    throw new ApiError(400, 'invalid elevation duration')
  }
  const elevatedUntil = durationSeconds === 0
    ? null
    : new Date(Date.now() + durationSeconds * 1000).toISOString()
  await updateClientElevation(c.env.DB, id, elevatedUntil)
  return new Response(null, { status: 204 })
})

app.delete('/client/:id', requireElevatedClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const client = await getClientById(c.env.DB, id)
  if (!client || client.user_id !== auth.userId) {
    throw new ApiError(404, `client with id ${id} doesn't exists`)
  }
  await deleteClient(c.env.DB, id)
  return new Response(null, { status: 200 })
})

app.get('/application', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const apps = await getApplicationsByUser(c.env.DB, auth.userId)
  return c.json(apps.map((appRow) => toApplicationExternal(appRow)))
})

app.post('/application', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  try {
    const created = await createApplication(c.env.DB, {
      userId: auth.userId,
      name: requireNonEmptyString(body.name, 'name'),
      description: maybeString(body.description),
      defaultPriority: maybeNumber(body.defaultPriority, 0),
      sortKey: typeof body.sortKey === 'string' ? body.sortKey : undefined
    })
    return c.json(toApplicationExternal(created, true))
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(400, 'sort key is not unique')
    }
    throw error
  }
})

app.put('/application/:id', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, `app with id ${id} doesn't exists`)
  }

  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  try {
    const updated = await updateApplication(c.env.DB, {
      id,
      name: requireNonEmptyString(body.name, 'name'),
      description: maybeString(body.description),
      defaultPriority: maybeNumber(body.defaultPriority, 0),
      sortKey:
        typeof body.sortKey === 'string' && body.sortKey.trim() !== ''
          ? body.sortKey
          : appRow.sort_key,
      image: appRow.image
    })
    return c.json(toApplicationExternal(updated))
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(400, 'sort key is not unique')
    }
    throw error
  }
})

app.delete('/application/:id', requireElevatedClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, `app with id ${id} doesn't exists`)
  }
  if (appRow.internal) {
    throw new ApiError(400, 'cannot delete internal application')
  }
  if (appRow.image && c.env.APP_IMAGES) {
    await c.env.APP_IMAGES.delete(
      buildAppImageObjectKey(c.env.APP_IMAGES_PREFIX, appRow.image)
    )
  }
  await deleteApplication(c.env.DB, id)
  return new Response(null, { status: 200 })
})

app.put('/application/:id/security', requireElevatedClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, `app with id ${id} doesn't exists`)
  }

  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  if (!Boolean(body.regenerateToken)) {
    return c.json({})
  }

  const rotated = await regenerateApplicationToken(c.env.DB, id)
  return c.json({
    regenerateToken: {
      token: rotated.privateToken
    }
  })
})

app.post('/application/:id/image', requireClient, async (c) => {
  if (!c.env.APP_IMAGES) {
    throw new ApiError(501, 'image storage is not configured')
  }

  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, `app with id ${id} doesn't exists`)
  }

  const form = await c.req.formData()
  const uploaded = form.get('file')
  if (!(uploaded instanceof File)) {
    throw new ApiError(400, "file with key 'file' must be present")
  }

  const extension = uploaded.name.includes('.')
    ? `.${uploaded.name.split('.').pop() ?? ''}`
    : ''

  if (!validImageExtension(extension)) {
    throw new ApiError(400, 'invalid file extension')
  }

  const bytes = await uploaded.arrayBuffer()
  if (!isSupportedImage(bytes)) {
    throw new ApiError(400, 'file must be an image')
  }

  const imageName = generateImageName(extension)
  const objectKey = buildAppImageObjectKey(c.env.APP_IMAGES_PREFIX, imageName)
  await c.env.APP_IMAGES.put(objectKey, bytes, {
    httpMetadata: {
      contentType: uploaded.type || contentTypeFromExtension(extension)
    }
  })

  if (appRow.image) {
    await c.env.APP_IMAGES.delete(
      buildAppImageObjectKey(c.env.APP_IMAGES_PREFIX, appRow.image)
    )
  }

  const updated = await updateApplication(c.env.DB, {
    id: appRow.id,
    name: appRow.name,
    description: appRow.description,
    defaultPriority: appRow.default_priority,
    sortKey: appRow.sort_key,
    image: imageName
  })
  return c.json(toApplicationExternal(updated))
})

app.delete('/application/:id/image', requireClient, async (c) => {
  if (!c.env.APP_IMAGES) {
    throw new ApiError(501, 'image storage is not configured')
  }

  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, `app with id ${id} doesn't exists`)
  }
  if (!appRow.image) {
    throw new ApiError(
      400,
      `app with id ${id} does not have a customized image`
    )
  }

  await c.env.APP_IMAGES.delete(
    buildAppImageObjectKey(
      c.env.APP_IMAGES_PREFIX,
      appRow.image
    )
  )
  const updated = await updateApplication(c.env.DB, {
    id: appRow.id,
    name: appRow.name,
    description: appRow.description,
    defaultPriority: appRow.default_priority,
    sortKey: appRow.sort_key,
    image: ''
  })
  return c.json(toApplicationExternal(updated))
})

app.get('/message', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const { limit, since } = parsePaging(new URL(c.req.url))
  const rows = await getMessagesByUser(c.env.DB, auth.userId, limit + 1, since)
  return c.json(buildPagedMessages(rows, limit, c.req.url))
})

app.get('/application/:id/message', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, 'application does not exist')
  }
  const { limit, since } = parsePaging(new URL(c.req.url))
  const rows = await getMessagesByApplication(c.env.DB, id, limit + 1, since)
  return c.json(buildPagedMessages(rows, limit, c.req.url))
})

app.delete('/message', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  await deleteMessagesByUser(c.env.DB, auth.userId)
  return new Response(null, { status: 200 })
})

app.delete('/application/:id/message', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const appRow = await getApplicationById(c.env.DB, id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, 'application does not exists')
  }
  await deleteMessagesByApplication(c.env.DB, id)
  return new Response(null, { status: 200 })
})

app.delete('/message/:id', requireClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const id = parseId(c.req.param('id'))
  const message = await getMessageById(c.env.DB, id)
  if (!message) {
    throw new ApiError(404, 'message does not exist')
  }
  const appRow = await getApplicationById(c.env.DB, message.application_id)
  if (!appRow || appRow.user_id !== auth.userId) {
    throw new ApiError(404, 'message does not exist')
  }
  await deleteMessage(c.env.DB, id)
  return new Response(null, { status: 200 })
})

app.post('/message', requireApplicationOrClient, async (c) => {
  const auth = requireAuth(c.get('auth'))
  const body = await readJsonBody<Record<string, unknown>>(c.req.raw)
  const application = auth.kind === 'application'
    ? await getApplicationByToken(c.env.DB, auth.token)
    : await getApplicationById(c.env.DB, maybeNumber(body.appid, -1))
  if (!application) {
    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }
  if (auth.kind !== 'application' && application.user_id !== auth.userId) {
    throw new ApiError(404, 'application does not exist')
  }

  const title = maybeString(body.title).trim() || application.name
  const priority =
    body.priority === undefined
      ? application.default_priority
      : maybeNumber(body.priority, application.default_priority)

  const extras =
    body.extras &&
    typeof body.extras === 'object' &&
    !Array.isArray(body.extras)
      ? JSON.stringify(body.extras)
      : null

  const created = await createMessage(c.env.DB, {
    applicationId: application.id,
    message: requireNonEmptyString(body.message, 'message'),
    title,
    priority,
    extras,
    date: new Date().toISOString()
  })

  const external = toMessageExternal(created)
  await publishToUserStream(c.env, auth.userId, external)
  c.executionCtx.waitUntil(
    deliverIgotifyMessage(
      c.env,
      auth.userId,
      external,
      new URL(c.req.url).origin
    ).then(() => undefined)
  )
  return c.json(external)
})

app.get('/stream', requireClient, async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new ApiError(400, 'websocket upgrade required')
  }

  const auth = requireAuth(c.get('auth'))
  const id = c.env.STREAM_HUB.idFromName(`user:${auth.userId}`)
  const stub = c.env.STREAM_HUB.get(id)
  return stub.fetch(c.req.raw)
})

app.get('/plugin', requireClient, async (c) =>
  c.json(await listPlugins(c.env.DB))
)

app.get('/plugin/:id/config', requireClient, async (c) => {
  const id = parseId(c.req.param('id'))
  return new Response(await getPluginConfig(c.env.DB, id), {
    headers: { 'content-type': 'application/x-yaml; charset=utf-8' }
  })
})

app.post('/plugin/:id/config', requireClient, async (c) => {
  const id = parseId(c.req.param('id'))
  await setPluginConfigById({ env: c.env }, id, await c.req.raw.text())
  return new Response(null, { status: 204 })
})

app.get('/plugin/:id/display', requireClient, async (c) => {
  const id = parseId(c.req.param('id'))
  return new Response(await getPluginDisplay({ env: c.env }, id), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' }
  })
})

app.post('/plugin/:id/enable', requireClient, async (c) => {
  const id = parseId(c.req.param('id'))
  await setPluginEnabledById({ env: c.env }, id, true)
  return new Response(null, { status: 204 })
})

app.post('/plugin/:id/disable', requireClient, async (c) => {
  const id = parseId(c.req.param('id'))
  await setPluginEnabledById({ env: c.env }, id, false)
  return new Response(null, { status: 204 })
})

app.all('*', async (c) => {
  const oidcResponse = await maybeHandleOidcRequest(c.req.raw, c.env)
  if (oidcResponse) {
    return oidcResponse
  }
  const response = await maybeHandleIgotifyRequest(c.req.raw, c.env)
  return response ?? jsonError(404, 'Not Found')
})

app.notFound(() => jsonError(404, 'Not Found'))

function requireAuth(auth: AuthState | null): AuthState {
  if (!auth) {
    throw new ApiError(500, 'authentication context missing')
  }
  return auth
}

function buildPagedMessages(
  rows: Awaited<ReturnType<typeof getMessagesByUser>>,
  limit: number,
  requestUrl: string
): PagedMessages {
  const hasNext = rows.length > limit
  const visible = hasNext ? rows.slice(0, rows.length - 1) : rows
  const last = visible.at(-1)
  return {
    paging: {
      size: visible.length,
      limit,
      since: hasNext && last ? last.id : 0,
      next:
        hasNext && last ? buildNextUrl(requestUrl, limit, last.id) : undefined
    },
    messages: visible.map(toMessageExternal)
  }
}

async function publishToUserStream(
  env: EnvBindings,
  userId: number,
  payload: unknown
): Promise<void> {
  const id = env.STREAM_HUB.idFromName(`user:${userId}`)
  const stub = env.STREAM_HUB.get(id)
  await stub.fetch('https://stream.internal/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export { StreamHub }

export default class GotifyWorker extends WorkerEntrypoint<EnvBindings> {
  public fetch(request: Request): Response | Promise<Response> {
    return app.fetch(request, this.env, this.ctx)
  }

  public scheduled(controller: ScheduledController): void {
    this.ctx.waitUntil(
      ensureMigrations(this.env.DB)
        .then(() =>
          Promise.all([
            ensureBootstrap(this.env),
            ensurePluginBootstrap(this.env.DB)
          ])
        )
        .then(() =>
          Promise.all([
            runScheduledPlugins({ env: this.env }, controller),
            deliverPendingIgotifyMessages(this.env, '')
          ])
        )
        .then(() => undefined)
    )
  }
}
