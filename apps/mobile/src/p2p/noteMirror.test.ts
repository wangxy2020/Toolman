import { describe, expect, it } from 'vitest'
import {
  deleteNoteMirror,
  getNoteMirror,
  resetNoteMirrorsForTests,
  upsertNoteMirror,
} from './noteMirror'

describe('noteMirror', () => {
  it('stores group note content without touching personal note ids as a global library', () => {
    resetNoteMirrorsForTests()
    upsertNoteMirror({
      workspaceId: 'ws-a',
      noteId: 'note-private-looking',
      title: '群共享',
      content: 'only in group',
      permission: 'read',
    })
    expect(getNoteMirror('ws-a', 'note-private-looking')?.content).toBe('only in group')
    expect(getNoteMirror('ws-other', 'note-private-looking')).toBeUndefined()
    deleteNoteMirror('ws-a', 'note-private-looking')
    expect(getNoteMirror('ws-a', 'note-private-looking')).toBeUndefined()
  })
})
