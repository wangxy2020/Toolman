import { describe, expect, it } from 'vitest'
import {
  applyOpenAiToolCallDeltas,
  toolCallsFromDeltaAcc,
} from './openai-messages.js'

describe('applyOpenAiToolCallDeltas', () => {
  it('merges fragmented tool-call deltas into complete calls', () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>()
    applyOpenAiToolCallDeltas(acc, [
      { index: 0, id: 'call-1', function: { name: 'fs_list' } },
    ])
    applyOpenAiToolCallDeltas(acc, [
      { index: 0, function: { arguments: '{"path"' } },
    ])
    applyOpenAiToolCallDeltas(acc, [
      { index: 0, function: { arguments: ':"."}' } },
    ])
    expect(toolCallsFromDeltaAcc(acc)).toEqual([
      { id: 'call-1', name: 'fs_list', arguments: '{"path":"."}' },
    ])
  })
})
