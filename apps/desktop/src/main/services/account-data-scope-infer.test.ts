import { describe, expect, it } from 'vitest'
import { inferDisplacedOwnerSlug } from './account-data-scope-infer'

const documentsRoot = '/Users/wangxy/Documents/ToolmanData'
const currentRoot = `${documentsRoot}/wangxq2008`

describe('inferDisplacedOwnerSlug', () => {
  it('picks the previous account folder that still has the referenced files', () => {
    const owner = inferDisplacedOwnerSlug({
      currentSlug: 'wangxq2008',
      currentRoot,
      documentsRoot,
      siblingSlugs: ['wxymale', '31897124'],
      referencedPaths: [
        `${currentRoot}/本地知识库/保函/a.xlsx`,
        `${currentRoot}/本地知识库/默认文件夹/b.pdf`,
        `${currentRoot}/同步知识库/默认文件夹/c.pdf`,
      ],
      fileExists: (path) =>
        path.endsWith('/wxymale/本地知识库/保函/a.xlsx') ||
        path.endsWith('/wxymale/本地知识库/默认文件夹/b.pdf') ||
        path.endsWith('/wangxq2008/同步知识库/默认文件夹/c.pdf'),
    })

    expect(owner).toBe('wxymale')
  })

  it('keeps the current account when its folder already has the files', () => {
    const owner = inferDisplacedOwnerSlug({
      currentSlug: 'wangxq2008',
      currentRoot,
      documentsRoot,
      siblingSlugs: ['wxymale'],
      referencedPaths: [`${currentRoot}/本地知识库/默认文件夹/b.pdf`],
      fileExists: (path) => path.endsWith('/wangxq2008/本地知识库/默认文件夹/b.pdf'),
    })

    expect(owner).toBeNull()
  })
})
