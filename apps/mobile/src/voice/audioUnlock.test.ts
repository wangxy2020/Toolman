/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { describe, expect, it } from 'vitest'
import { isUnlockProbeSrc } from './audioUnlock'

describe('isUnlockProbeSrc', () => {
  it('treats empty, silent WAV, and the page URL as the autoplay probe', () => {
    expect(isUnlockProbeSrc('')).toBe(true)
    expect(isUnlockProbeSrc(undefined)).toBe(true)
    expect(isUnlockProbeSrc('data:audio/wav;base64,AAA')).toBe(true)
    expect(isUnlockProbeSrc('http://localhost:8081/', 'http://localhost:8081/')).toBe(true)
    expect(isUnlockProbeSrc('blob:http://localhost:8081/abc', 'http://localhost:8081/')).toBe(
      false,
    )
  })
})
