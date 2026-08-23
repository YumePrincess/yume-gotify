import { Buffer } from 'node:buffer'
import { createPrivateKey, createPublicKey } from 'node:crypto'

const privateKeyPrefix = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20
])

export type EnhancedTokenKind = 'a' | 'c'

interface GeneratedEnhancedToken {
  privateToken: string
  publicToken: string
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }

  try {
    const decoded = Buffer.from(value, 'base64url')
    return decoded.length === 32 ? decoded : null
  } catch {
    return null
  }
}

function decodeBase64UrlBytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }
  try {
    return Buffer.from(value, 'base64url')
  } catch {
    return null
  }
}

export async function generateEnhancedToken(
  kind: EnhancedTokenKind
): Promise<GeneratedEnhancedToken> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const privateJwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.privateKey
  )) as JsonWebKey
  const publicJwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  )) as JsonWebKey

  if (!privateJwk.d || !publicJwk.x) {
    throw new Error('Ed25519 key export did not contain raw key material')
  }

  return {
    privateToken: `gtfy${kind}.${privateJwk.d}`,
    publicToken: `gtfy${kind}.${publicJwk.x}`
  }
}

/**
 * Gotify 3 stores the public Ed25519 key and hands the private seed to the
 * client only once. The two-part token returned by the server is therefore
 * canonicalized before every database lookup.
 */
export function canonicalizeEnhancedToken(
  token: string,
  expectedKind?: EnhancedTokenKind
): string | null {
  const match = /^gtfy([ac])\.([A-Za-z0-9_-]+)$/.exec(token.trim())
  if (!match) {
    return null
  }

  const kind = match[1] as EnhancedTokenKind
  if (expectedKind && kind !== expectedKind) {
    return null
  }

  const seed = decodeBase64Url(match[2])
  if (!seed) {
    return null
  }

  try {
    const privateKey = createPrivateKey({
      key: Buffer.concat([privateKeyPrefix, seed]),
      format: 'der',
      type: 'pkcs8'
    })
    const publicKey = createPublicKey(
      privateKey as unknown as Parameters<typeof createPublicKey>[0]
    ).export({
      format: 'der',
      type: 'spki'
    })
    const publicBytes = publicKey.subarray(-32)
    return `gtfy${kind}.${encodeBase64Url(publicBytes)}`
  } catch {
    return null
  }
}

/** Resolve both the one-time private form and Gotify's timestamped public form. */
export async function resolveEnhancedToken(
  token: string,
  expectedKind: EnhancedTokenKind
): Promise<string | null> {
  const parts = token.trim().split('.')
  if (parts.length === 2) {
    return canonicalizeEnhancedToken(token, expectedKind)
  }

  if (parts.length !== 4 || parts[0] !== `gtfy${expectedKind}`) {
    return null
  }

  const publicKey = decodeBase64Url(parts[1])
  const signature = decodeBase64UrlBytes(parts[3])
  const timestamp = Number(parts[2])
  if (!publicKey || !signature || signature.length !== 64 || !Number.isInteger(timestamp)) {
    return null
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 15 * 60) {
    return null
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    )
    const digest = await crypto.subtle.digest(
      'SHA-512',
      new TextEncoder().encode(`iat=${timestamp}`)
    )
    const valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      signature,
      digest
    )
    return valid ? `gtfy${expectedKind}.${encodeBase64Url(publicKey)}` : null
  } catch {
    return null
  }
}
