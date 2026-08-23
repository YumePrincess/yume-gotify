import { isHttpError } from '../api'
import * as config from '../config'
import { CurrentUser } from '../CurrentUser'
import { SnackReporter } from '../snack/SnackManager'
import { IMessage } from '../types'
import { translate } from '../i18n'

export class WebSocketStore {
  private wsActive = false
  private ws: WebSocket | null = null

  public constructor(
    private readonly snack: SnackReporter,
    private readonly currentUser: CurrentUser
  ) {}

  public listen = (callback: (msg: IMessage) => void) => {
    if (!this.currentUser.loggedIn || this.wsActive) {
      return
    }
    this.wsActive = true

    const wsUrl = config
      .get('url')
      .replace('http', 'ws')
      .replace('https', 'wss')
    const ws = new WebSocket(wsUrl + 'stream')

    ws.onerror = (e) => {
      this.wsActive = false
      console.log('WebSocket connection errored', e)
    }

    ws.onmessage = (data) => callback(JSON.parse(data.data))

    ws.onclose = () => {
      this.wsActive = false
      this.currentUser
        .tryAuthenticate()
        .then(() => {
          this.snack(translate('websocketClosed'))
          return setTimeout(() => this.listen(callback), 30000)
        })
        .catch((error: unknown) => {
          if (isHttpError(error) && error.status === 401) {
            this.snack(translate('clientAuthenticationFailed'))
          }
        })
    }

    this.ws = ws
  }

  public close = () => this.ws?.close(1000, 'WebSocketStore#close')
}
