import { createRoot } from 'react-dom/client'

import { initApiClient } from './api'
import { AppStore } from './application/AppStore'
import { ClientStore } from './client/ClientStore'
import * as config from './config'
import { CurrentUser } from './CurrentUser'
import { I18nProvider } from './i18n'
import Layout from './layout/Layout'
import { MessagesStore } from './message/MessagesStore'
import { WebSocketStore } from './message/WebSocketStore'
import { PluginStore } from './plugin/PluginStore'
import { registerReactions } from './reactions'
import { unregister } from './registerServiceWorker'
import { SnackManager } from './snack/SnackManager'
import { StoreContext, StoreMapping } from './stores'
import { UserStore } from './user/UserStore'
import { applyTheme, getThemeChoice } from './preferences'
import './styles.css'

const { port, hostname, protocol, pathname } = window.location
const slashes = protocol.concat('//')
const path = pathname.endsWith('/')
  ? pathname
  : pathname.substring(0, pathname.lastIndexOf('/'))
const url = slashes.concat(port ? hostname.concat(':', port) : hostname) + path
const urlWithSlash = url.endsWith('/') ? url : url.concat('/')

const prodUrl = urlWithSlash

const initStores = (): StoreMapping => {
  const snackManager = new SnackManager()
  const appStore = new AppStore(snackManager.snack)
  const userStore = new UserStore(snackManager.snack)
  const messagesStore = new MessagesStore(appStore, snackManager.snack)
  const currentUser = new CurrentUser(snackManager.snack)
  const clientStore = new ClientStore(snackManager.snack)
  const wsStore = new WebSocketStore(snackManager.snack, currentUser)
  const pluginStore = new PluginStore(snackManager.snack)
  appStore.onDelete = () => messagesStore.clearAll()

  return {
    appStore,
    snackManager,
    userStore,
    messagesStore,
    currentUser,
    clientStore,
    wsStore,
    pluginStore
  }
}

;(async function clientJS() {
  applyTheme(getThemeChoice())
  config.set('url', prodUrl)
  await config.loadRuntimeConfig()
  applyTheme(getThemeChoice())
  config.applyBackgroundImage()
  const stores = initStores()
  initApiClient(stores.currentUser, stores.snackManager.snack)

  registerReactions(stores)

  stores.currentUser.tryAuthenticate().catch(() => {})

  window.onbeforeunload = () => {
    stores.wsStore.close()
  }

  createRoot(document.getElementById('root')!).render(
    <StoreContext.Provider value={stores}>
      <I18nProvider>
        <Layout />
      </I18nProvider>
    </StoreContext.Provider>
  )
  unregister()
})().catch((error) => {
  console.error('Failed to initialize Yume Gotify:', error)
})
