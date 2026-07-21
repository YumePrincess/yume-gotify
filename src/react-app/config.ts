import { IVersion } from './types'

export interface IConfig {
  url: string
  register: boolean
  version: IVersion
  backgroundImageUrl: string
  logoBarUrl: string
}

declare global {
  interface Window {
    config?: Partial<IConfig>
  }
}

const config: IConfig = {
  url: 'unset',
  register: false,
  version: { commit: 'unknown', buildDate: 'unknown', version: 'unknown' },
  backgroundImageUrl: '/static/yume-background.webp',
  logoBarUrl: 'https://cdn-public.yume.zone/public/img/yumegotify.png',
  ...window.config
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const validVersion = (value: unknown): value is IVersion =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  typeof value.commit === 'string' &&
  typeof value.buildDate === 'string'

const validAssetUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return false
  }

  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch(`${config.url}config`, {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
    if (!response.ok) {
      return
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload)) {
      return
    }

    if (typeof payload.register === 'boolean') {
      config.register = payload.register
    }
    if (validVersion(payload.version)) {
      config.version = payload.version
    }
    if (validAssetUrl(payload.backgroundImageUrl)) {
      config.backgroundImageUrl = payload.backgroundImageUrl.trim()
    }
    if (validAssetUrl(payload.logoBarUrl)) {
      config.logoBarUrl = payload.logoBarUrl.trim()
    }
  } catch {
    // Keep the bundled defaults when runtime configuration is unavailable.
  }
}

export function applyBackgroundImage(): void {
  const cssUrl = `url(${JSON.stringify(config.backgroundImageUrl)})`
  document.documentElement.style.setProperty('--page-background-image', cssUrl)
}

export function set<Key extends keyof IConfig>(
  key: Key,
  value: IConfig[Key]
): void {
  config[key] = value
}

export function get<K extends keyof IConfig>(key: K): IConfig[K] {
  return config[key]
}
