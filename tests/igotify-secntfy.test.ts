import { describe, expect, it } from 'vitest'

import { normalizeIgotifyPreviewText } from '../src/worker/igotify-secntfy'

describe('normalizeIgotifyPreviewText', () => {
  it('collapses multiline and control-heavy text for push previews', () => {
    expect(
      normalizeIgotifyPreviewText('  first line\n\nsecond\u0007\tline  ')
    ).toBe('first line second line')
  })

  it('returns an empty string when no readable text remains', () => {
    expect(normalizeIgotifyPreviewText('\u0000\n\t  ')).toBe('')
  })
})
