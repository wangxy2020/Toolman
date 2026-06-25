import { describe, expect, it } from 'vitest'

import { buildSandboxedBashEnv, isBlockedInheritedEnvKey } from './bash-env.util'

describe('bash-env.util', () => {
  it('blocks sensitive env keys', () => {
    expect(isBlockedInheritedEnvKey('TOOLMAN_SECRET')).toBe(true)
    expect(isBlockedInheritedEnvKey('OPENAI_API_KEY')).toBe(true)
    expect(isBlockedInheritedEnvKey('MY_APP_TOKEN')).toBe(true)
    expect(isBlockedInheritedEnvKey('PATH')).toBe(false)
  })

  it('builds sandbox env without blocked user keys', () => {
    const env = buildSandboxedBashEnv({
      SAFE_FLAG: '1',
      TOOLMAN_DEBUG: '1',
      CUSTOM: 'ok',
    })
    expect(env.CUSTOM).toBe('ok')
    expect(env.TOOLMAN_DEBUG).toBeUndefined()
  })
})
