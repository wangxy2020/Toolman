import { describe, expect, it } from 'vitest'

import {
  SESSION_ACTIVE_TASK_ID_KEY,
  parseSessionActiveTaskId,
  patchSessionActiveTaskId,
} from './session-metadata.js'

describe('session-metadata', () => {
  it('patches active task id', () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    expect(patchSessionActiveTaskId({ foo: 'bar' }, taskId)).toEqual({
      foo: 'bar',
      [SESSION_ACTIVE_TASK_ID_KEY]: taskId,
    })
  })

  it('clears active task id', () => {
    expect(
      patchSessionActiveTaskId({ [SESSION_ACTIVE_TASK_ID_KEY]: '550e8400-e29b-41d4-a716-446655440000' }, null),
    ).toEqual({})
  })

  it('parses active task id', () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    expect(parseSessionActiveTaskId({ [SESSION_ACTIVE_TASK_ID_KEY]: taskId })).toBe(taskId)
  })
})
