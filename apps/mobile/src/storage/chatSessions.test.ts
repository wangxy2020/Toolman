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
    expect(migrated.agents.some((agent) => agent.agentScope === 'agent')).toBe(true)
    const agentId = migrated.agents.find((agent) => agent.agentScope === 'agent')?.id
    expect(migrated.sessions.find((session) => session.id === 's1')?.assistantId).toBe(agentId)
  })

  it('seeds default agent and topic when store is empty', () => {
    const migrated = migrateAgentsAndSessions([], [])
    const agentAgents = migrated.agents.filter((agent) => agent.agentScope === 'agent')
    const projectAgents = migrated.agents.filter((agent) => agent.agentScope === 'projects')
    expect(agentAgents).toHaveLength(1)
    expect(agentAgents[0]?.name).toBe('默认智能体')
    expect(projectAgents).toHaveLength(1)
    expect(migrated.agents.every((agent) => agent.agentScope !== 'classroom')).toBe(true)

    const agentSessions = migrated.sessions.filter((session) => session.agentScope === 'agent')
    const projectSessions = migrated.sessions.filter((session) => session.agentScope === 'projects')
    const classroomSessions = migrated.sessions.filter(
      (session) => session.agentScope === 'classroom',
    )
    expect(agentSessions).toHaveLength(1)
    expect(agentSessions[0]?.title).toBe('新话题')
    expect(agentSessions[0]?.assistantId).toBe(agentAgents[0]?.id)
    expect(projectSessions).toHaveLength(1)
    expect(classroomSessions).toHaveLength(0)
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
    expect(migrated.agents.every((agent) => agent.agentScope !== 'classroom')).toBe(true)
    expect(migrated.sessions.find((session) => session.id === 'course-1')?.assistantId).toBeUndefined()
    expect(migrated.sessions.some((session) => session.agentScope === 'agent')).toBe(true)
  })
})
