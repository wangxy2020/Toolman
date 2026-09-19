import { describe, expect, it } from 'vitest'
import {
  getKnowledgeKindPolicy,
  knowledgeKindAcceptsLocalFiles,
  knowledgeKindAcceptsUrls,
  knowledgeKindAllowsRetrieval,
  knowledgeKindSyncsToMobile,
} from './knowledge-kind-policy.js'

describe('getKnowledgeKindPolicy', () => {
  it('maps local/sync to file ingest and retrieval', () => {
    expect(knowledgeKindAcceptsLocalFiles('local')).toBe(true)
    expect(knowledgeKindAcceptsUrls('local')).toBe(false)
    expect(knowledgeKindAllowsRetrieval('local')).toBe(true)
    expect(knowledgeKindSyncsToMobile('local')).toBe(false)

    expect(knowledgeKindAcceptsLocalFiles('sync')).toBe(true)
    expect(knowledgeKindAcceptsUrls('sync')).toBe(false)
    expect(knowledgeKindSyncsToMobile('sync')).toBe(true)
    expect(getKnowledgeKindPolicy('sync').storageScope).toBe('workspace')
  })

  it('maps network to URL-only ingest', () => {
    expect(knowledgeKindAcceptsLocalFiles('network')).toBe(false)
    expect(knowledgeKindAcceptsUrls('network')).toBe(true)
    expect(knowledgeKindAllowsRetrieval('network')).toBe(true)
  })

  it('maps shared to p2p snapshot copies without direct file upload', () => {
    const policy = getKnowledgeKindPolicy('shared')
    expect(policy.sourceType).toBe('p2p')
    expect(policy.acceptsLocalFiles).toBe(false)
    expect(policy.acceptsUrls).toBe(false)
    expect(policy.retrievalPolicy).toBe('enabled')
  })

  it('keeps local_files out of RAG', () => {
    expect(knowledgeKindAllowsRetrieval('local_files')).toBe(false)
    expect(knowledgeKindAcceptsLocalFiles('local_files')).toBe(true)
  })

  it('falls back to local policy for unknown kind values', () => {
    expect(getKnowledgeKindPolicy('unknown').kind).toBe('local')
  })
})
