import { action } from 'mobx'

import { requestJson, requestVoid } from '../api'
import { BaseStore } from '../common/BaseStore'
import * as config from '../config'
import { SnackReporter } from '../snack/SnackManager'
import { IUser } from '../types'
import { translate } from '../i18n'

export class UserStore extends BaseStore<IUser> {
  private readonly snack: SnackReporter

  constructor(snack: SnackReporter) {
    super()
    this.snack = snack
  }

  protected requestItems = (): Promise<IUser[]> =>
    requestJson<IUser[]>(`${config.get('url')}user`)

  protected requestDelete(id: number): Promise<void> {
    return requestVoid(`${config.get('url')}user/${id}`, {
      method: 'DELETE'
    }).then(() => this.snack(translate('userDeleted')))
  }

  @action
  public create = async (name: string, pass: string, admin: boolean) => {
    await requestVoid(`${config.get('url')}user`, {
      method: 'POST',
      body: { name, pass, admin }
    })
    await this.refresh()
    this.snack(translate('userCreated'))
  }

  @action
  public update = async (
    id: number,
    name: string,
    pass: string | null,
    admin: boolean
  ) => {
    await requestVoid(config.get('url') + 'user/' + id, {
      method: 'POST',
      body: { name, pass, admin }
    })
    await this.refresh()
    this.snack(translate('userUpdated'))
  }
}
