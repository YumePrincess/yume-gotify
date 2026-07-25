import { describe, expect, it } from 'vitest'

import {
  ApiError,
  buildAppImageObjectKey,
  normalizeBucketObjectPrefix
} from '../src/worker/utils'

describe('app image R2 prefixing', () => {
  it('defaults app image objects into the gotify/ prefix', () => {
    expect(buildAppImageObjectKey(undefined, 'logo.png')).toBe('gotify/logo.png')
  })

  it('normalizes configurable prefixes before building object keys', () => {
    expect(normalizeBucketObjectPrefix(' /custom-root// ')).toBe('custom-root/')
    expect(buildAppImageObjectKey('/custom-root//', 'logo.png')).toBe(
      'custom-root/logo.png'
    )
  })

  it('rejects invalid stored image names before touching R2', () => {
    expect(() => buildAppImageObjectKey('gotify/', '../escape.png')).toThrow(
      ApiError
    )
  })
})
