import { describe, expect, it } from 'vitest'

import {
  EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE,
  EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT
} from '@shared/epcCommercialTypes'

import {
  isEpcWork1BoqFormatCommand,
  isEpcWork1BoqFormatSlashCommand,
  isEpcWork1BoqFormatWorkInput,
  isEpcWork1BoqFormatWorkflowInput,
  resolveEpcWork1BoqFormatWorkLaunch
} from '../epcWork1BoqFormatMessage'

describe('epcWork1BoqFormatMessage', () => {
  it('matches slash command', () => {
    expect(isEpcWork1BoqFormatCommand('/epc boq format')).toBe(true)
    expect(isEpcWork1BoqFormatSlashCommand(EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE)).toBe(true)
  })

  it('matches quick phrase by id, title and builtin content', () => {
    expect(isEpcWork1BoqFormatWorkflowInput('', { quickPhraseId: EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID })).toBe(
      true
    )
    expect(isEpcWork1BoqFormatWorkflowInput('合同价格表检查和处理')).toBe(true)
    expect(isEpcWork1BoqFormatWorkInput(EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT)).toBe(true)
  })

  it('resolves work launch', () => {
    const launch = resolveEpcWork1BoqFormatWorkLaunch('/epc boq format')
    expect(launch.matched).toBe(true)
    expect(launch.workflowUserRequest).toBe(EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT)
  })

  it('does not match work4 command', () => {
    expect(isEpcWork1BoqFormatWorkInput('/epc ipc4 to boq')).toBe(false)
  })
})
