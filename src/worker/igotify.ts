import {
  getClientByToken,
  getClientsByUser,
  getLatestMessageByUser,
  getMessagesByUserAfter
} from './db'
import {
  completeIgotifyNotificationDelivery,
  deleteIgotifyDevice,
  disableIgotifyDevice,
  getIgotifyDeviceByToken,
  igotifyDeviceExists,
  insertIgotifyDevice,
  listIgotifyDevices,
  listIgotifyDevicesByClientTokens,
  releaseIgotifyNotificationDelivery,
  reserveIgotifyNotificationDelivery,
  updateIgotifyHeaders,
  updateIgotifyLastMessageId
} from './igotify-db'
import { sendIgotifySecNtfyNotification } from './igotify-secntfy'
import type {
  IgotifyCustomHeaderInput,
  IgotifyDeliverySummary,
  IgotifyDeviceRecord,
  IgotifyDeviceRegistration,
  IgotifyValidatedDeviceRegistration
} from './igotify-types'
import type { EnvBindings, MessageExternal } from './types'
import { toMessageExternal } from './utils'

const minDeviceTokenLength = 60
const pendingMessagesPerDevice = 50

const igotifyCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'content-type,authorization,x-igotify-secret,x-gotify-key',
  'Access-Control-Max-Age': '86400'
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

function shouldLog(env: EnvBindings): boolean {
  return String(env.ENABLE_CONSOLE_LOG ?? 'true') !== 'false'
}

function logIgotifyError(
  env: EnvBindings,
  event: string,
  data: Record<string, unknown>
): void {
  if (!shouldLog(env)) {
    return
  }

  console.error(
    JSON.stringify({
      event,
      ...data
    })
  )
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...igotifyCorsHeaders,
      ...init.headers
    }
  })
}

function ok(message: string, successful: boolean): Response {
  return json({ Message: message, Successful: successful })
}

function badRequest(message: string): Response {
  return json({ Message: message, Successful: false }, { status: 400 })
}

function notFound(): Response {
  return json({ Message: 'Not found', Successful: false }, { status: 404 })
}

function methodNotAllowed(): Response {
  return json(
    { Message: 'Method not allowed', Successful: false },
    { status: 405 }
  )
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.length > 0 && !contentType.includes('application/json')) {
    throw json(
      { Message: 'Expected application/json', Successful: false },
      { status: 415 }
    )
  }

  return (await request.json()) as T
}

function currentOrigin(request: Request): string {
  return new URL(request.url).origin.replace(/\/+$/, '')
}

function validateRegistration(
  input: IgotifyDeviceRegistration,
  gotifyUrl: string
): IgotifyValidatedDeviceRegistration | Response {
  const clientToken = (input.ClientToken ?? input.clientToken ?? '').trim()
  const deviceToken = (input.DeviceToken ?? input.deviceToken ?? '').trim()

  if (
    clientToken.length === 0 ||
    clientToken === 'string' ||
    deviceToken.length < minDeviceTokenLength ||
    deviceToken === 'string'
  ) {
    return ok('Fehler beim hinzugefuegen des Geraetes!', false)
  }

  return { clientToken, deviceToken, gotifyUrl }
}

function serializeHeaders(
  headers: IgotifyCustomHeaderInput[]
): string | Response {
  if (!Array.isArray(headers) || headers.length === 0) {
    return badRequest('CustomHeaders were not set!')
  }

  const normalized = headers
    .map((header) => ({
      Key: header.Key ?? header.key ?? '',
      Value: header.Value ?? header.value ?? ''
    }))
    .filter((header) => header.Key.length > 0 && header.Value.length > 0)

  if (normalized.length === 0) {
    return badRequest('CustomHeaders were not set!')
  }

  return JSON.stringify(normalized)
}

function normalizeIgotifyMessage(input: unknown): MessageExternal {
  const record =
    input !== null && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {}

  const id = Number(record.id ?? 0)
  const appid = Number(record.appid ?? 0)
  const priority = Number(record.priority ?? 0)

  return {
    id: Number.isFinite(id) ? id : 0,
    appid: Number.isFinite(appid) ? appid : 0,
    message: typeof record.message === 'string' ? record.message : '',
    title: typeof record.title === 'string' ? record.title : '',
    priority: Number.isFinite(priority) ? priority : 0,
    extras:
      record.extras && typeof record.extras === 'object'
        ? (record.extras as Record<string, unknown>)
        : undefined,
    date:
      typeof record.date === 'string' ? record.date : new Date().toISOString()
  }
}

function buildGotifyImageUrl(
  device: IgotifyDeviceRecord,
  message: MessageExternal,
  fallbackGotifyUrl: string
): string {
  if (!message.appid) {
    return ''
  }

  const gotifyUrl = (device.gotifyUrl || fallbackGotifyUrl).replace(/\/+$/, '')
  return `${gotifyUrl}$$$${message.appid}$$$${device.clientToken}`
}

async function forwardIgotifyMessageToDevice(
  env: EnvBindings,
  device: IgotifyDeviceRecord,
  message: MessageExternal,
  fallbackGotifyUrl: string
): Promise<boolean> {
  const messageId = Number(message.id)
  const shouldDedupe = Number.isFinite(messageId) && messageId > 0

  if (shouldDedupe) {
    if (messageId <= device.lastMessageId) {
      return false
    }

    const reserved = await reserveIgotifyNotificationDelivery(
      env.DB,
      device,
      messageId
    )
    if (!reserved) {
      await updateIgotifyLastMessageId(
        env.DB,
        device.uid,
        Math.max(device.lastMessageId, messageId)
      )
      return false
    }
  }

  try {
    const result = await sendIgotifySecNtfyNotification(env, {
      deviceToken: device.deviceToken,
      title: message.title,
      body: message.message,
      critical: message.priority === 10,
      imageUrl: buildGotifyImageUrl(device, message, fallbackGotifyUrl),
      priority: message.priority
    })

    if (!result || result.Status < 200 || result.Status >= 300) {
      throw new Error(
        result?.Error || result?.Message || 'SecNtfy notification failed'
      )
    }

    if (shouldDedupe) {
      await completeIgotifyNotificationDelivery(env.DB, device, messageId)
      await updateIgotifyLastMessageId(
        env.DB,
        device.uid,
        Math.max(device.lastMessageId, messageId)
      )
    }

    return true
  } catch (error) {
    if (shouldDedupe) {
      await releaseIgotifyNotificationDelivery(env.DB, device, messageId)
    }
    throw error
  }
}

async function handleDevicePost(
  request: Request,
  env: EnvBindings
): Promise<Response> {
  const input = await readJson<IgotifyDeviceRegistration>(request)
  const registration = validateRegistration(input, currentOrigin(request))
  if (isResponse(registration)) {
    return registration
  }

  if (await igotifyDeviceExists(env.DB, registration.clientToken)) {
    return ok('Fehler beim hinzugefuegen des Geraetes!', false)
  }

  const client = await getClientByToken(env.DB, registration.clientToken)
  if (!client) {
    return ok('Fehler beim hinzugefuegen des Geraetes!', false)
  }

  const latest = await getLatestMessageByUser(env.DB, client.user_id)
  const inserted = await insertIgotifyDevice(
    env.DB,
    registration,
    latest?.id ?? 0
  )
  return inserted
    ? ok('Geraet erfolgreich hinzugefuegt', true)
    : ok('Fehler beim hinzugefuegen des Geraetes!', false)
}

async function handleDeviceDelete(
  url: URL,
  env: EnvBindings
): Promise<Response> {
  const token = url.searchParams.get('token')?.trim() ?? ''
  if (token.length === 0 || token === 'string') {
    return ok('Error deleting device!', false)
  }

  const deleted = await deleteIgotifyDevice(env.DB, token)
  return deleted
    ? ok('Device deleted successfully!', true)
    : ok('Error deleting device!', false)
}

async function handleCustomHeaders(
  request: Request,
  env: EnvBindings,
  token: string
): Promise<Response> {
  if (token.length === 0) {
    return badRequest('Token not set!')
  }

  const device = await getIgotifyDeviceByToken(env.DB, token)
  if (!device) {
    return badRequest('User not found!')
  }

  const headers = serializeHeaders(
    await readJson<IgotifyCustomHeaderInput[]>(request)
  )
  if (isResponse(headers)) {
    return headers
  }

  const updated = await updateIgotifyHeaders(env.DB, device.uid, headers)
  return json({
    Message: updated ? 'CustomHeaders successfully added!' : '',
    Successful: updated
  })
}

async function handleTest(
  env: EnvBindings,
  deviceToken: string
): Promise<Response> {
  if (deviceToken.length > 0) {
    await sendIgotifySecNtfyNotification(env, {
      deviceToken,
      title: 'Test',
      body: 'Test Notification'
    })
  }

  return json({})
}

async function handleNotify(
  request: Request,
  env: EnvBindings,
  clientToken: string
): Promise<Response> {
  const device = await getIgotifyDeviceByToken(env.DB, clientToken)
  if (!device) {
    return badRequest('User not found!')
  }

  const message = normalizeIgotifyMessage(await readJson<unknown>(request))
  const delivered = await forwardIgotifyMessageToDevice(
    env,
    device,
    message,
    currentOrigin(request)
  )

  return json(
    delivered
      ? { Message: 'Notification delivered.', Error: '', Status: 200 }
      : { Message: 'Notification already delivered.', Error: '', Status: 200 }
  )
}

function handleRealtime(env: EnvBindings): Response {
  return json({
    enabled: true,
    mode: 'integrated',
    poller: false,
    version: env.IGOTIFY_VERSION ?? env.GOTIFY_VERSION ?? 'worker-dev'
  })
}

export async function maybeHandleIgotifyRequest(
  request: Request,
  env: EnvBindings
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = normalizePath(url.pathname)
  const lowerPath = path.toLowerCase()

  try {
    if (lowerPath === '/api/version' && request.method === 'GET') {
      return json({
        version: env.IGOTIFY_VERSION ?? env.GOTIFY_VERSION ?? 'worker-dev',
        buildDate:
          env.IGOTIFY_BUILD_DATE ??
          env.GOTIFY_BUILD_DATE ??
          new Date().toISOString(),
        commit: env.GOTIFY_COMMIT ?? ''
      })
    }

    if (
      (lowerPath === '/api/realtime' || lowerPath === '/realtime') &&
      request.method === 'GET'
    ) {
      return handleRealtime(env)
    }

    if (lowerPath === '/api/device' || lowerPath === '/device') {
      if (request.method === 'POST') {
        return handleDevicePost(request, env)
      }

      if (request.method === 'DELETE') {
        return handleDeviceDelete(url, env)
      }

      return methodNotAllowed()
    }

    const customHeadersMatch = path.match(
      /^\/(?:api\/)?Device\/CustomHeaders\/(.+)$/i
    )
    if (customHeadersMatch) {
      if (request.method !== 'POST') {
        return methodNotAllowed()
      }

      return handleCustomHeaders(
        request,
        env,
        decodeURIComponent(customHeadersMatch[1] ?? '')
      )
    }

    const testMatch = path.match(/^\/(?:api\/)?Device\/Test\/(.+)$/i)
    if (testMatch) {
      if (request.method !== 'GET') {
        return methodNotAllowed()
      }

      return handleTest(env, decodeURIComponent(testMatch[1] ?? ''))
    }

    const notifyMatch = path.match(/^\/(?:api\/)?Notify\/(.+)$/i)
    if (notifyMatch) {
      if (request.method !== 'POST') {
        return methodNotAllowed()
      }

      return handleNotify(
        request,
        env,
        decodeURIComponent(notifyMatch[1] ?? '')
      )
    }

    if (
      lowerPath.startsWith('/api/device/') ||
      lowerPath.startsWith('/api/notify/')
    ) {
      return notFound()
    }

    return null
  } catch (error) {
    if (isResponse(error)) {
      return error
    }

    logIgotifyError(env, 'igotify_request_failed', {
      path,
      error: error instanceof Error ? error.message : String(error)
    })
    return json(
      { Message: 'Internal server error', Successful: false },
      { status: 500 }
    )
  }
}

export async function deliverIgotifyMessage(
  env: EnvBindings,
  userId: number,
  message: MessageExternal,
  gotifyUrl: string
): Promise<IgotifyDeliverySummary> {
  const clients = await getClientsByUser(env.DB, userId)
  const devices = await listIgotifyDevicesByClientTokens(
    env.DB,
    clients.map((client) => client.token)
  )
  const summary: IgotifyDeliverySummary = {
    checked: devices.length,
    forwarded: 0,
    failed: 0
  }

  for (const device of devices) {
    try {
      if (
        await forwardIgotifyMessageToDevice(env, device, message, gotifyUrl)
      ) {
        summary.forwarded += 1
      }
    } catch (error) {
      summary.failed += 1
      logIgotifyError(env, 'igotify_delivery_failed', {
        uid: device.uid,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return summary
}

export async function deliverPendingIgotifyMessages(
  env: EnvBindings,
  gotifyUrl: string
): Promise<IgotifyDeliverySummary> {
  const devices = await listIgotifyDevices(env.DB)
  const summary: IgotifyDeliverySummary = {
    checked: devices.length,
    forwarded: 0,
    failed: 0
  }

  for (const device of devices) {
    try {
      const client = await getClientByToken(env.DB, device.clientToken)
      if (!client) {
        await disableIgotifyDevice(
          env.DB,
          device.uid,
          'Gotify client token does not exist'
        )
        continue
      }

      const rows = await getMessagesByUserAfter(
        env.DB,
        client.user_id,
        device.lastMessageId,
        pendingMessagesPerDevice
      )

      for (const row of rows) {
        const delivered = await forwardIgotifyMessageToDevice(
          env,
          device,
          toMessageExternal(row),
          gotifyUrl
        )
        if (delivered) {
          summary.forwarded += 1
        }
      }
    } catch (error) {
      summary.failed += 1
      logIgotifyError(env, 'igotify_pending_delivery_failed', {
        uid: device.uid,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return summary
}
