import { describe, expect, it } from 'vitest'

import {
  EPC_WORK5_PAYMENT_COMMAND_TEMPLATE,
  buildEpcWork5PaymentSlashCommandFillText,
  isBuiltinEpcWork5PaymentQuickPhraseId,
  isEpcWork5PaymentCommand,
  isEpcWork5PaymentSlashCommand,
  isEpcWork5PaymentWorkInput,
  isEpcWork5PaymentWorkflowInput,
  parseEpcWork5PaymentCommandInput,
  resolveEpcWork5PaymentWorkLaunch
} from '../epcWork5PaymentMessage'
import { EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID, EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT } from '@shared/epcCommercialTypes'

describe('EPC Work5 Payment — command parsing', () => {
  it('recognizes /epc ipcx to payment (template)', () => {
    expect(isEpcWork5PaymentSlashCommand('/epc ipcx to payment')).toBe(true)
    expect(isEpcWork5PaymentSlashCommand(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)).toBe(true)
  })

  it('recognizes /epc ipc4 to payment with explicit period', () => {
    expect(isEpcWork5PaymentSlashCommand('/epc ipc4 to payment')).toBe(true)
    const result = parseEpcWork5PaymentCommandInput('/epc ipc4 to payment')
    expect(result.matched).toBe(true)
    expect(result.period).toBe('IPC4')
    expect(result.usesPlaceholders).toBe(false)
  })

  it('recognizes placeholder /epc ipcx to payment as placeholder', () => {
    const result = parseEpcWork5PaymentCommandInput('/epc ipcx to payment')
    expect(result.matched).toBe(true)
    expect(result.period).toBeUndefined()
    expect(result.usesPlaceholders).toBe(true)
  })

  it('does NOT match work4 command /epc ipcx to boq', () => {
    expect(isEpcWork5PaymentSlashCommand('/epc ipcx to boq')).toBe(false)
    expect(isEpcWork5PaymentCommand('/epc ipcx to boq')).toBe(false)
  })

  it('does NOT match unrelated text', () => {
    expect(isEpcWork5PaymentSlashCommand('/epc ')).toBe(false)
    expect(isEpcWork5PaymentSlashCommand('')).toBe(false)
    expect(isEpcWork5PaymentSlashCommand('hello')).toBe(false)
  })
})

describe('EPC Work5 Payment — workflow input detection', () => {
  it('detects quick phrase title', () => {
    expect(isEpcWork5PaymentWorkflowInput('进度款申请与支付数据统计')).toBe(true)
  })

  it('detects phrase content by keywords', () => {
    expect(
      isEpcWork5PaymentWorkflowInput(
        '根据进度款申请资料和回款信息等，统计各项目每个价格表中，每一期进度的已完成金额，应付金额，预付款扣回金额，预留金额，生效日期，账期天数，应支付日期，实际支付日期等信息。'
      )
    ).toBe(true)
  })

  it('detects by quickPhraseId', () => {
    expect(isEpcWork5PaymentWorkflowInput('', { quickPhraseId: EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID })).toBe(true)
  })

  it('does NOT match work4 phrase', () => {
    expect(
      isEpcWork5PaymentWorkflowInput('请对当前工作区中，各文件夹内的工程量清单与进度款数据进行分析和统计。')
    ).toBe(false)
  })
})

describe('EPC Work5 Payment — isBuiltinQuickPhraseId', () => {
  it('identifies correct id', () => {
    expect(isBuiltinEpcWork5PaymentQuickPhraseId(EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID)).toBe(true)
    expect(isBuiltinEpcWork5PaymentQuickPhraseId('epc-work4-quantity-payment-stats')).toBe(false)
    expect(isBuiltinEpcWork5PaymentQuickPhraseId(undefined)).toBe(false)
  })
})

describe('EPC Work5 Payment — resolveEpcWork5PaymentWorkLaunch', () => {
  it('matches slash command and extracts period', () => {
    const launch = resolveEpcWork5PaymentWorkLaunch('/epc ipc4 to payment')
    expect(launch.matched).toBe(true)
    expect(launch.period).toBe('IPC4')
    expect(launch.visibleUserRequest).toBe('/epc ipc4 to payment')
    expect(launch.workflowUserRequest).toBe(EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT)
  })

  it('matches quick phrase by id and uses full content as workflow request', () => {
    const launch = resolveEpcWork5PaymentWorkLaunch(EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT, {
      quickPhraseId: EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID
    })
    expect(launch.matched).toBe(true)
    expect(launch.workflowUserRequest).toBe(EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT)
  })

  it('does NOT match unrelated text', () => {
    const launch = resolveEpcWork5PaymentWorkLaunch('hello world')
    expect(launch.matched).toBe(false)
  })

  it('placeholder command sets period to undefined', () => {
    const launch = resolveEpcWork5PaymentWorkLaunch('/epc ipcx to payment')
    expect(launch.matched).toBe(true)
    expect(launch.period).toBeUndefined()
  })
})

describe('EPC Work5 Payment — slash fill text', () => {
  it('fill text equals command template', () => {
    expect(buildEpcWork5PaymentSlashCommandFillText()).toBe(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)
    expect(buildEpcWork5PaymentSlashCommandFillText()).toBe('/epc ipcx to payment')
  })
})

describe('EPC Work5 Payment — isEpcWork5PaymentWorkInput', () => {
  it('matches slash command', () => {
    expect(isEpcWork5PaymentWorkInput('/epc ipc3 to payment')).toBe(true)
  })
  it('matches workflow input', () => {
    expect(
      isEpcWork5PaymentWorkInput('进度款申请与支付数据统计')
    ).toBe(true)
  })
  it('matches by phrase id', () => {
    expect(
      isEpcWork5PaymentWorkInput('任意文本', { quickPhraseId: EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID })
    ).toBe(true)
  })
  it('does NOT match work4', () => {
    expect(isEpcWork5PaymentWorkInput('/epc ipcx to boq')).toBe(false)
  })
})
