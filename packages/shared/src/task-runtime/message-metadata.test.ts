import { describe, expect, it } from 'vitest'

import {
  MESSAGE_TASK_ID_KEY,
  buildMessageTaskMetadata,
  parseMessageTaskId,
} from './message-metadata.js'

describe('message-metadata', () => {
  it('builds task metadata', () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    expect(buildMessageTaskMetadata(taskId)).toEqual({ [MESSAGE_TASK_ID_KEY]: taskId })
  })

  it('parses valid task id', () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    expect(parseMessageTaskId({ [MESSAGE_TASK_ID_KEY]: taskId })).toBe(taskId)
  })

  it('rejects invalid task id', () => {
    expect(parseMessageTaskId({ [MESSAGE_TASK_ID_KEY]: 'not-a-uuid' })).toBeUndefined()
  })
})
