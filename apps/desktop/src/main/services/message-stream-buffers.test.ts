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
