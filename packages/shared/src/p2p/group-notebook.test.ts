import { describe, expect, it } from 'vitest'
import {
  buildGroupNotebookId,
  isGroupNotebookId,
  parseGroupNotebookWorkspaceId,
} from './group-notebook'

describe('group-notebook', () => {
  it('builds and parses group notebook ids', () => {
    const id = buildGroupNotebookId('ws-abc')
    expect(id).toBe('group-notebook:ws-abc')
    expect(isGroupNotebookId(id)).toBe(true)
    expect(parseGroupNotebookWorkspaceId(id)).toBe('ws-abc')
  })
})
