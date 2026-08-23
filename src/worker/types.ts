import type { PluginCapability } from '@gotify/sdk'

export type EnvBindings = Env

export interface UserRow {
  id: number
  name: string
  pass: string
  admin: number
  oidc_id?: string | null
  created_at?: string
}

export interface ClientRow {
  id: number
  token: string
  user_id: number
  name: string
  last_used: string | null
  created_at?: string
  elevated_until?: string | null
  expires_after_inactivity_seconds?: number
}

export interface ApplicationRow {
  id: number
  token: string
  user_id: number
  name: string
  description: string
  internal: number
  image: string
  default_priority: number
  last_used: string | null
  sort_key: string
  created_at?: string
}

export interface MessageRow {
  id: number
  application_id: number
  message: string
  title: string
  priority: number
  extras: string | null
  date: string
}

export interface PluginStateRow {
  token: string
  enabled: number
  last_cleanup_at: string | null
  last_deleted_count: number
  last_error: string | null
}

export interface PluginConfigRow {
  token: string
  config: string
}

export interface UserExternal {
  id: number
  name: string
  admin: boolean
  createdAt?: string
  clientId?: number
  elevatedUntil?: string | null
}

export interface ClientExternal {
  id: number
  token?: string
  name: string
  lastUsed: string | null
  createdAt?: string
  elevatedUntil?: string | null
  expiresAfterInactivitySeconds?: number
}

export interface ApplicationExternal {
  id: number
  token?: string
  name: string
  description: string
  internal: boolean
  image: string
  defaultPriority: number
  lastUsed: string | null
  sortKey: string
  createdAt?: string
}

export interface MessageExternal {
  id: number
  appid: number
  message: string
  title: string
  priority: number
  extras?: Record<string, unknown>
  date: string
}

export interface PluginExternal {
  id: number
  token: string
  name: string
  modulePath: string
  enabled: boolean
  author?: string
  website?: string
  license?: string
  capabilities: PluginCapability[]
}

export interface PagedMessages {
  paging: {
    next?: string
    size: number
    since: number
    limit: number
  }
  messages: MessageExternal[]
}

export interface AuthState {
  kind: 'basic' | 'client' | 'application' | 'optional'
  userId: number
  token: string
  user?: UserRow
}
