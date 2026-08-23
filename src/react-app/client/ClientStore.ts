import { action } from 'mobx'

import { requestJson, requestVoid } from '../api'
import { BaseStore } from '../common/BaseStore'
import * as config from '../config'
import { SnackReporter } from '../snack/SnackManager'
import { IClient } from '../types'
import { translate } from '../i18n'

export class ClientStore extends BaseStore<IClient> {
  private readonly snack: SnackReporter

  public constructor(snack: SnackReporter) {
    super()
    this.snack = snack
  }

  protected requestItems = (): Promise<IClient[]> =>
    requestJson<IClient[]>(`${config.get('url')}client`)

  protected requestDelete(id: number): Promise<void> {
    return requestVoid(`${config.get('url')}client/${id}`, {
      method: 'DELETE'
    }).then(() => this.snack(translate('clientDeleted')))
  }

  @action
  public update = async (id: number, name: string): Promise<void> => {
    await requestVoid(`${config.get('url')}client/${id}`, {
      method: 'PUT',
      body: { name }
    })
    await this.refresh()
    this.snack(translate('clientUpdated'))
  }

  @action
  public createNoNotifcation = async (name: string): Promise<IClient> => {
    const client = await requestJson<IClient>(`${config.get('url')}client`, {
      method: 'POST',
      body: { name }
    })
    await this.refresh()
    const refreshed = this.items.find((item) => item.id === client.id)
    if (refreshed && client.token) {
      refreshed.token = client.token
    }
    return client
  }

  @action
  public create = async (name: string): Promise<void> => {
    await this.createNoNotifcation(name)
    this.snack(translate('clientAdded'))
  }
}
