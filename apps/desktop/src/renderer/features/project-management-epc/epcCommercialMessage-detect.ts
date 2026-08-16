import {
  EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE,
} from '@toolman/shared'
import { ipcTokenToPeriod, parseEpcCommercialCommandInput } from './epcCommercialMessage-command'

/**
 * 发给引擎与智能体汇报的「用户请求」：快捷短语全量工作流用内置正文；数据表更新类指令不在此处理。
 */
export const getEpcCommercialWorkflowUserRequest = (
  rawText: string,
  options?: { quickPhraseId?: string }
): string => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  const trimmed = rawText.trim()
  if (isEpcCommercialWorkflowInput(trimmed, options)) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  if (parseEpcCommercialCommandInput(trimmed).matched) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  return trimmed
}

export interface EpcCommercialWorkLaunch {
  matched: boolean
  period?: string
  masterPricePath?: string
  /** 对话框用户气泡展示（斜杠命令保持简洁原文） */
  visibleUserRequest: string
  /** 引擎 + 智能体汇报用的任务说明（与快捷短语正文一致） */
  workflowUserRequest: string
}

/** 斜杠命令与快捷短语共用：解析期数/母表并决定是否启动工作 4 */
export const resolveEpcCommercialWorkLaunch = (
  rawText: string,
  options?: { quickPhraseId?: string }
): EpcCommercialWorkLaunch => {
  const trimmed = rawText.trim()
  if (!isEpcCommercialWorkInput(trimmed, options)) {
    return { matched: false, visibleUserRequest: trimmed, workflowUserRequest: trimmed }
  }

  const command = parseEpcCommercialCommandInput(trimmed)
  const workflow = parseEpcCommercialWorkflowInput(trimmed, options)

  const period =
    command.matched && !command.usesPlaceholders
      ? (command.period ?? workflow.period)
      : workflow.period
  const masterPricePath = command.masterPricePath ?? workflow.masterPricePath

  return {
    matched: true,
    period,
    masterPricePath,
    visibleUserRequest: trimmed,
    workflowUserRequest: getEpcCommercialWorkflowUserRequest(trimmed, options)
  }
}

const normalizeWorkflowText = (text: string): string => text.trim().replace(/\r\n/g, '\n')

/** 是否为内置 EPC 工作 4 快捷短语（按 ID，不依赖正文措辞） */
export const isBuiltinEpcCommercialQuickPhraseId = (phraseId: string | undefined): boolean =>
  phraseId === EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID

/** 是否匹配工作 4 快捷短语 / 自然语言工作流说明（勿依赖全文与 CONTENT 相等，便于改展示文案） */
export const isEpcCommercialWorkflowInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return true
  }

  const trimmed = normalizeWorkflowText(text)
  if (!trimmed) {
    return false
  }

  if (trimmed.includes(EPC_COMMERCIAL_QUICK_PHRASE_TITLE)) {
    return true
  }

  return (
    trimmed.includes('工程量清单') &&
    trimmed.includes('进度款') &&
    (trimmed.includes('各文件夹') || trimmed.includes('工作区'))
  )
}

/** 斜杠命令或快捷短语：同一套进度款工程量数据统计工作 */
export const isEpcCommercialWorkInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return true
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  if (parseEpcCommercialCommandInput(trimmed).matched) {
    return true
  }
  return isEpcCommercialWorkflowInput(trimmed, options)
}

export const parseEpcCommercialWorkflowInput = (
  rawText: string,
  options?: { quickPhraseId?: string }
): { matched: boolean; period?: string; masterPricePath?: string } => {
  if (!isEpcCommercialWorkflowInput(rawText, options)) {
    return { matched: false }
  }

  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let period: string | undefined
  let masterPricePath: string | undefined

  for (const line of lines) {
    const periodMatch = line.match(/^期数[:：]\s*(\S+)/i)
    if (periodMatch) {
      period = ipcTokenToPeriod(periodMatch[1]) ?? periodMatch[1].trim().toUpperCase()
    }
    const masterMatch = line.match(/^(?:母表[:：]\s*)(.+)$/i)
    if (masterMatch) {
      masterPricePath = masterMatch[1].trim()
    }
  }

  return { matched: true, period, masterPricePath }
}
