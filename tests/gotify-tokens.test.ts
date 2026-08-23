import { describe, expect, it } from 'vitest'

import {
  canonicalizeEnhancedToken,
  generateEnhancedToken,
  resolveEnhancedToken
} from '../src/worker/tokens'

describe('Gotify 3 enhanced tokens', () => {
  it('generates private tokens and canonicalizes them to public database tokens', async () => {
    const generated = await generateEnhancedToken('c')

    expect(generated.privateToken).toMatch(/^gtfyc\.[A-Za-z0-9_-]{43}$/)
    expect(generated.publicToken).toMatch(/^gtfyc\.[A-Za-z0-9_-]{43}$/)
    expect(canonicalizeEnhancedToken(generated.privateToken, 'c')).toBe(
      generated.publicToken
    )
    expect(await resolveEnhancedToken(generated.privateToken, 'c')).toBe(
      generated.publicToken
    )
    expect(canonicalizeEnhancedToken('ClegacyToken', 'c')).toBeNull()
  })
})
