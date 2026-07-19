import { describe, expect, it } from 'vitest'

import { PROJECT_MANAGEMENT_AGENT_TABS } from './agent-link.js'
import { getPmAgentCapability, PM_AGENT_CAPABILITIES } from './pm-agent-capabilities.js'

describe('PM_AGENT_CAPABILITIES registry', () => {
  it('covers every agent tab', () => {
    for (const tab of PROJECT_MANAGEMENT_AGENT_TABS) {
      expect(PM_AGENT_CAPABILITIES[tab]).toBeDefined()
      expect(getPmAgentCapability(tab)).toEqual(PM_AGENT_CAPABILITIES[tab])
    }
  })

  it('wires plan session to resourcePlan apply', () => {
    expect(getPmAgentCapability('progress_management').apply).toContain('resourcePlan')
    expect(getPmAgentCapability('progress_management').phrases).toBe('plan')
  })

  it('wires resource session to resource phrases only', () => {
    expect(getPmAgentCapability('resource_management').phrases).toBe('resource')
    expect(getPmAgentCapability('resource_management').apply).toEqual([])
  })
})
