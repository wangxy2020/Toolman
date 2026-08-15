import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeCreateForm,
  deriveNameFromUrl,
  normalizeKnowledgeUrl,
} from './knowledgeCreateUtils'

describe('knowledgeCreateUtils', () => {
  it('normalizes urls and derives a host name', () => {
    expect(normalizeKnowledgeUrl('example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeKnowledgeUrl('HTTPS://Example.com')).toBe('HTTPS://Example.com')
    expect(deriveNameFromUrl('https://www.example.com/docs')).toBe('example.com')
  })

  it('validates network and local create forms', () => {
    expect(buildKnowledgeCreateForm({
      name: '',
      kind: 'network',
      description: '',
      networkUrl: '',
    })).toEqual({ error: '请输入网络地址' })
    expect(buildKnowledgeCreateForm({
      name: 'Docs',
      kind: 'local',
      description: '  ',
      networkUrl: '',
    })).toEqual({ form: { name: 'Docs', kind: 'local', description: undefined } })
  })
})
