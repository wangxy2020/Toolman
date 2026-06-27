import { describe, expect, it } from 'vitest'

import { isReleaseDesktopBuild, shouldShowAuthDevHints } from './release-build'

describe('release-build', () => {
  it('detects non-release dev builds', () => {
    expect(isReleaseDesktopBuild()).toBe(false)
    expect(shouldShowAuthDevHints()).toBe(true)
    expect(shouldShowAuthDevHints(true)).toBe(false)
  })
})
