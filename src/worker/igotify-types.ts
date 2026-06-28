export interface IgotifyDeviceRegistration {
  ClientToken?: string
  DeviceToken?: string
  GotifyUrl?: string
  clientToken?: string
  deviceToken?: string
  gotifyUrl?: string
}

export interface IgotifyValidatedDeviceRegistration {
  clientToken: string
  deviceToken: string
  gotifyUrl: string
}

export interface IgotifyCustomHeaderInput {
  Key?: string
  Value?: string
  key?: string
  value?: string
}

export interface IgotifyDeviceRow {
  uid: number
  client_token: string
  device_token: string
  gotify_url: string
  headers: string
  last_message_id: number
  disabled_at: string | null
  disabled_reason: string | null
}

export interface IgotifyDeviceRecord {
  uid: number
  clientToken: string
  deviceToken: string
  gotifyUrl: string
  headers: string
  lastMessageId: number
  disabledAt: string | null
  disabledReason: string | null
}

export interface IgotifySecNtfyResult {
  Message: string
  Error: string
  Status: number
}

export interface IgotifyDeliverySummary {
  checked: number
  forwarded: number
  failed: number
}
