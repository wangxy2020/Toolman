import { describe, expect, it } from 'vitest'

import { MessageStreamBuffers } from './message-stream-buffers'

describe('MessageStreamBuffers local_file_links', () => {
  it('appends local file link block after text', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendText('summary')
    buffers.setLocalFileLinks(['/tmp/修订版_a.docx'])

    const blocks = buffers.toContentBlocks()
    expect(blocks.at(-1)).toEqual({
      type: 'local_file_links',
      title: '修订版文件（点击打开）',
      paths: ['/tmp/修订版_a.docx'],
    })
  })
})

describe('MessageStreamBuffers docx_review_summary', () => {
  it('places summary block before local file links', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendText('report')
    buffers.setDocxReviewSummaries([
      {
        type: 'docx_review_summary',
        fileName: 'notes.docx',
        workingPath: '/tmp/修订版_notes.docx',
        issuesFound: 2,
        commentsRequested: 1,
        commentsApplied: 1,
        commentsFailed: 0,
        replacementsRequested: 1,
        replacementsApplied: 1,
        replacementsFailed: 0,
        paragraphEditsRequested: 0,
        paragraphEditsApplied: 0,
        paragraphEditsFailed: 0,
      },
    ])
    buffers.setLocalFileLinks(['/tmp/修订版_notes.docx'])

    const blocks = buffers.toContentBlocks()
    const summaryIndex = blocks.findIndex((block) => block.type === 'docx_review_summary')
    const linksIndex = blocks.findIndex((block) => block.type === 'local_file_links')
    expect(summaryIndex).toBeGreaterThanOrEqual(0)
    expect(linksIndex).toBeGreaterThan(summaryIndex)
  })
})
