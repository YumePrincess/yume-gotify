import * as React from 'react'

export const languageChoices = [
  'auto',
  'en',
  'fr',
  'ja',
  'zh-cn',
  'zh-tw'
] as const
export const concreteLanguages = ['en', 'fr', 'ja', 'zh-cn', 'zh-tw'] as const
export const themeChoices = ['auto', 'dark', 'light'] as const

export type LanguageChoice = (typeof languageChoices)[number]
export type Language = (typeof concreteLanguages)[number]
export type ThemeChoice = (typeof themeChoices)[number]

const languageCookie = 'yume-preference-language'
const languageStorage = 'lang'
const themeCookie = 'yume-preference-theme'
const themeStorage = 'yume-theme'
const legacyThemeStorage = 'gotify-theme'
const preferenceEvent = 'yume-preferences-change'

const readCookie = (name: string): string => {
  const prefix = `${name}=`
  for (const rawPart of document.cookie ? document.cookie.split(';') : []) {
    const part = rawPart.trim()
    if (!part.startsWith(prefix)) continue
    try {
      return decodeURIComponent(part.slice(prefix.length))
    } catch {
      return part.slice(prefix.length)
    }
  }
  return ''
}

const writeCookie = (name: string, value: string): void => {
  const hostname = window.location.hostname.toLowerCase().replace(/\.$/, '')
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax'
  ]

  if (hostname === 'yume.zone' || hostname.endsWith('.yume.zone')) {
    attributes.push('Domain=yume.zone')
  }
  if (window.location.protocol === 'https:') attributes.push('Secure')
  document.cookie = attributes.join('; ')
}

const readStorage = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const writeStorage = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The shared cookie remains the source of truth when storage is unavailable.
  }
}

export const normalizeLanguage = (value: unknown): Language | '' => {
  const next = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')

  if (
    next.startsWith('zh-tw') ||
    next.startsWith('zh-hk') ||
    next.startsWith('zh-mo') ||
    next.startsWith('zh-hant')
  ) {
    return 'zh-tw'
  }
  if (
    next === 'zh' ||
    next.startsWith('zh-cn') ||
    next.startsWith('zh-sg') ||
    next.startsWith('zh-hans')
  ) {
    return 'zh-cn'
  }

  const short = next.slice(0, 2)
  return concreteLanguages.includes(short as Language)
    ? (short as Language)
    : ''
}

const normalizeLanguageChoice = (value: unknown): LanguageChoice | '' => {
  const next = String(value ?? '')
    .trim()
    .toLowerCase()
  return next === 'auto' ? 'auto' : normalizeLanguage(next)
}

const normalizeThemeChoice = (value: unknown): ThemeChoice | '' => {
  const next = String(value ?? '')
    .trim()
    .toLowerCase()
  const migrated = next === 'system' ? 'auto' : next
  return themeChoices.includes(migrated as ThemeChoice)
    ? (migrated as ThemeChoice)
    : ''
}

const getChoice = <T extends string>(
  cookieName: string,
  storageKey: string,
  normalize: (value: unknown) => T | '',
  fallback: T,
  legacyStorageKey?: string
): T => {
  const cookieChoice = normalize(readCookie(cookieName))
  if (cookieChoice) {
    if (readStorage(storageKey) !== cookieChoice) {
      writeStorage(storageKey, cookieChoice)
    }
    return cookieChoice
  }

  const storedChoice = normalize(
    readStorage(storageKey) ||
      (legacyStorageKey ? readStorage(legacyStorageKey) : '')
  )
  if (!storedChoice) return fallback

  writeCookie(cookieName, storedChoice)
  writeStorage(storageKey, storedChoice)
  return storedChoice
}

const readLanguageQuery = (): string => {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === 'lang') return value
  }
  return ''
}

const clearLanguageQuery = (): void => {
  const url = new URL(window.location.href)
  const keys = [...url.searchParams.keys()].filter(
    (key) => key.toLowerCase() === 'lang'
  )
  if (keys.length === 0) return
  keys.forEach((key) => url.searchParams.delete(key))
  window.history.replaceState(window.history.state, '', url.toString())
}

export const getLanguageChoice = (): LanguageChoice => {
  const queryChoice = normalizeLanguageChoice(readLanguageQuery())
  if (queryChoice) return queryChoice
  return getChoice(
    languageCookie,
    languageStorage,
    normalizeLanguageChoice,
    'auto'
  )
}

export const setLanguageChoice = (value: LanguageChoice): LanguageChoice => {
  const choice = normalizeLanguageChoice(value) || 'auto'
  writeCookie(languageCookie, choice)
  writeStorage(languageStorage, choice)
  clearLanguageQuery()
  window.dispatchEvent(new Event(preferenceEvent))
  return choice
}

export const resolveLanguage = (choice: LanguageChoice): Language => {
  if (choice !== 'auto') return choice
  const browserLanguages = Array.isArray(window.navigator.languages)
    ? window.navigator.languages
    : [window.navigator.language]
  for (const value of browserLanguages) {
    const language = normalizeLanguage(value)
    if (language) return language
  }
  return 'en'
}

export const getThemeChoice = (): ThemeChoice =>
  getChoice(
    themeCookie,
    themeStorage,
    normalizeThemeChoice,
    'auto',
    legacyThemeStorage
  )

export const setThemeChoice = (value: ThemeChoice): ThemeChoice => {
  const choice = normalizeThemeChoice(value) || 'auto'
  writeCookie(themeCookie, choice)
  writeStorage(themeStorage, choice)
  window.dispatchEvent(new Event(preferenceEvent))
  return choice
}

export const applyTheme = (choice: ThemeChoice): void => {
  if (choice === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', choice)
  }
}

const subscribe = (listener: VoidFunction): (() => void) => {
  const onVisibility = () => {
    if (!document.hidden) listener()
  }
  window.addEventListener('storage', listener)
  window.addEventListener('focus', listener)
  window.addEventListener('pageshow', listener)
  window.addEventListener(preferenceEvent, listener)
  document.addEventListener('visibilitychange', onVisibility)
  const interval = window.setInterval(() => {
    if (!document.hidden) listener()
  }, 1000)

  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener('focus', listener)
    window.removeEventListener('pageshow', listener)
    window.removeEventListener(preferenceEvent, listener)
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(interval)
  }
}

const useSyncedPreference = <T extends string>(
  read: () => T,
  write: (value: T) => T
): readonly [T, (value: T) => void] => {
  const [choice, setChoice] = React.useState<T>(read)

  React.useEffect(() => {
    const sync = () =>
      setChoice((current) => {
        const next = read()
        return current === next ? current : next
      })
    return subscribe(sync)
  }, [read])

  const update = React.useCallback(
    (value: T) => setChoice(write(value)),
    [write]
  )
  return [choice, update] as const
}

export const useLanguagePreference = () =>
  useSyncedPreference(getLanguageChoice, setLanguageChoice)

export const useThemePreference = () =>
  useSyncedPreference(getThemeChoice, setThemeChoice)
