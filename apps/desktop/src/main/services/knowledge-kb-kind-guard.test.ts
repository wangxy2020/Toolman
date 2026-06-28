import { describe, expect, it } from 'vitest'
import {
  assertKnowledgeBaseAcceptsLocalFiles,
  assertKnowledgeBaseAcceptsUrls,
} from './knowledge-kb-kind-guard.js'

describe('knowledge-kb-kind-guard', () => {
  it('rejects local files on network knowledge bases', () => {
    expect(() => assertKnowledgeBaseAcceptsLocalFiles({ kind: 'network' })).toThrow(
      /网络知识库/,
    )
  })

  it('rejects urls on local knowledge bases', () => {
    expect(() => assertKnowledgeBaseAcceptsUrls({ kind: 'local' })).toThrow(/本地知识库/)
  })

  it('allows local files on local knowledge bases', () => {
    expect(() => assertKnowledgeBaseAcceptsLocalFiles({ kind: 'local' })).not.toThrow()
  })

  it('allows urls on network knowledge bases', () => {
    expect(() => assertKnowledgeBaseAcceptsUrls({ kind: 'network' })).not.toThrow()
  })
})
