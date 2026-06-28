import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import {
  encryptForIgotifyDevice,
  normalizeIgotifyPreviewText
} from '../src/worker/igotify-secntfy'

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+/eOX+oZ76UPGE3m79ugGRdWY
Vb7mFIC9pj81g95hT1twF27MRnn4vffycLal3C+iaFZDP1/sGNz9/xM3qmAN2Mgu
GFFXWjJVgeP4T38IKoacgc/40qitSVzkWHc9csxVa6o/2atktqChgfOyH8gtyzd6
CM6FhNZmG6V4K4SaXwIDAQAB
-----END PUBLIC KEY-----`

describe('normalizeIgotifyPreviewText', () => {
  it('collapses multiline and control-heavy text for push previews', () => {
    expect(
      normalizeIgotifyPreviewText('  first line\n\nsecond\u0007\tline  ')
    ).toBe('first line second line')
  })

  it('returns an empty string when no readable text remains', () => {
    expect(normalizeIgotifyPreviewText('\u0000\n\t  ')).toBe('')
  })

  it('encrypts preview text into an RSA-sized SecNtfy ciphertext', () => {
    const encrypted = encryptForIgotifyDevice(publicKey, 'visible message')
    expect(Buffer.from(encrypted, 'base64')).toHaveLength(128)
  })
})
