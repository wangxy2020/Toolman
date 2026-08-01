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

describe('MessageStreamBuffers thinking + tools', () => {
  it('strips preparing status when model thinking arrives', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendStatus('正在准备回复…\n')
    buffers.appendThinking('分析用户问题')
    expect(buffers.toContentBlocks()[0]).toEqual({
      type: 'thinking',
      text: '分析用户问题',
      startedAtMs: expect.any(Number),
    })
  })

  it('preserves thinking start time across preparing-status strip for wall-clock duration', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendStatus('正在准备回复…\n')
    const startedAt = buffers.getThinkingStartedAtMs()
    expect(startedAt).not.toBeNull()
    buffers.appendThinking('深度分析')
    buffers.finalizeThinkingDuration()
    expect(buffers.getThinkingStartedAtMs()).toBe(startedAt)
    expect(buffers.toContentBlocks()[0]).toMatchObject({
      type: 'thinking',
      text: '深度分析',
      startedAtMs: startedAt,
      durationSeconds: expect.any(Number),
    })
  })

  it('finalizes thinking duration when answer text starts', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendThinking('reasoning')
    expect(buffers.getThinkingDurationSeconds()).toBeNull()
    buffers.appendText('answer')
    expect(buffers.getThinkingDurationSeconds()).toEqual(expect.any(Number))
    expect(buffers.toContentBlocks()[0]).toMatchObject({
      type: 'thinking',
      durationSeconds: expect.any(Number),
      startedAtMs: expect.any(Number),
    })
  })

  it('keeps wall-clock start across clearThinking so duration does not shrink', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendStatus('正在准备回复…\n')
    const startedAt = buffers.getThinkingStartedAtMs()
    expect(startedAt).not.toBeNull()

    buffers.appendThinking('phase-1 reasoning')
    buffers.appendText('intermediate report')
    const afterReport = buffers.getThinkingDurationSeconds()
    expect(afterReport).toEqual(expect.any(Number))

    buffers.clearThinking()
    expect(buffers.getThinkingStartedAtMs()).toBe(startedAt)
    expect(buffers.getThinkingDurationSeconds()).toBeNull()

    buffers.appendThinking('final reasoning')
    buffers.appendText('final answer')
    expect(buffers.getThinkingStartedAtMs()).toBe(startedAt)
    expect(buffers.getThinkingDurationSeconds()).toBeGreaterThanOrEqual(afterReport ?? 0)
  })

  it('promotes thinking to text when model returns reasoning only', () => {
    const buffers = new MessageStreamBuffers()
    buffers.appendThinking('answer text')
    expect(buffers.promoteThinkingToText()).toBe(true)
    expect(buffers.plainText()).toBe('answer text')
  })

  it('upserts tool call deltas', () => {
    const buffers = new MessageStreamBuffers()
    const first = buffers.upsertTool({
      toolCallId: 'tool-1',
      name: 'fs_read',
      status: 'running',
    })
    expect(first.type).toBe('tool')
    buffers.upsertTool({
      toolCallId: 'tool-1',
      name: 'fs_read',
      status: 'done',
      result: 'ok',
    })
    const blocks = buffers.toContentBlocks()
    expect(blocks.some((block) => block.type === 'tool' && block.status === 'done')).toBe(true)
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
