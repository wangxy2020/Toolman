import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('../../db/repos', () => ({
  getSessionRepository: vi.fn(),
}))

vi.mock('./store', () => ({
  getAgentTask: vi.fn(),
}))

import { getSessionRepository } from '../../db/repos'
import { getAgentTask } from './store'
import { clearStaleTerminalSessionBinding, unbindTaskFromSession } from './session-bind'

const sessionId = '00000000-0000-0000-0000-000000000001'
const taskId = '550e8400-e29b-41d4-a716-446655440000'

describe('session-bind', () => {
  beforeEach(() => {
    vi.mocked(getSessionRepository).mockReset()
    vi.mocked(getAgentTask).mockReset()
  })

  it('clears binding when bound task has failed', () => {
    const update = vi.fn()
    vi.mocked(getSessionRepository).mockReturnValue({
      findRowById: vi.fn(() => ({
        id: sessionId,
        metadataJson: JSON.stringify({ activeTaskId: taskId }),
      })),
      update,
    } as never)
    vi.mocked(getAgentTask).mockReturnValue({ id: taskId, status: 'failed' } as AgentTask)

    expect(clearStaleTerminalSessionBinding(sessionId)).toBe(true)
    expect(update).toHaveBeenCalledWith(sessionId, { metadata: {} })
  })

  it('keeps binding when task is still running', () => {
    const update = vi.fn()
    vi.mocked(getSessionRepository).mockReturnValue({
      findRowById: vi.fn(() => ({
        id: sessionId,
        metadataJson: JSON.stringify({ activeTaskId: taskId }),
      })),
      update,
    } as never)
    vi.mocked(getAgentTask).mockReturnValue({ id: taskId, status: 'executing' } as AgentTask)

    expect(clearStaleTerminalSessionBinding(sessionId)).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false when task id does not match binding', () => {
    const update = vi.fn()
    vi.mocked(getSessionRepository).mockReturnValue({
      findRowById: vi.fn(() => ({
        id: sessionId,
        metadataJson: JSON.stringify({ activeTaskId: taskId }),
      })),
      update,
    } as never)

    expect(unbindTaskFromSession(sessionId, '00000000-0000-0000-0000-000000000099')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
