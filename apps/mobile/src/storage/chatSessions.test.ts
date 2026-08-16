import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

import type { ChatSession, MobileAgent } from '../state/MobileAppContext'
import { migrateAgentsAndSessions } from './chatSessions'

describe('migrateAgentsAndSessions', () => {
  it('attaches personal agent sessions to a default agent', () => {
    const sessions: ChatSession[] = [
      {
        id: 's1',
        title: '话题',
        updatedAt: 1,
        messages: [],
        agentScope: 'agent',
      },
    ]
    const migrated = migrateAgentsAndSessions(sessions, [])
    expect(migrated.agents).toHaveLength(1)
    expect(migrated.agents[0]?.agentScope).toBe('agent')
    expect(migrated.sessions[0]?.assistantId).toBe(migrated.agents[0]?.id)
  })

  it('does not invent classroom agents or stamp course sessions', () => {
    const sessions: ChatSession[] = [
      {
        id: 'course-1',
        title: '高等数学',
        updatedAt: 1,
        messages: [],
        agentScope: 'classroom',
        assistantId: 'polluted-asst',
      },
    ]
    const pollutedAgents: MobileAgent[] = [
      {
        id: 'polluted-asst',
        name: '默认智能体',
        agentScope: 'classroom',
        createdAt: 1,
      },
    ]
    const migrated = migrateAgentsAndSessions(sessions, pollutedAgents)
    expect(migrated.agents).toEqual([])
    expect(migrated.sessions[0]?.assistantId).toBeUndefined()
    expect(migrated.sessions[0]?.id).toBe('course-1')
  })
})
