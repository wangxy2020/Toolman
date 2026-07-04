import { describe, expect, it } from 'vitest'

import {
  assertTaskCancelTransition,
  assertTaskPauseTransition,
  assertTaskResumeTransition,
  resolveResumeTaskStatus,
  TaskStateError,
} from './state-machine'

describe('task-runtime state machine', () => {
  it('allows pause from executing', () => {
    expect(() => assertTaskPauseTransition('executing')).not.toThrow()
  })

  it('rejects pause when already paused', () => {
    expect(() => assertTaskPauseTransition('paused')).toThrow(TaskStateError)
  })

  it('rejects pause when completed', () => {
    expect(() => assertTaskPauseTransition('completed')).toThrow(TaskStateError)
  })

  it('allows resume only from paused', () => {
    expect(() => assertTaskResumeTransition('paused')).not.toThrow()
    expect(() => assertTaskResumeTransition('executing')).toThrow(TaskStateError)
  })

  it('restores paused-from status on resume', () => {
    expect(resolveResumeTaskStatus('executing')).toBe('executing')
    expect(resolveResumeTaskStatus(undefined)).toBe('pending')
  })

  it('rejects cancel on terminal tasks', () => {
    expect(() => assertTaskCancelTransition('completed')).toThrow(TaskStateError)
    expect(() => assertTaskCancelTransition('executing')).not.toThrow()
  })
})
