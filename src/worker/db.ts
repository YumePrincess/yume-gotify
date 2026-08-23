import { hash as hasher } from 'bcryptjs'

import type {
  ApplicationRow,
  ClientRow,
  EnvBindings,
  MessageRow,
  PluginConfigRow,
  PluginStateRow,
  UserRow
} from './types'
import { generateEnhancedToken, resolveEnhancedToken } from './tokens'
import { generateSortKey, passwordRounds } from './utils'

let bootstrapPromise: Promise<void> | null = null

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

async function run(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<D1Result> {
  return db
    .prepare(sql)
    .bind(...bindings)
    .run()
}

export function ensureBootstrap(env: EnvBindings): Promise<void> {
  bootstrapPromise ??= initializeBootstrap(env)
  return bootstrapPromise
}

async function initializeBootstrap(env: EnvBindings): Promise<void> {
  const row = await first<{ count: number | string }>(
    env.DB,
    'SELECT COUNT(*) AS count FROM users'
  )
  if (Number(row?.count ?? 0) > 0) {
    return
  }

  const password = env.GOTIFY_DEFAULTUSER_PASS?.trim()
  if (!password) {
    return
  }

  const name = env.GOTIFY_DEFAULTUSER_NAME?.trim() || 'admin'
  const hash = await hasher(
    password,
    passwordRounds(env.GOTIFY_PASSSTRENGTH)
  )
  try {
    await run(
      env.DB,
      'INSERT INTO users (name, pass, admin, created_at) VALUES (?, ?, 1, ?)',
      name,
      hash,
      new Date().toISOString()
    )
  } catch {
    // Another isolate may have created the user concurrently.
  }
}

export async function ping(db: D1Database): Promise<void> {
  await first<{ ok: number }>(db, 'SELECT 1 AS ok')
}

export function getUserById(
  db: D1Database,
  id: number
): Promise<UserRow | null> {
  return first<UserRow>(
    db,
    'SELECT id, name, pass, admin, oidc_id, created_at FROM users WHERE id = ?',
    id
  )
}

export function getUserByName(
  db: D1Database,
  name: string
): Promise<UserRow | null> {
  return first<UserRow>(
    db,
    'SELECT id, name, pass, admin, oidc_id, created_at FROM users WHERE name = ?',
    name
  )
}

export function getUserByOidcId(
  db: D1Database,
  oidcId: string
): Promise<UserRow | null> {
  return first<UserRow>(
    db,
    'SELECT id, name, pass, admin, oidc_id, created_at FROM users WHERE oidc_id = ?',
    oidcId
  )
}

export function getUserOidcId(
  db: D1Database,
  userId: number
): Promise<{ oidc_id: string | null } | null> {
  return first<{ oidc_id: string | null }>(
    db,
    'SELECT oidc_id FROM users WHERE id = ?',
    userId
  )
}

export function linkUserToOidc(
  db: D1Database,
  userId: number,
  oidcId: string
): Promise<D1Result> {
  return run(db, 'UPDATE users SET oidc_id = ? WHERE id = ?', oidcId, userId)
}

export async function createOidcUser(
  db: D1Database,
  input: { name: string; oidcId: string }
): Promise<UserRow> {
  const result = await run(
    db,
    'INSERT INTO users (name, pass, admin, oidc_id, created_at) VALUES (?, ?, 0, ?, ?)',
    input.name,
    '',
    input.oidcId,
    new Date().toISOString()
  )
  return (await getUserById(db, Number(result.meta.last_row_id))) as UserRow
}

export function getUsers(db: D1Database): Promise<UserRow[]> {
  return all<UserRow>(
    db,
    'SELECT id, name, pass, admin, oidc_id, created_at FROM users ORDER BY id ASC'
  )
}

export async function createUser(
  db: D1Database,
  input: { name: string; pass: string; admin: boolean }
): Promise<UserRow> {
  const result = await run(
    db,
    'INSERT INTO users (name, pass, admin, created_at) VALUES (?, ?, ?, ?)',
    input.name,
    input.pass,
    input.admin ? 1 : 0,
    new Date().toISOString()
  )
  return (await getUserById(db, Number(result.meta.last_row_id))) as UserRow
}

export async function updateUser(
  db: D1Database,
  input: { id: number; name: string; pass: string; admin: boolean }
): Promise<UserRow> {
  await run(
    db,
    'UPDATE users SET name = ?, pass = ?, admin = ? WHERE id = ?',
    input.name,
    input.pass,
    input.admin ? 1 : 0,
    input.id
  )
  return (await getUserById(db, input.id)) as UserRow
}

export function countAdmins(
  db: D1Database
): Promise<{ count: number | string } | null> {
  return first<{ count: number | string }>(
    db,
    'SELECT COUNT(*) AS count FROM users WHERE admin = 1'
  )
}

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await run(
    db,
    'DELETE FROM messages WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)',
    id
  )
  await run(db, 'DELETE FROM clients WHERE user_id = ?', id)
  await run(db, 'DELETE FROM applications WHERE user_id = ?', id)
  await run(db, 'DELETE FROM users WHERE id = ?', id)
}

export function getClientById(
  db: D1Database,
  id: number
): Promise<ClientRow | null> {
  return first<ClientRow>(
    db,
    'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE id = ?',
    id
  )
}

export async function getClientByToken(
  db: D1Database,
  token: string
): Promise<ClientRow | null> {
  const rawToken = token.trim()
  if (rawToken.startsWith('gtfyc.')) {
    const direct = await first<ClientRow>(
      db,
      'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE token = ?',
      rawToken
    )
    if (direct) {
      return direct
    }
  }
  const publicToken = await resolveEnhancedToken(token, 'c')
  if (!publicToken) {
    return Promise.resolve(null)
  }
  return first<ClientRow>(
    db,
    'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE token = ?',
    publicToken
  )
}

export function getClientsByUser(
  db: D1Database,
  userId: number
): Promise<ClientRow[]> {
  return all<ClientRow>(
    db,
    'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE user_id = ? ORDER BY id ASC',
    userId
  )
}

export function getClientsLastUsedBefore(
  db: D1Database,
  cutoffIso: string
): Promise<ClientRow[]> {
  return all<ClientRow>(
    db,
    'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE last_used IS NOT NULL AND last_used <= ? ORDER BY id ASC',
    cutoffIso
  )
}

export async function createClient(
  db: D1Database,
  input: {
    name: string
    userId: number
    elevatedUntil?: string | null
    expiresAfterInactivitySeconds?: number
  }
): Promise<ClientRow> {
  const tokens = await generateEnhancedToken('c')

  const result = await run(
    db,
    'INSERT INTO clients (token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    tokens.publicToken,
    input.userId,
    input.name,
    new Date().toISOString(),
    input.elevatedUntil ?? null,
    input.expiresAfterInactivitySeconds ?? 0
  )
  const created = (await getClientById(
    db,
    Number(result.meta.last_row_id)
  )) as ClientRow
  return { ...created, token: tokens.privateToken }
}

export async function updateClient(
  db: D1Database,
  input: { id: number; name: string; expiresAfterInactivitySeconds?: number }
): Promise<ClientRow> {
  await run(
    db,
    'UPDATE clients SET name = ?, expires_after_inactivity_seconds = COALESCE(?, expires_after_inactivity_seconds) WHERE id = ?',
    input.name,
    input.expiresAfterInactivitySeconds ?? null,
    input.id
  )
  return (await getClientById(db, input.id)) as ClientRow
}

export function deleteClient(db: D1Database, id: number): Promise<D1Result> {
  return run(db, 'DELETE FROM clients WHERE id = ?', id)
}

export function updateClientElevation(
  db: D1Database,
  id: number,
  elevatedUntil: string | null
): Promise<D1Result> {
  return run(db, 'UPDATE clients SET elevated_until = ? WHERE id = ?', elevatedUntil, id)
}

export function getClientByIdForUser(
  db: D1Database,
  id: number,
  userId: number
): Promise<ClientRow | null> {
  return first<ClientRow>(
    db,
    'SELECT id, token, user_id, name, last_used, created_at, elevated_until, expires_after_inactivity_seconds FROM clients WHERE id = ? AND user_id = ?',
    id,
    userId
  )
}

export function touchClient(
  db: D1Database,
  token: string,
  isoDate: string
): Promise<D1Result> {
  return run(
    db,
    'UPDATE clients SET last_used = ? WHERE token = ?',
    isoDate,
    token
  )
}

export function getApplicationById(
  db: D1Database,
  id: number
): Promise<ApplicationRow | null> {
  return first<ApplicationRow>(
    db,
    'SELECT id, token, user_id, name, description, internal, image, default_priority, last_used, sort_key, created_at FROM applications WHERE id = ?',
    id
  )
}

export async function getApplicationByToken(
  db: D1Database,
  token: string
): Promise<ApplicationRow | null> {
  const rawToken = token.trim()
  if (rawToken.startsWith('gtfya.')) {
    const direct = await first<ApplicationRow>(
      db,
      'SELECT id, token, user_id, name, description, internal, image, default_priority, last_used, sort_key, created_at FROM applications WHERE token = ?',
      rawToken
    )
    if (direct) {
      return direct
    }
  }
  const publicToken = await resolveEnhancedToken(token, 'a')
  if (!publicToken) {
    return Promise.resolve(null)
  }
  return first<ApplicationRow>(
    db,
    'SELECT id, token, user_id, name, description, internal, image, default_priority, last_used, sort_key, created_at FROM applications WHERE token = ?',
    publicToken
  )
}

export function getApplicationsByUser(
  db: D1Database,
  userId: number
): Promise<ApplicationRow[]> {
  return all<ApplicationRow>(
    db,
    'SELECT id, token, user_id, name, description, internal, image, default_priority, last_used, sort_key, created_at FROM applications WHERE user_id = ? ORDER BY sort_key ASC, id ASC',
    userId
  )
}

export async function createApplication(
  db: D1Database,
  input: {
    userId: number
    name: string
    description: string
    defaultPriority: number
    sortKey?: string
  }
): Promise<ApplicationRow> {
  const tokens = await generateEnhancedToken('a')

  const result = await run(
    db,
    `INSERT INTO applications
      (token, user_id, name, description, internal, image, default_priority, last_used, sort_key, created_at)
      VALUES (?, ?, ?, ?, 0, '', ?, NULL, ?, ?)`,
    tokens.publicToken,
    input.userId,
    input.name,
    input.description,
    input.defaultPriority,
    input.sortKey?.trim() || generateSortKey(),
    new Date().toISOString()
  )
  const created = (await getApplicationById(
    db,
    Number(result.meta.last_row_id)
  )) as ApplicationRow
  return { ...created, token: tokens.privateToken }
}

export async function updateApplication(
  db: D1Database,
  input: {
    id: number
    name: string
    description: string
    defaultPriority: number
    sortKey: string
    image: string
  }
): Promise<ApplicationRow> {
  await run(
    db,
    'UPDATE applications SET name = ?, description = ?, default_priority = ?, sort_key = ?, image = ? WHERE id = ?',
    input.name,
    input.description,
    input.defaultPriority,
    input.sortKey,
    input.image,
    input.id
  )
  return (await getApplicationById(db, input.id)) as ApplicationRow
}

export async function regenerateApplicationToken(
  db: D1Database,
  id: number
): Promise<{ application: ApplicationRow; privateToken: string }> {
  const tokens = await generateEnhancedToken('a')
  await run(db, 'UPDATE applications SET token = ? WHERE id = ?', tokens.publicToken, id)
  return {
    application: (await getApplicationById(db, id)) as ApplicationRow,
    privateToken: tokens.privateToken
  }
}

export async function deleteApplication(
  db: D1Database,
  id: number
): Promise<void> {
  await run(db, 'DELETE FROM messages WHERE application_id = ?', id)
  await run(db, 'DELETE FROM applications WHERE id = ?', id)
}

export function touchApplication(
  db: D1Database,
  token: string,
  isoDate: string
): Promise<D1Result> {
  return run(
    db,
    'UPDATE applications SET last_used = ? WHERE token = ?',
    isoDate,
    token
  )
}

export function getMessageById(
  db: D1Database,
  id: number
): Promise<MessageRow | null> {
  return first<MessageRow>(
    db,
    'SELECT id, application_id, message, title, priority, extras, date FROM messages WHERE id = ?',
    id
  )
}

export function getMessagesByApplication(
  db: D1Database,
  applicationId: number,
  limit: number,
  since: number
): Promise<MessageRow[]> {
  if (since > 0) {
    return all<MessageRow>(
      db,
      `SELECT id, application_id, message, title, priority, extras, date
       FROM messages
       WHERE application_id = ? AND id < ?
       ORDER BY id DESC
       LIMIT ?`,
      applicationId,
      since,
      limit
    )
  }
  return all<MessageRow>(
    db,
    `SELECT id, application_id, message, title, priority, extras, date
     FROM messages
     WHERE application_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    applicationId,
    limit
  )
}

export function getMessagesByUser(
  db: D1Database,
  userId: number,
  limit: number,
  since: number
): Promise<MessageRow[]> {
  if (since > 0) {
    return all<MessageRow>(
      db,
      `SELECT m.id, m.application_id, m.message, m.title, m.priority, m.extras, m.date
       FROM messages m
       JOIN applications a ON a.id = m.application_id
       WHERE a.user_id = ? AND m.id < ?
       ORDER BY m.id DESC
       LIMIT ?`,
      userId,
      since,
      limit
    )
  }
  return all<MessageRow>(
    db,
    `SELECT m.id, m.application_id, m.message, m.title, m.priority, m.extras, m.date
     FROM messages m
     JOIN applications a ON a.id = m.application_id
     WHERE a.user_id = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    userId,
    limit
  )
}

export function getMessagesByUserAfter(
  db: D1Database,
  userId: number,
  afterId: number,
  limit: number
): Promise<MessageRow[]> {
  return all<MessageRow>(
    db,
    `SELECT m.id, m.application_id, m.message, m.title, m.priority, m.extras, m.date
     FROM messages m
     JOIN applications a ON a.id = m.application_id
     WHERE a.user_id = ? AND m.id > ?
     ORDER BY m.id ASC
     LIMIT ?`,
    userId,
    afterId,
    limit
  )
}

export function getLatestMessageByUser(
  db: D1Database,
  userId: number
): Promise<{ id: number } | null> {
  return first<{ id: number }>(
    db,
    `SELECT m.id
     FROM messages m
     JOIN applications a ON a.id = m.application_id
     WHERE a.user_id = ?
     ORDER BY m.id DESC
     LIMIT 1`,
    userId
  )
}

export async function createMessage(
  db: D1Database,
  input: {
    applicationId: number
    message: string
    title: string
    priority: number
    extras: string | null
    date: string
  }
): Promise<MessageRow> {
  const result = await run(
    db,
    'INSERT INTO messages (application_id, message, title, priority, extras, date) VALUES (?, ?, ?, ?, ?, ?)',
    input.applicationId,
    input.message,
    input.title,
    input.priority,
    input.extras,
    input.date
  )
  return (await getMessageById(
    db,
    Number(result.meta.last_row_id)
  )) as MessageRow
}

export function deleteMessage(db: D1Database, id: number): Promise<D1Result> {
  return run(db, 'DELETE FROM messages WHERE id = ?', id)
}

export function deleteMessagesByApplication(
  db: D1Database,
  applicationId: number
): Promise<D1Result> {
  return run(db, 'DELETE FROM messages WHERE application_id = ?', applicationId)
}

export function deleteMessagesByUser(
  db: D1Database,
  userId: number
): Promise<D1Result> {
  return run(
    db,
    'DELETE FROM messages WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)',
    userId
  )
}

export function getPluginStateByToken(
  db: D1Database,
  token: string
): Promise<PluginStateRow | null> {
  return first<PluginStateRow>(
    db,
    'SELECT token, enabled, last_cleanup_at, last_deleted_count, last_error FROM plugin_states WHERE token = ?',
    token
  )
}

export function getPluginConfigByToken(
  db: D1Database,
  token: string
): Promise<PluginConfigRow | null> {
  return first<PluginConfigRow>(
    db,
    'SELECT token, config FROM plugin_configs WHERE token = ?',
    token
  )
}

export function setPluginEnabled(
  db: D1Database,
  token: string,
  enabled: boolean
): Promise<D1Result> {
  return run(
    db,
    'UPDATE plugin_states SET enabled = ? WHERE token = ?',
    enabled ? 1 : 0,
    token
  )
}

export function setPluginConfig(
  db: D1Database,
  token: string,
  config: string
): Promise<D1Result> {
  return run(
    db,
    'UPDATE plugin_configs SET config = ? WHERE token = ?',
    config,
    token
  )
}

export function updatePluginCleanupState(
  db: D1Database,
  token: string,
  input: { ranAt: string; deletedCount: number; error: string | null }
): Promise<void> {
  return run(
    db,
    'UPDATE plugin_states SET last_cleanup_at = ?, last_deleted_count = ?, last_error = ? WHERE token = ?',
    input.ranAt,
    input.deletedCount,
    input.error,
    token
  ).then(() => undefined)
}

export async function deleteMessagesOlderThan(
  db: D1Database,
  cutoffIso: string
): Promise<number> {
  const result = await run(
    db,
    'DELETE FROM messages WHERE date <= ?',
    cutoffIso
  )
  return Number(result.meta.changes ?? 0)
}
