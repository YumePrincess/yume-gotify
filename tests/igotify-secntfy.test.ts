import { Buffer } from 'node:buffer'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildIgotifySecNtfyPayload,
  encryptForIgotifyDevice,
  getIgotifyPublicKeyFromDevice,
  normalizeIgotifyPreviewText
} from '../src/worker/igotify-secntfy'
import { createClient, createUser } from '../src/worker/db'
import { deliverIgotifyMessage } from '../src/worker/igotify'
import {
  getIgotifyDeviceByToken,
  upsertIgotifyDevice
} from '../src/worker/igotify-db'
import { ensureMigrations } from '../src/worker/migrations'

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+/eOX+oZ76UPGE3m79ugGRdWY
Vb7mFIC9pj81g95hT1twF27MRnn4vffycLal3C+iaFZDP1/sGNz9/xM3qmAN2Mgu
GFFXWjJVgeP4T38IKoacgc/40qitSVzkWHc9csxVa6o/2atktqChgfOyH8gtyzd6
CM6FhNZmG6V4K4SaXwIDAQAB
-----END PUBLIC KEY-----`

afterEach(() => vi.restoreAllMocks())

describe('realtime iGotify delivery', () => {
  it('reuses public keys but fetches a fresh key after re-registration', async () => {
    await ensureMigrations(env.DB)
    const registration = {
      clientToken: `gtfyc.${crypto.randomUUID()}`,
      deviceToken: `NTFY-DEVICE-${crypto.randomUUID()}`,
      gotifyUrl: 'https://gotify.test'
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ Status: 200, Token: publicKey })
      )
    await upsertIgotifyDevice(env.DB, registration, 0)
    const original = await getIgotifyDeviceByToken(
      env.DB,
      registration.clientToken
    )
    expect(original).not.toBeNull()
    for (let index = 0; index < 2; index += 1) {
      await expect(
        getIgotifyPublicKeyFromDevice(
          env,
          registration.deviceToken,
          original!.keyVersion
        )
      ).resolves.toBe(publicKey)
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await upsertIgotifyDevice(env.DB, registration, 0)
    const refreshed = await getIgotifyDeviceByToken(
      env.DB,
      registration.clientToken
    )
    expect(refreshed!.keyVersion).not.toBe(original!.keyVersion)
    await getIgotifyPublicKeyFromDevice(
      env,
      registration.deviceToken,
      refreshed!.keyVersion
    )
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not cache failed key lookups and continues when the cache is unavailable', async () => {
    const deviceToken = `NTFY-DEVICE-${crypto.randomUUID()}`
    const keyVersion = crypto.randomUUID()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () =>
        Response.json({ Status: 200, Token: publicKey })
      )
    await expect(
      getIgotifyPublicKeyFromDevice(env, deviceToken, keyVersion)
    ).rejects.toThrow('503')
    await expect(
      getIgotifyPublicKeyFromDevice(env, deviceToken, keyVersion)
    ).resolves.toBe(publicKey)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    vi.spyOn(caches, 'open').mockRejectedValue(new Error('cache unavailable'))
    await expect(
      getIgotifyPublicKeyFromDevice(env, deviceToken, keyVersion)
    ).resolves.toBe(publicKey)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('delivers to another device while the first is blocked and deduplicates repeats', async () => {
    await ensureMigrations(env.DB)
    const user = await createUser(env.DB, {
      name: crypto.randomUUID(),
      pass: '',
      admin: false
    })
    const tokens: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const client = await createClient(env.DB, {
        name: `device-${index}`,
        userId: user.id
      })
      const deviceToken = `NTFY-DEVICE-${crypto.randomUUID()}`
      tokens.push(deviceToken)
      await upsertIgotifyDevice(
        env.DB,
        {
          clientToken: client.token,
          deviceToken,
          gotifyUrl: 'https://gotify.test'
        },
        0
      )
    }
    let releaseSlow!: () => void
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve
    })
    let fastSent = false
    let sends = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') {
        return Response.json({ Status: 200, Token: publicKey })
      }
      sends += 1
      if (new Headers(init.headers).get('X-NTFYME-DEVICE-KEY') === tokens[0]) {
        await slow
      } else {
        fastSent = true
      }
      return Response.json({ Status: 200, Message: 'sent' })
    })
    const message = {
      id: 1,
      appid: 1,
      title: 'test',
      message: 'instant',
      priority: 5,
      date: new Date().toISOString()
    }
    const delivery = deliverIgotifyMessage(
      env,
      user.id,
      message,
      'https://gotify.test'
    )
    try {
      await vi.waitFor(() => expect(fastSent).toBe(true), { timeout: 1000 })
    } finally {
      releaseSlow()
      await delivery
    }
    await expect(delivery).resolves.toEqual({
      checked: 2,
      forwarded: 2,
      failed: 0
    })
    await expect(
      deliverIgotifyMessage(env, user.id, message, 'https://gotify.test')
    ).resolves.toEqual({ checked: 2, forwarded: 0, failed: 0 })
    expect(sends).toBe(2)
  })
})

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

  it('uses the exact secntfy.nuget 1.0.9 notification shape', () => {
    const payload = buildIgotifySecNtfyPayload(publicKey, {
      deviceToken: 'NTFY-DEVICE-test',
      title: 'Title',
      body: 'Visible message',
      critical: false,
      imageUrl: '',
      priority: 5
    })

    expect(payload.notification).toEqual({
      critical: false,
      priority: 5,
      mutablecontent: 1,
      sound: {
        name: 'default',
        volume: 1
      }
    })
    expect(payload.notification).not.toHaveProperty('mutableContent')
    expect(payload.notification).not.toHaveProperty('mutable-content')
    expect(Buffer.from(payload.body, 'base64')).toHaveLength(128)
  })
})
