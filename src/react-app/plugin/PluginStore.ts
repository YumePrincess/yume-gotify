import { action } from 'mobx'

import { requestJson, requestText, requestVoid } from '../api'
import { BaseStore } from '../common/BaseStore'
import * as config from '../config'
import { SnackReporter } from '../snack/SnackManager'
import { IPlugin } from '../types'
import { translate } from '../i18n'

export class PluginStore extends BaseStore<IPlugin> {
  public onDelete: () => void = () => {}
  private readonly snack: SnackReporter

  public constructor(snack: SnackReporter) {
    super()
    this.snack = snack
  }

  public requestConfig = (id: number): Promise<string> =>
    requestText(`${config.get('url')}plugin/${id}/config`)

  public requestDisplay = (id: number): Promise<string> =>
    requestText(`${config.get('url')}plugin/${id}/display`)

  protected requestItems = (): Promise<IPlugin[]> =>
    requestJson<IPlugin[]>(`${config.get('url')}plugin`)

  protected requestDelete = (): Promise<void> => {
    this.snack(translate('cannotDeletePlugin'))
    throw new Error(translate('cannotDeletePlugin'))
  }

  public getName = (id: number): string => {
    const plugin = this.getByIDOrUndefined(id)
    return id === -1
      ? translate('allPlugins')
      : plugin !== undefined
        ? plugin.name
        : translate('unknown')
  }

  @action
  public changeConfig = async (
    id: number,
    newConfig: string
  ): Promise<void> => {
    await requestVoid(`${config.get('url')}plugin/${id}/config`, {
      method: 'POST',
      body: newConfig,
      headers: { 'content-type': 'application/x-yaml' }
    })
    this.snack(translate('pluginConfigUpdated'))
    await this.refresh()
  }

  @action
  public changeEnabledState = async (
    id: number,
    enabled: boolean
  ): Promise<void> => {
    await requestVoid(
      `${config.get('url')}plugin/${id}/${enabled ? 'enable' : 'disable'}`,
      {
        method: 'POST'
      }
    )
    this.snack(translate(enabled ? 'pluginEnabled' : 'pluginDisabled'))
    await this.refresh()
  }
}
