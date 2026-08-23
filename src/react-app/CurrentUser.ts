import { detect } from 'detect-browser'
import { observable, runInAction, action } from 'mobx'

import { isHttpError, requestJson, requestVoid } from './api'
import * as config from './config'
import { SnackReporter } from './snack/SnackManager'
import { IUser } from './types'
import { translate } from './i18n'

export class CurrentUser {
  private reconnectTimeoutId: number | null = null
  private reconnectTime = 7500
  @observable accessor loggedIn = false
  @observable accessor refreshKey = 0
  @observable accessor authenticating = true
  @observable accessor user: IUser = { name: 'unknown', admin: false, id: -1 }
  @observable accessor connectionErrorMessage: string | null = null

  public constructor(private readonly snack: SnackReporter) {}

  public token = (): string => {
    // Gotify 3 authenticates browser requests with the HttpOnly session cookie.
    return ''
  }

  public register = async (name: string, pass: string): Promise<boolean> =>
    requestVoid(config.get('url') + 'user', {
      method: 'POST',
      auth: false,
      handleError: false,
      body: { name, pass }
    })
      .then(() => {
        this.snack(translate('userCreatedLoggingIn'))
        this.login(name, pass)
        return true
      })
      .catch((error: unknown) => {
        if (!isHttpError(error)) {
          this.snack(translate('networkUnavailable'))
          return false
        }

        const data = error.data as {
          error?: string
          errorDescription?: string
        } | null
        this.snack(
          translate('registerFailed', {
            error: data?.error ?? translate('unknown'),
            description: data?.errorDescription ?? ''
          })
        )
        return false
      })

  public login = async (username: string, password: string) => {
    runInAction(() => {
      this.loggedIn = false
      this.authenticating = true
    })
    const browser = detect()
    const name =
      (browser && browser.name + ' ' + browser.version) ||
      translate('unknownBrowser')
    requestJson<IUser>(config.get('url') + 'auth/local/login', {
      method: 'POST',
      auth: false,
      handleError: false,
      body: new URLSearchParams({ name }),
      headers: { Authorization: 'Basic ' + btoa(username + ':' + password) }
    })
      .then(() => {
        this.snack(translate('sessionClientCreated', { name }))
        this.tryAuthenticate().catch(() => {
          console.log('session created, but cookie authentication failed')
        })
      })
      .catch(
        action(() => {
          this.authenticating = false
          return this.snack(translate('loginFailed'))
        })
      )
  }

  public tryAuthenticate = async (): Promise<IUser> => {
    return requestJson<IUser>(config.get('url') + 'current/user', {
      auth: false,
      handleError: false
    })
      .then(
        action((user) => {
          this.user = user
          this.loggedIn = true
          this.authenticating = false
          this.connectionErrorMessage = null
          this.reconnectTime = 7500
          return user
        })
      )
      .catch(
        action((error: unknown) => {
          this.authenticating = false
          if (!isHttpError(error)) {
            this.connectionError(translate('networkUnavailable'))
            return Promise.reject(error)
          }

          if (error.status >= 500) {
            this.connectionError(`${error.statusText} (code: ${error.status}).`)
            return Promise.reject(error)
          }

          this.connectionErrorMessage = null

          if (error.status >= 400 && error.status < 500) {
            this.logout()
          }
          return Promise.reject(error)
        })
      )
  }

  public logout = async () => {
    await requestVoid(config.get('url') + 'auth/logout', {
      method: 'POST',
      auth: false,
      handleError: false
    }).catch(() => undefined)
    runInAction(() => {
      this.loggedIn = false
    })
  }

  public changePassword = (pass: string) => {
    requestVoid(config.get('url') + 'current/user/password', {
      method: 'POST',
      body: { pass }
    }).then(() => this.snack(translate('passwordChanged')))
  }

  public tryReconnect = (quiet = false) => {
    this.tryAuthenticate().catch(() => {
      if (!quiet) {
        this.snack(translate('reconnectFailed'))
      }
    })
  }

  private readonly connectionError = (message: string) => {
    this.connectionErrorMessage = message
    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId)
    }
    this.reconnectTimeoutId = window.setTimeout(
      () => this.tryReconnect(true),
      this.reconnectTime
    )
    this.reconnectTime = Math.min(this.reconnectTime * 2, 120000)
  }
}
