import { compare } from 'bcryptjs'
import { createMiddleware } from 'hono/factory'

import {
  getApplicationByToken,
  getClientByToken,
  getUserById,
  getUserByName,
  touchApplication,
  touchClient
} from './db'
import type { AuthState, EnvBindings, UserRow } from './types'
import {
  ApiError,
  boolFromEnv,
  getBasicCredentials,
  getTokenFromRequest,
  isOlderThan
} from './utils'

type AppContext = {
  Bindings: EnvBindings
  Variables: {
    auth: AuthState | null
  }
}

async function getBasicUser(
  env: EnvBindings,
  request: Request
): Promise<UserRow | null> {
  if (!boolFromEnv(env.GOTIFY_LOCALAUTH_ENABLED, true)) {
    return null
  }
  const credentials = getBasicCredentials(request)
  if (!credentials) {
    return null
  }
  const user = await getUserByName(env.DB, credentials.name)
  if (!user) {
    return null
  }
  return (await compare(credentials.pass, user.pass)) ? user : null
}

function setAuth(
  c: { set: (key: 'auth', value: AuthState) => void },
  auth: AuthState
): void {
  c.set('auth', auth)
}

function isExpired(client: Awaited<ReturnType<typeof getClientByToken>>): boolean {
  if (!client || !client.expires_after_inactivity_seconds) {
    return false
  }
  const reference = client.last_used ?? client.created_at
  if (!reference) {
    return false
  }
  const timestamp = Date.parse(reference)
  return !Number.isNaN(timestamp) &&
    timestamp + client.expires_after_inactivity_seconds * 1000 <= Date.now()
}

export const optionalAuth = createMiddleware<AppContext>(async (c, next) => {
  const basicUser = await getBasicUser(c.env, c.req.raw)
  if (basicUser) {
    setAuth(c, {
      kind: 'basic',
      userId: basicUser.id,
      token: '',
      user: basicUser
    })
    await next()
    return
  }

  const token = getTokenFromRequest(c.req.raw)
  if (token) {
    const client = await getClientByToken(c.env.DB, token)
    if (client && !isExpired(client)) {
      setAuth(c, {
        kind: 'optional',
        userId: client.user_id,
        token: client.token
      })
      await next()
      return
    }
  }

  c.set('auth', null)
  await next()
})

export const requireClient = createMiddleware<AppContext>(async (c, next) => {
  const basicUser = await getBasicUser(c.env, c.req.raw)
  if (basicUser) {
    setAuth(c, {
      kind: 'basic',
      userId: basicUser.id,
      token: '',
      user: basicUser
    })
    await next()
    return
  }

  const token = getTokenFromRequest(c.req.raw)
  if (!token) {
    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }

  const client = await getClientByToken(c.env.DB, token)
  if (!client || isExpired(client)) {
    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }

  if (isOlderThan(client.last_used, 5 * 60 * 1000)) {
    await touchClient(c.env.DB, client.token, new Date().toISOString())
  }

  setAuth(c, {
    kind: 'client',
    userId: client.user_id,
    token: client.token
  })
  await next()
})

export const requireElevatedClient = createMiddleware<AppContext>(
  async (c, next) => {
    const basicUser = await getBasicUser(c.env, c.req.raw)
    if (basicUser) {
      setAuth(c, {
        kind: 'basic',
        userId: basicUser.id,
        token: '',
        user: basicUser
      })
      await next()
      return
    }

    const token = getTokenFromRequest(c.req.raw)
    const client = token
      ? await getClientByToken(c.env.DB, token)
      : null
    if (!client || isExpired(client)) {
      throw new ApiError(
        401,
        'you need to provide a valid access token or user credentials to access this api'
      )
    }

    if (
      !client.elevated_until ||
      Date.parse(client.elevated_until) <= Date.now()
    ) {
      throw new ApiError(
        403,
        'session not elevated, use basic auth or call /client:elevate'
      )
    }

    setAuth(c, {
      kind: 'client',
      userId: client.user_id,
      token: client.token
    })
    await next()
  }
)

export const requireAdmin = createMiddleware<AppContext>(async (c, next) => {
  const basicUser = await getBasicUser(c.env, c.req.raw)
  if (basicUser) {
    if (!basicUser.admin) {
      throw new ApiError(403, 'you are not allowed to access this api')
    }
    setAuth(c, {
      kind: 'basic',
      userId: basicUser.id,
      token: '',
      user: basicUser
    })
    await next()
    return
  }

  const token = getTokenFromRequest(c.req.raw)
  if (!token) {
    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }

  const client = await getClientByToken(c.env.DB, token)
  if (!client || isExpired(client)) {
    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }

  const user = await getUserById(c.env.DB, client.user_id)
  if (!user?.admin) {
    throw new ApiError(403, 'you are not allowed to access this api')
  }

  if (
    !client.elevated_until ||
    Date.parse(client.elevated_until) <= Date.now()
  ) {
    throw new ApiError(
      403,
      'session not elevated, use basic auth or call /client:elevate'
    )
  }

  if (isOlderThan(client.last_used, 5 * 60 * 1000)) {
    await touchClient(c.env.DB, client.token, new Date().toISOString())
  }

  setAuth(c, {
    kind: 'client',
    userId: client.user_id,
    token: client.token,
    user
  })
  await next()
})

export const requireApplication = createMiddleware<AppContext>(
  async (c, next) => {
    const basicUser = await getBasicUser(c.env, c.req.raw)
    if (basicUser) {
      throw new ApiError(403, 'you are not allowed to access this api')
    }

    const token = getTokenFromRequest(c.req.raw)
    if (!token) {
      throw new ApiError(
        401,
        'you need to provide a valid access token or user credentials to access this api'
      )
    }

    const application = await getApplicationByToken(c.env.DB, token)
    if (!application) {
      throw new ApiError(
        401,
        'you need to provide a valid access token or user credentials to access this api'
      )
    }

    if (isOlderThan(application.last_used, 5 * 60 * 1000)) {
      await touchApplication(c.env.DB, application.token, new Date().toISOString())
    }

    setAuth(c, {
      kind: 'application',
      userId: application.user_id,
      token: application.token
    })
    await next()
  }
)

export const requireApplicationOrClient = createMiddleware<AppContext>(
  async (c, next) => {
    const token = getTokenFromRequest(c.req.raw)
    if (token) {
      const application = await getApplicationByToken(c.env.DB, token)
      if (application) {
        if (isOlderThan(application.last_used, 5 * 60 * 1000)) {
          await touchApplication(
            c.env.DB,
            application.token,
            new Date().toISOString()
          )
        }
        setAuth(c, {
          kind: 'application',
          userId: application.user_id,
          token: application.token
        })
        await next()
        return
      }
    }

    const basicUser = await getBasicUser(c.env, c.req.raw)
    if (basicUser) {
      setAuth(c, {
        kind: 'basic',
        userId: basicUser.id,
        token: '',
        user: basicUser
      })
      await next()
      return
    }

    if (token) {
      const client = await getClientByToken(c.env.DB, token)
      if (client && !isExpired(client)) {
        if (isOlderThan(client.last_used, 5 * 60 * 1000)) {
          await touchClient(c.env.DB, client.token, new Date().toISOString())
        }
        setAuth(c, {
          kind: 'client',
          userId: client.user_id,
          token: client.token
        })
        await next()
        return
      }
    }

    throw new ApiError(
      401,
      'you need to provide a valid access token or user credentials to access this api'
    )
  }
)
