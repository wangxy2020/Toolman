import { describe, expect, it } from 'vitest'

import {
  readWorkflowShareMetadata,
  serializeWorkflowShareMetadata,
} from './p2p-workflow-share-metadata'

describe('p2p-workflow-share-metadata', () => {
  it('serializeWorkflowShareMetadata omits empty optional fields', () => {
    expect(
      serializeWorkflowShareMetadata({
        workflowJson: '{"nodes":[]}',
      }),
    ).toBe('{"workflowJson":"{\\"nodes\\":[]}"}')
  })

  it('serializeWorkflowShareMetadata includes optional metadata', () => {
    const json = serializeWorkflowShareMetadata({
      sourceWorkspaceId: 'ws-1',
      workflowJson: '{}',
      engine: 'n8n',
      graphPath: 'graph.json',
    })
    expect(JSON.parse(json)).toEqual({
      sourceWorkspaceId: 'ws-1',
      workflowJson: '{}',
      engine: 'n8n',
      graphPath: 'graph.json',
    })
  })

  it('readWorkflowShareMetadata parses valid json and ignores invalid fields', () => {
    expect(
      readWorkflowShareMetadata(
        JSON.stringify({
          sourceWorkspaceId: 'ws-1',
          workflowJson: '{"a":1}',
          engine: 'n8n',
          graphPath: 'graph.json',
          extra: true,
        }),
      ),
    ).toEqual({
      sourceWorkspaceId: 'ws-1',
      workflowJson: '{"a":1}',
      engine: 'n8n',
      graphPath: 'graph.json',
    })
  })

  it('readWorkflowShareMetadata returns empty object for missing or invalid json', () => {
    expect(readWorkflowShareMetadata(null)).toEqual({})
    expect(readWorkflowShareMetadata('not-json')).toEqual({})
  })
})
