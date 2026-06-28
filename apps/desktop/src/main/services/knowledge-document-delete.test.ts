import { describe, expect, it } from 'vitest'
import { isPathInsideFolder } from './knowledge-folder-files.service'

describe('knowledge document delete disk guard', () => {
  it('only allows deleting files inside the knowledge storage folder', () => {
    const storage = '/Users/demo/Toolman/本地知识库/默认文件夹'
    const inside = '/Users/demo/Toolman/本地知识库/默认文件夹/report.pdf'
    const outside = '/Users/demo/Downloads/report.pdf'

    expect(isPathInsideFolder(storage, inside)).toBe(true)
    expect(isPathInsideFolder(storage, outside)).toBe(false)
  })
})
