import { describe, expect, it } from 'vitest'

import { PROJECT_MANAGEMENT_AGENT_TABS } from './agent-link.js'
import { getPmAgentCapability, PM_AGENT_CAPABILITIES, resolvePmAgentApplyKindsForMessage } from './pm-agent-capabilities.js'

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

  it('wires resource session to resource phrases and catalog apply', () => {
    expect(getPmAgentCapability('resource_management').phrases).toBe('resource')
    expect(getPmAgentCapability('resource_management').apply).toEqual(['resourceCatalog'])
  })

  it('wires cost session to cost phrases and cost apply', () => {
    expect(getPmAgentCapability('cost_management').phrases).toBe('cost')
    expect(getPmAgentCapability('cost_management').apply).toEqual(['costPlan', 'costCatalog'])
  })

  it('wires plan session to costPlan apply too', () => {
    expect(getPmAgentCapability('progress_management').apply).toContain('costPlan')
  })

  it('resolves exclusive apply kinds for costPlan messages', () => {
    const allowed = getPmAgentCapability('progress_management').apply
    const text = `JSON 数据结构（供系统确认）：${JSON.stringify({
      costPlan: [
        {
          workItemTitle: '满堂基础',
          assignments: [{ type: 'comprehensive', name: '满堂基础', quantity: 1, unitPrice: 10 }],
        },
      ],
    })}`
    expect(resolvePmAgentApplyKindsForMessage(text, allowed)).toEqual(['costPlan'])
  })

  it('resolves exclusive apply kinds for resourcePlan messages', () => {
    const allowed = getPmAgentCapability('progress_management').apply
    const text = JSON.stringify({
      resourcePlan: [
        {
          workItemTitle: '钢筋绑扎',
          assignments: [{ type: 'labor', name: '普通工', quantity: 12, unit: '工日' }],
        },
      ],
    })
    expect(resolvePmAgentApplyKindsForMessage(text, allowed)).toEqual(['resourcePlan'])
  })
})
