import { Buffer } from 'node:buffer'

import type { EnvBindings } from './types'
import type { IgotifySecNtfyResult } from './igotify-types'

const defaultSecNtfyUrl = 'https://api.secntfy.app'
const deviceTokenPrefix = 'NTFY-DEVICE-'
const defaultNotificationTitle = 'iGotify'
const defaultNotificationBody = 'New Gotify message'
const previewWhitespacePattern =
  /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g
const previewControlCharsPattern =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g
const textEncoder = new TextEncoder()

interface SecNtfyDeviceResponse {
  Message?: string
  Token?: string
  Status?: number
  message?: string
  token?: string
  status?: number
}

interface SendNotificationInput {
  deviceToken: string
  title: string
  body: string
  critical?: boolean
  imageUrl?: string
  priority?: number
}

interface DerElement {
  tag: number
  valueStart: number
  valueEnd: number
  nextOffset: number
}

interface RsaPublicKey {
  modulus: Uint8Array
  exponent: Uint8Array
}

const rsaPkcs1PaddingBytes = 11

function secNtfyUrl(env: EnvBindings): string {
  return (env.SECNTFY_SERVER_URL || defaultSecNtfyUrl).replace(/\/+$/, '')
}

function jsonHeaders(deviceToken: string): Headers {
  return new Headers({
    accept: 'application/json',
    'content-type': 'application/json',
    'X-NTFYME-DEVICE-KEY': deviceToken
  })
}

function utf8Bytes(value: string): Uint8Array {
  return textEncoder.encode(value)
}

function utf8ByteLength(value: string): number {
  return utf8Bytes(value).length
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) {
    return value
  }

  const suffix = '...'
  const suffixBytes = utf8ByteLength(suffix)
  const targetBytes = Math.max(0, maxBytes - suffixBytes)
  let output = ''
  let usedBytes = 0

  for (const char of value) {
    const charBytes = utf8ByteLength(char)
    if (usedBytes + charBytes > targetBytes) {
      break
    }
    output += char
    usedBytes += charBytes
  }

  return `${output}${suffix}`
}

export function normalizeIgotifyPreviewText(value: string): string {
  return value
    .replace(previewControlCharsPattern, ' ')
    .split(/\r\n|\r|\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(previewWhitespacePattern, ' ')
    .trim()
}

function notificationText(input: SendNotificationInput): {
  title: string
  body: string
} {
  const title = normalizeIgotifyPreviewText(input.title)
  const body = normalizeIgotifyPreviewText(input.body)

  return {
    title: title || defaultNotificationTitle,
    body: body || title || defaultNotificationBody
  }
}

function readDerElement(
  bytes: Uint8Array,
  offset: number,
  expectedTag?: number
): DerElement {
  const tag = bytes[offset]
  if (tag === undefined || (expectedTag !== undefined && tag !== expectedTag)) {
    throw new Error('Invalid RSA public key')
  }

  const firstLengthByte = bytes[offset + 1]
  if (firstLengthByte === undefined) {
    throw new Error('Invalid RSA public key')
  }

  let length = 0
  let valueStart = offset + 2
  if (firstLengthByte < 0x80) {
    length = firstLengthByte
  } else {
    const lengthBytes = firstLengthByte & 0x7f
    if (lengthBytes === 0 || lengthBytes > 4) {
      throw new Error('Invalid RSA public key')
    }

    valueStart += lengthBytes
    for (let index = 0; index < lengthBytes; index += 1) {
      const byte = bytes[offset + 2 + index]
      if (byte === undefined) {
        throw new Error('Invalid RSA public key')
      }
      length = (length << 8) | byte
    }
  }

  const valueEnd = valueStart + length
  if (valueEnd > bytes.length) {
    throw new Error('Invalid RSA public key')
  }

  return { tag, valueStart, valueEnd, nextOffset: valueEnd }
}

function stripLeadingZero(bytes: Uint8Array): Uint8Array {
  return bytes[0] === 0 ? bytes.slice(1) : bytes
}

function readInteger(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array; nextOffset: number } {
  const element = readDerElement(bytes, offset, 0x02)
  return {
    value: stripLeadingZero(bytes.slice(element.valueStart, element.valueEnd)),
    nextOffset: element.nextOffset
  }
}

function parsePkcs1PublicKey(der: Uint8Array): RsaPublicKey {
  const sequence = readDerElement(der, 0, 0x30)
  let offset = sequence.valueStart
  const modulus = readInteger(der, offset)
  offset = modulus.nextOffset
  const exponent = readInteger(der, offset)

  if (
    exponent.nextOffset !== sequence.valueEnd ||
    sequence.nextOffset !== der.length
  ) {
    throw new Error('Invalid RSA public key')
  }

  return {
    modulus: modulus.value,
    exponent: exponent.value
  }
}

function parseSpkiPublicKey(der: Uint8Array): RsaPublicKey {
  const sequence = readDerElement(der, 0, 0x30)
  const algorithm = readDerElement(der, sequence.valueStart, 0x30)
  const bitString = readDerElement(der, algorithm.nextOffset, 0x03)
  const unusedBits = der[bitString.valueStart]
  if (
    unusedBits !== 0 ||
    bitString.nextOffset !== sequence.valueEnd ||
    sequence.nextOffset !== der.length
  ) {
    throw new Error('Invalid RSA public key')
  }

  return parsePkcs1PublicKey(
    der.slice(bitString.valueStart + 1, bitString.valueEnd)
  )
}

function publicKeyDer(publicKey: string): Uint8Array {
  const keyText = publicKey.trim()
  const base64 = keyText.includes('BEGIN')
    ? keyText.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, '')
    : keyText

  return Buffer.from(base64, 'base64')
}

function parsePublicKey(publicKey: string): RsaPublicKey {
  const der = publicKeyDer(publicKey)
  try {
    return parsePkcs1PublicKey(der)
  } catch {
    return parseSpkiPublicKey(der)
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  const hex = Buffer.from(bytes).toString('hex')
  return hex.length > 0 ? BigInt(`0x${hex}`) : 0n
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16).padStart(length * 2, '0')
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length > length) {
    throw new Error('RSA encrypted payload is too large')
  }

  return bytes
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let currentBase = base % modulus
  let currentExponent = exponent

  while (currentExponent > 0n) {
    if ((currentExponent & 1n) === 1n) {
      result = (result * currentBase) % modulus
    }
    currentExponent >>= 1n
    currentBase = (currentBase * currentBase) % modulus
  }

  return result
}

function randomNonZeroBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let offset = 0

  while (offset < length) {
    const random = new Uint8Array(length - offset)
    crypto.getRandomValues(random)
    for (const byte of random) {
      if (byte !== 0) {
        bytes[offset] = byte
        offset += 1
      }
    }
  }

  return bytes
}

function rsaPlaintextLimit(publicKey: RsaPublicKey): number {
  return publicKey.modulus.length - rsaPkcs1PaddingBytes
}

function rsaPkcs1Encrypt(publicKey: RsaPublicKey, value: string): string {
  const message = utf8Bytes(value)
  const keyLength = publicKey.modulus.length
  if (message.length > rsaPlaintextLimit(publicKey)) {
    throw new Error('SecNtfy payload is too large for the RSA public key')
  }

  const padding = randomNonZeroBytes(keyLength - message.length - 3)
  const block = new Uint8Array(keyLength)
  block[0] = 0
  block[1] = 2
  block.set(padding, 2)
  block[2 + padding.length] = 0
  block.set(message, 3 + padding.length)

  const encrypted = modPow(
    bytesToBigInt(block),
    bytesToBigInt(publicKey.exponent),
    bytesToBigInt(publicKey.modulus)
  )
  return Buffer.from(bigIntToBytes(encrypted, keyLength)).toString('base64')
}

export function encryptForIgotifyDevice(
  publicKey: string,
  value: string
): string {
  const rsaPublicKey = parsePublicKey(publicKey)
  const limits = [
    ...new Set([rsaPlaintextLimit(rsaPublicKey), 190, 100])
  ].filter((limit) => limit > 0)
  let lastError: unknown

  for (const limit of limits) {
    try {
      return rsaPkcs1Encrypt(rsaPublicKey, truncateUtf8(value, limit))
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to encrypt SecNtfy payload')
}

export async function getIgotifyPublicKeyFromDevice(
  env: EnvBindings,
  deviceToken: string
): Promise<string> {
  const response = await fetch(`${secNtfyUrl(env)}/Message/Device`, {
    headers: jsonHeaders(deviceToken)
  })

  if (!response.ok) {
    throw new Error(`SecNtfy public key lookup failed with ${response.status}`)
  }

  const data = (await response.json()) as SecNtfyDeviceResponse
  const status = data.Status ?? data.status ?? response.status
  const token = data.Token ?? data.token ?? ''
  if (status !== 200 || !token) {
    throw new Error(
      data.Message ?? data.message ?? 'SecNtfy did not return a public key'
    )
  }

  return token
}

export async function sendIgotifySecNtfyNotification(
  env: EnvBindings,
  input: SendNotificationInput
): Promise<IgotifySecNtfyResult | null> {
  if (!input.deviceToken.includes(deviceTokenPrefix)) {
    return {
      Message: 'No valid SecNtfy Token!',
      Error: `You're token: ${input.deviceToken}; Is not a valid SecNtfy Token!`,
      Status: 500
    }
  }

  const publicKey = await getIgotifyPublicKeyFromDevice(env, input.deviceToken)
  const { title, body } = notificationText(input)
  const payload = {
    title: encryptForIgotifyDevice(publicKey, title),
    body: encryptForIgotifyDevice(publicKey, body),
    image: encryptForIgotifyDevice(publicKey, input.imageUrl ?? ''),
    notification: {
      mutablecontent: 1,
      mutableContent: 1,
      'mutable-content': 1,
      critical: input.critical ?? false,
      priority: input.priority ?? 0,
      sound: {
        name: 'default',
        volume: 1
      }
    }
  }

  const response = await fetch(`${secNtfyUrl(env)}/Message`, {
    method: 'POST',
    headers: jsonHeaders(input.deviceToken),
    body: JSON.stringify(payload)
  })

  const data = (await response
    .json()
    .catch(() => null)) as Partial<IgotifySecNtfyResult> | null
  if (!data) {
    return {
      Message: 'Response is null or empty!',
      Error: 'Response is null or empty!',
      Status: 500
    }
  }

  return {
    Message: data.Message ?? '',
    Error: data.Error ?? '',
    Status: data.Status ?? response.status
  }
}
