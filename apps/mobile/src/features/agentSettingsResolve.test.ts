import { describe, expect, it } from 'vitest'
import { DEFAULT_MODULE_PREFS } from '../settings/prefs-defaults'
import {
  normalizeAgentSettings,
  resolveActiveAgent,
  resolveAgentSettings,
  resolveClassroomTtsSettings,
} from './agentSettingsResolve'

describe('agentSettingsResolve', () => {
  it('falls back to module prefs when agent has no settings', () => {
    const resolved = resolveAgentSettings(
      { id: 'a1', agentScope: 'agent' },
      DEFAULT_MODULE_PREFS.agent,
    )
    expect(resolved.systemPrompt).toBe(DEFAULT_MODULE_PREFS.agent.systemPrompt)
    expect(resolved.autoSpeak).toBe(DEFAULT_MODULE_PREFS.agent.autoSpeak)
  })

  it('merges per-agent overrides', () => {
    const resolved = resolveAgentSettings(
      {
        id: 'a1',
        agentScope: 'agent',
        settings: {
          ...normalizeAgentSettings({
            systemPrompt: '仅此智能体',
            autoSpeak: false,
            mcpServerIds: ['fetch'],
          })!,
        },
      },
      DEFAULT_MODULE_PREFS.agent,
    )
    expect(resolved.systemPrompt).toBe('仅此智能体')
    expect(resolved.autoSpeak).toBe(false)
    expect(resolved.mcpServerIds).toEqual(['fetch'])
    expect(resolved.defaultWebSearch).toBe(false)
  })

  it('resolves active agent from session assistantId', () => {
    const agents = [
      { id: 'a1', name: '甲', agentScope: 'agent' as const, createdAt: 1 },
      { id: 'a2', name: '乙', agentScope: 'agent' as const, createdAt: 2 },
    ]
    const sessions = [
      {
        id: 's1',
        agentScope: 'agent' as const,
        assistantId: 'a2',
      },
    ]
    const active = resolveActiveAgent({
      agents,
      sessions,
      activeSessionId: 's1',
      agentScope: 'agent',
    })
    expect(active?.id).toBe('a2')
  })

  it('uses the course auto-speak setting in classroom', () => {
    const defaults = {
      autoSpeak: true,
      ttsEngine: 'edge' as const,
      ttsVoice: 'zh-CN-XiaoxiaoNeural',
    }
    expect(resolveClassroomTtsSettings({ autoSpeak: false }, defaults).autoSpeak).toBe(false)
    expect(resolveClassroomTtsSettings(null, defaults).autoSpeak).toBe(true)
  })
})
