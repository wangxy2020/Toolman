import type { IpcFileResult } from '@toolman/shared'

const formatAmount = (amount: number): string =>
  amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatCompactMoney = (amount: number, currency: string | undefined): string => {
  const code = currency?.trim() || 'USD'
  return `${code} ${formatAmount(amount)}`
}

export const buildStepBulletDetail = (summary: string, bullets: string[]): string =>
  bullets.length > 0 ? `${summary}\n${bullets.join('\n')}` : summary

export const stepSummary = (okCount: number, total: number, okLabel: string, failLabel: string): string =>
  okCount === total
    ? `${total} 个文件${okLabel}`
    : `${okCount}/${total} 个文件${okLabel}，${total - okCount} 个${failLabel}`

/** 步骤 2：单文件一行要点 */
export const formatStep2FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.analysisOk !== true) {
    if (file.errorMessage?.trim()) {
      return `• ${name}：分析失败 — **${file.errorMessage.trim()}**`
    }
    if (file.analysisOk === false) {
      return `• ${name}：分析失败 — **未知**`
    }
  }
  if (file.status === 'skipped') {
    return `• ${name}：已跳过`
  }
  const rows = file.cleanedRowCount ?? 0
  const rowErr = file.analysisRowErrorCount ?? 0
  const errText = rowErr > 0 ? `**${rowErr}** 处行级错误` : '无行级错误'
  return `• ${name}：**${rows}** 行，${errText}`
}

/** 步骤 3：金额核对 */
export const formatStep3FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.analysisOk !== true) {
    return `• ${name}：未通过步骤 2`
  }
  if (file.reconciliationOk === true) {
    return `• ${name}：与 BOQ Value 一致`
  }
  if (file.reconciliationOk === false) {
    return `• ${name}：与 BOQ Value 不一致`
  }
  if (file.boqValueTotal == null) {
    return `• ${name}：无 BOQ Value 行，已跳过核对`
  }
  return `• ${name}：核对结果未知`
}

/** 步骤 4：写入母表 */
export const formatStep4FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.reconciliationOk === false) {
    return `• ${name}：未通过步骤 3，未写入`
  }
  if (file.mergeOk === true) {
    const sheet = file.mergeTargetSheet ?? '母表'
    const col = file.mergePeriodColumn ?? '期数列'
    const n = file.mergeMatchedRows ?? file.cleanedRowCount ?? 0
    const total =
      file.cleanedTotalAmount != null
        ? `，合计 **${formatCompactMoney(file.cleanedTotalAmount, file.cleanedCurrency)}**`
        : ''
    return `• ${name}：**${sheet}** · 列 **${col}** · **${n}** 行${total}`
  }
  if (file.mergeOk === false) {
    const msg = file.errorMessage ?? '写入失败'
    return `• ${name}：**${msg}**`
  }
  return `• ${name}：未写入`
}
