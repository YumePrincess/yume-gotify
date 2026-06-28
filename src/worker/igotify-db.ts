import type {
  IgotifyDeviceRecord,
  IgotifyDeviceRow,
  IgotifyValidatedDeviceRegistration
} from './igotify-types'

function mapDevice(row: IgotifyDeviceRow): IgotifyDeviceRecord {
  return {
    uid: row.uid,
    clientToken: row.client_token,
    deviceToken: row.device_token,
    gotifyUrl: row.gotify_url,
    headers: row.headers,
    lastMessageId: row.last_message_id,
    disabledAt: row.disabled_at,
    disabledReason: row.disabled_reason
  }
}

async function all<T>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T[]> {
  const result = await db
    .prepare(sql)
    .bind(...bindings)
    .all<T>()
  return (result.results ?? []) as T[]
}

async function first<T>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T | null> {
  return (
    (await db
      .prepare(sql)
      .bind(...bindings)
      .first<T>()) ?? null
  )
}

function run(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<D1Result> {
  return db
    .prepare(sql)
    .bind(...bindings)
    .run()
}

export async function listIgotifyDevices(
  db: D1Database
): Promise<IgotifyDeviceRecord[]> {
  const rows = await all<IgotifyDeviceRow>(
    db,
    `SELECT uid, client_token, device_token, gotify_url, headers, last_message_id, disabled_at, disabled_reason
     FROM igotify_devices
     WHERE disabled_at IS NULL
     ORDER BY uid ASC`
  )
  return rows.map(mapDevice)
}

export async function listIgotifyDevicesByClientTokens(
  db: D1Database,
  clientTokens: string[]
): Promise<IgotifyDeviceRecord[]> {
  if (clientTokens.length === 0) {
    return []
  }

  const placeholders = clientTokens.map(() => '?').join(', ')
  const rows = await all<IgotifyDeviceRow>(
    db,
    `SELECT uid, client_token, device_token, gotify_url, headers, last_message_id, disabled_at, disabled_reason
     FROM igotify_devices
     WHERE disabled_at IS NULL AND client_token IN (${placeholders})
     ORDER BY uid ASC`,
    ...clientTokens
  )
  return rows.map(mapDevice)
}

export async function getIgotifyDeviceByToken(
  db: D1Database,
  token: string
): Promise<IgotifyDeviceRecord | null> {
  const column = token.includes('NTFY-DEVICE-')
    ? 'device_token'
    : 'client_token'
  const row = await first<IgotifyDeviceRow>(
    db,
    `SELECT uid, client_token, device_token, gotify_url, headers, last_message_id, disabled_at, disabled_reason
     FROM igotify_devices
     WHERE ${column} = ? AND disabled_at IS NULL
     LIMIT 1`,
    token
  )
  return row ? mapDevice(row) : null
}

export async function igotifyDeviceExists(
  db: D1Database,
  clientToken: string
): Promise<boolean> {
  const row = await first<{ uid: number }>(
    db,
    'SELECT uid FROM igotify_devices WHERE client_token = ? LIMIT 1',
    clientToken
  )
  return row !== null
}

export async function insertIgotifyDevice(
  db: D1Database,
  registration: IgotifyValidatedDeviceRegistration,
  lastMessageId: number
): Promise<boolean> {
  const result = await run(
    db,
    `INSERT INTO igotify_devices
      (client_token, device_token, gotify_url, headers, last_message_id)
     VALUES (?, ?, ?, '[]', ?)`,
    registration.clientToken,
    registration.deviceToken,
    registration.gotifyUrl,
    lastMessageId
  )
  return result.success
}

export async function deleteIgotifyDevice(
  db: D1Database,
  clientToken: string
): Promise<boolean> {
  const result = await run(
    db,
    'DELETE FROM igotify_devices WHERE client_token = ?',
    clientToken
  )
  return Number(result.meta.changes ?? 0) > 0
}

export async function updateIgotifyHeaders(
  db: D1Database,
  uid: number,
  headers: string
): Promise<boolean> {
  const result = await run(
    db,
    'UPDATE igotify_devices SET headers = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?',
    headers,
    uid
  )
  return Number(result.meta.changes ?? 0) > 0
}

export async function updateIgotifyLastMessageId(
  db: D1Database,
  uid: number,
  lastMessageId: number
): Promise<boolean> {
  const result = await run(
    db,
    'UPDATE igotify_devices SET last_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?',
    lastMessageId,
    uid
  )
  return result.success
}

export async function disableIgotifyDevice(
  db: D1Database,
  uid: number,
  reason: string
): Promise<boolean> {
  const result = await run(
    db,
    `UPDATE igotify_devices
     SET disabled_at = CURRENT_TIMESTAMP,
         disabled_reason = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE uid = ? AND disabled_at IS NULL`,
    reason,
    uid
  )
  return Number(result.meta.changes ?? 0) > 0
}

export async function reserveIgotifyNotificationDelivery(
  db: D1Database,
  device: IgotifyDeviceRecord,
  messageId: number
): Promise<boolean> {
  await run(
    db,
    `DELETE FROM igotify_notification_deliveries
     WHERE status = 'pending' AND created_at < datetime('now', '-10 minutes')`
  )

  const result = await run(
    db,
    `INSERT OR IGNORE INTO igotify_notification_deliveries
      (device_token, gotify_url, message_id)
     VALUES (?, ?, ?)`,
    device.deviceToken,
    device.gotifyUrl,
    messageId
  )
  return Number(result.meta.changes ?? 0) > 0
}

export async function completeIgotifyNotificationDelivery(
  db: D1Database,
  device: IgotifyDeviceRecord,
  messageId: number
): Promise<boolean> {
  const result = await run(
    db,
    `UPDATE igotify_notification_deliveries
     SET status = 'sent', sent_at = CURRENT_TIMESTAMP
     WHERE device_token = ? AND gotify_url = ? AND message_id = ?`,
    device.deviceToken,
    device.gotifyUrl,
    messageId
  )
  return result.success
}

export async function releaseIgotifyNotificationDelivery(
  db: D1Database,
  device: IgotifyDeviceRecord,
  messageId: number
): Promise<boolean> {
  const result = await run(
    db,
    `DELETE FROM igotify_notification_deliveries
     WHERE device_token = ? AND gotify_url = ? AND message_id = ? AND status = 'pending'`,
    device.deviceToken,
    device.gotifyUrl,
    messageId
  )
  return result.success
}
