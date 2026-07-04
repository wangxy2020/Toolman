import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { executeFsEdit, executeFsWrite } from './filesystem'

describe('filesystem tools', () => {
  it('appends content when fs_edit append is true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-fs-edit-'))
    const context = { workingDirectory: dir }

    executeFsWrite({ path: 'hello.txt', content: 'Hello' }, context)
    await executeFsEdit({ path: 'hello.txt', newText: '\nWorld', append: true }, context)

    expect(readFileSync(join(dir, 'hello.txt'), 'utf-8')).toBe('Hello\nWorld')
  })

  it('reports file preview when oldText is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-fs-edit-'))
    const context = { workingDirectory: dir }

    executeFsWrite({ path: 'hello.txt', content: 'actual content' }, context)

    await expect(
      executeFsEdit({ path: 'hello.txt', oldText: 'wrong', newText: 'x' }, context),
    ).rejects.toThrow(/actual content/)
  })
})
