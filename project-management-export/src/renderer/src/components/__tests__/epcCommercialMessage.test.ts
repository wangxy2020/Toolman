import { normalizeEpcSlashCommands } from '@shared/epcCommercialSlash'
import type { IpcAlignmentReport } from '@shared/epcCommercialTypes'
import {
  EPC_COMMERCIAL_COMMAND_TEMPLATE,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT,
  EPC_WORK5_PAYMENT_COMMAND_TEMPLATE
} from '@shared/epcCommercialTypes'
import { describe, expect, it } from 'vitest'

import {
  buildEpcCommercialAgentContextContent,
  buildEpcWork4IpcSlashCommandFillText,
  buildIpcAlignmentReportMessageContent,
  getEpcCommercialWorkflowUserRequest,
  isEpcCommercialCommand,
  isEpcWork4IpcSlashCommand,
  isEpcCommercialStructuredReportContent,
  isEpcCommercialWorkflowInput,
  isEpcCommercialWorkInput,
  normalizeEpcSlashCommandInput,
  parseEpcCommercialCommandInput,
  parseEpcCommercialPayloadFromContent,
  parseEpcCommercialWorkflowInput,
  resolveEpcCommercialWorkLaunch
} from '../epcCommercialMessage'
import { EPC_STEP1_SCAN_INTRO } from '../epcCommercialReportUtils'

describe('parseEpcCommercialCommandInput', () => {
  it('matches epc ipc4 to boq and extracts period', () => {
    const result = parseEpcCommercialCommandInput('epc ipc4 to boq')
    expect(result.matched).toBe(true)
    expect(result.period).toBe('IPC4')
    expect(result.usesPlaceholders).toBe(false)
  })

  it('detects template placeholder ipcx', () => {
    const result = parseEpcCommercialCommandInput(EPC_COMMERCIAL_COMMAND_TEMPLATE.replace(/^\//, ''))
    expect(result.matched).toBe(true)
    expect(result.usesPlaceholders).toBe(true)
    expect(result.period).toBeUndefined()
  })

  it('normalizes legacy project_id command', () => {
    const result = parseEpcCommercialCommandInput('epc MYPROJ schx-ipc4 to boq')
    expect(result.matched).toBe(true)
    expect(result.period).toBe('IPC4')
  })

})

describe('buildEpcWork4IpcSlashCommandFillText', () => {
  it('inserts slash command template only', () => {
    expect(buildEpcWork4IpcSlashCommandFillText()).toBe(EPC_COMMERCIAL_COMMAND_TEMPLATE)
  })
})

describe('getEpcCommercialWorkflowUserRequest', () => {
  it('maps slash-only input to quick phrase body for engine/agent', () => {
    expect(getEpcCommercialWorkflowUserRequest('/epc ipcx to boq')).toBe(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)
    expect(getEpcCommercialWorkflowUserRequest(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)).toBe(
      EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
    )
  })
})

describe('isEpcWork4IpcSlashCommand', () => {
  it('matches template and epc to boq variants', () => {
    expect(isEpcWork4IpcSlashCommand(EPC_COMMERCIAL_COMMAND_TEMPLATE)).toBe(true)
    expect(isEpcWork4IpcSlashCommand('epc ipc4 to boq')).toBe(true)
    expect(isEpcWork4IpcSlashCommand('hello')).toBe(false)
  })
})

describe('resolveEpcCommercialWorkLaunch', () => {
  it('launches workflow for quick phrase only', () => {
    const launch = resolveEpcCommercialWorkLaunch(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)
    expect(launch.matched).toBe(true)
    expect(launch.period).toBeUndefined()
  })

  it('launches slash-only command with concise bubble and phrase workflow', () => {
    const launch = resolveEpcCommercialWorkLaunch('/epc ipcx to boq', {
      quickPhraseId: 'epc-work4-quantity-payment-stats'
    })
    expect(launch.matched).toBe(true)
    expect(launch.visibleUserRequest).toBe('/epc ipcx to boq')
    expect(launch.workflowUserRequest).toBe(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)
    expect(launch.period).toBeUndefined()
  })

  it('uses explicit period from command line', () => {
    const launch = resolveEpcCommercialWorkLaunch('epc ipc4 to boq')
    expect(launch.matched).toBe(true)
    expect(launch.period).toBe('IPC4')
  })
})

describe('normalizeEpcSlashCommandInput', () => {
  it('converts legacy slash command to new template', () => {
    expect(normalizeEpcSlashCommandInput('epc MYPROJ schx-ipc4 to boq')).toBe('epc ipc4 to boq')
  })
})

describe('normalizeEpcSlashCommands', () => {
  it('removes legacy and adds work1, work4 and work5 templates', () => {
    const result = normalizeEpcSlashCommands([{ command: 'epc MYPROJ schx-ipcx to boq', description: 'old' }])
    expect(result.some((c) => c.command.includes('project_id'))).toBe(false)
    const commands = result.map((c) => c.command)
    expect(commands).toContain(EPC_COMMERCIAL_COMMAND_TEMPLATE)
    expect(commands).toContain(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)
    expect(commands.some((c) => c.includes('boq format'))).toBe(true)
  })

  it('adds only missing builtin commands', () => {
    const result = normalizeEpcSlashCommands([{ command: EPC_COMMERCIAL_COMMAND_TEMPLATE, description: 'boq' }])
    // 内置命令共 4 个（工作 1/2/4/5），已有工作 4 时仅补齐其余 3 个
    expect(result).toHaveLength(4)
    const commands = result.map((c) => c.command)
    expect(commands).toContain(EPC_COMMERCIAL_COMMAND_TEMPLATE)
    expect(commands).toContain(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)
    expect(commands.some((c) => c.includes('boq format'))).toBe(true)
    expect(commands.filter((c) => c === EPC_COMMERCIAL_COMMAND_TEMPLATE)).toHaveLength(1)
  })
})

describe('parseEpcCommercialWorkflowInput', () => {
  it('matches built-in quick phrase content', () => {
    const result = parseEpcCommercialWorkflowInput(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)
    expect(result.matched).toBe(true)
    expect(result.period).toBeUndefined()
  })

  it('parses optional period line', () => {
    const result = parseEpcCommercialWorkflowInput(`${EPC_COMMERCIAL_QUICK_PHRASE_CONTENT}\n期数: ipc4`)
    expect(result.matched).toBe(true)
    expect(result.period).toBe('IPC4')
  })
})

describe('isEpcCommercialCommand', () => {
  it('returns true for epc command line with or without leading slash', () => {
    expect(isEpcCommercialCommand('epc ipc3 to boq')).toBe(true)
    expect(isEpcCommercialCommand('/epc ipc3 to boq')).toBe(true)
  })
})

describe('isEpcCommercialWorkflowInput', () => {
  it('returns true for quick phrase content via keyword rules', () => {
    expect(isEpcCommercialWorkflowInput(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)).toBe(true)
  })

  it('returns true when builtin quick phrase id is provided', () => {
    expect(isEpcCommercialWorkflowInput('任意用户说明', { quickPhraseId: 'epc-work4-quantity-payment-stats' })).toBe(
      true
    )
  })
})

describe('isEpcCommercialWorkInput', () => {
  it('returns true for slash command or quick phrase', () => {
    expect(isEpcCommercialWorkInput('/epc ipc4 to boq')).toBe(true)
    expect(isEpcCommercialWorkInput(EPC_COMMERCIAL_QUICK_PHRASE_CONTENT)).toBe(true)
  })

  it('returns true for builtin quick phrase id even when text is empty', () => {
    expect(isEpcCommercialWorkInput('', { quickPhraseId: 'epc-work4-quantity-payment-stats' })).toBe(true)
  })
})

describe('isEpcCommercialStructuredReportContent', () => {
  it('accepts engine marker+json only', () => {
    const block = buildIpcAlignmentReportMessageContent({
      ipcRootPath: '/ws',
      masterPricePath: '/ws/m.xlsx',
      period: 'IPC4',
      processedAt: '2026-01-01T00:00:00.000Z',
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      files: []
    })
    expect(isEpcCommercialStructuredReportContent(block)).toBe(true)
    expect(parseEpcCommercialPayloadFromContent(block)?.kind).toBe('report')
  })

  it('rejects marker followed by markdown report body', () => {
    const block = `${buildIpcAlignmentReportMessageContent({
      ipcRootPath: '/ws',
      masterPricePath: '/ws/m.xlsx',
      period: 'IPC4',
      processedAt: '2026-01-01T00:00:00.000Z',
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      files: []
    })}\n\n# 进度款工程量数据统计-执行报告`
    expect(isEpcCommercialStructuredReportContent(block)).toBe(false)
    expect(parseEpcCommercialPayloadFromContent(block)).toBeNull()
  })
})

describe('buildEpcCommercialAgentContextContent', () => {
  const baseReport: IpcAlignmentReport = {
    ipcRootPath: '/ws',
    masterPricePath: '/ws/BOQ.xlsx',
    period: 'IPC4',
    processedAt: '2026-01-01T00:00:00.000Z',
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    files: [],
    discoveredFiles: [
      {
        fileName: 'BOQ.xlsx',
        filePath: '/ws/BOQ.xlsx',
        relativePath: 'BOQ.xlsx',
        folderPath: '/ws',
        role: 'masterContract',
        roleReason: '母表',
        queue: 'masterContract',
        inLedger: false
      }
    ]
  }

  it('puts step 1 summary below table with bold success status', () => {
    const content = buildEpcCommercialAgentContextContent({
      workspaceRoot: '/ws',
      visibleUserRequest: 'run',
      report: baseReport
    })
    const engine = content.slice(content.indexOf('## 本地 Rust 引擎执行结果'))
    const step1End = engine.indexOf('### 步骤 2：工程量清单分析')
    const step1 = engine.slice(0, step1End)
    const introIdx = step1.indexOf(EPC_STEP1_SCAN_INTRO)
    const tableIdx = step1.indexOf('class="epc-discovery-table"')
    const statusIdx = step1.indexOf('**成功。**')
    const summaryIdx = step1.indexOf('个文件夹')

    expect(step1End).toBeGreaterThan(0)
    expect(introIdx).toBeGreaterThanOrEqual(0)
    expect(introIdx).toBeLessThan(tableIdx)
    expect(statusIdx).toBeGreaterThan(tableIdx)
    expect(summaryIdx).toBeGreaterThan(statusIdx)
    expect(step1).not.toMatch(/状态：(成功|失败)/)
  })

  it('emits separate step 2-5 sections with per-step status', () => {
    const content = buildEpcCommercialAgentContextContent({
      workspaceRoot: '/ws',
      visibleUserRequest: 'run',
      report: {
        ...baseReport,
        failedCount: 1,
        files: [
          {
            fileName: 'IPC007.xlsx',
            filePath: '/ws/IPC007.xlsx',
            status: 'failed',
            analysisOk: false,
            errorMessage: '表头无法识别'
          }
        ]
      }
    })
    expect(content).toContain('### 步骤 2：工程量清单分析')
    expect(content).toContain('### 步骤 5：输出执行结果')
    expect(content).toContain('**失败。**')
    expect(content).not.toContain('### 步骤 2～5')
    expect(content).not.toContain('## 执行状态：失败')
  })
})
