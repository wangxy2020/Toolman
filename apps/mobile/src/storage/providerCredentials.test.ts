import { describe, expect, it } from 'vitest'
import {
  readProviderCredential,
  sanitizeCredentialMap,
  upsertProviderCredentials,
} from './providerCredentials'

describe('providerCredentials', () => {
  it('keeps keys isolated per provider', () => {
    const first = upsertProviderCredentials(undefined, 'deepseek', {
      apiKey: 'sk-deepseek',
      model: 'deepseek-v4-flash',
    })
    const next = upsertProviderCredentials(first, 'openai', {
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
    })
    expect(readProviderCredential(next, 'deepseek')?.apiKey).toBe('sk-deepseek')
    expect(readProviderCredential(next, 'openai')?.apiKey).toBe('sk-openai')
    expect(readProviderCredential(next, 'moonshot')).toBeUndefined()
  })

  it('does not leak a deepseek key when switching to an empty provider', () => {
    const stored = sanitizeCredentialMap({
      deepseek: { apiKey: 'sk-deepseek' },
    })
    expect(readProviderCredential(stored, 'openai')?.apiKey).toBeUndefined()
  })
})
