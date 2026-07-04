import { existsSync, readFileSync, statSync } from 'node:fs'

import { isTaskToolStepRecord, type AgentTask, type TaskReflectionResult } from '@toolman/shared'

import { collectTaskOutputPathsFromHistory, discoverTaskOutputFilePaths } from '../task-output-files'
import {
  looksLikeDirectoryListingGoal,
  looksLikeExcelAnalysisGoal,
} from '../planner/plan-repair'

const MIN_OUTPUT_FILE_BYTES = 48
const MIN_CSV_DATA_LINES = 2

function countNonEmptyLines(text: string): number {
  return text.split('\n').filter((line) => line.trim()).length
}

function readStepOutputText(output: unknown): string {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return ''
  const text = (output as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

function hasSubstantialToolOutput(task: AgentTask): boolean {
  return task.history.some((step) => {
    if (step.status !== 'completed' || !isTaskToolStepRecord(step)) return false
    const text = readStepOutputText(step.output).trim()
    if (text.length < 24) return false
    if (/^ERROR:/i.test(text)) return false
    return true
  })
}

function verifyOutputFiles(task: AgentTask): string[] {
  const filterExisting = (paths: string[]) =>
    paths.filter((path) => {
      if (!existsSync(path)) return false
      try {
        return statSync(path).size >= MIN_OUTPUT_FILE_BYTES
      } catch {
        return false
      }
    })

  const fromHistory = filterExisting(collectTaskOutputPathsFromHistory(task))
  if (fromHistory.length > 0) {
    return fromHistory
  }

  try {
    return filterExisting(discoverTaskOutputFilePaths(task))
  } catch {
    return []
  }
}

function verifyCsvHasData(path: string): boolean {
  try {
    const content = readFileSync(path, 'utf8')
    return countNonEmptyLines(content) >= MIN_CSV_DATA_LINES
  } catch {
    return false
  }
}

/** Block false `pass` when reflection claims success without verifiable artifacts. */
export function validateTaskPassEvidence(task: AgentTask): { ok: true } | { ok: false; reason: string } {
  const goal = (task.goal ?? task.title).trim()
  const completedToolSteps = task.history.filter(
    (step) => step.kind === 'tool' && step.status === 'completed',
  )

  if (completedToolSteps.length === 0) {
    return { ok: false, reason: '没有成功执行任何工具步骤' }
  }

  const verifiedFiles = verifyOutputFiles(task)

  if (looksLikeExcelAnalysisGoal(goal)) {
    if (verifiedFiles.length === 0) {
      return { ok: false, reason: '未在工作目录找到已生成的统计报告文件' }
    }
    const csvOk = verifiedFiles.some((path) => path.toLowerCase().endsWith('.csv') && verifyCsvHasData(path))
    const spreadsheetOk = verifiedFiles.some((path) => /\.xlsx?$/i.test(path) && statSync(path).size > 200)
    if (!csvOk && !spreadsheetOk) {
      return { ok: false, reason: '统计产物为空、仅含表头，或未实际读取 Excel 数据' }
    }
    return { ok: true }
  }

  if (looksLikeDirectoryListingGoal(goal)) {
    if (verifiedFiles.length === 0 && !hasSubstantialToolOutput(task)) {
      return { ok: false, reason: '未找到导出的目录清单文件' }
    }
    return { ok: true }
  }

  if (/写入|导出|生成|创建|输出|write|export|create|report|csv|xlsx|表格|文件/.test(goal)) {
    if (verifiedFiles.length === 0 && !hasSubstantialToolOutput(task)) {
      return { ok: false, reason: '任务要求产出文件，但未检测到有效输出' }
    }
  }

  if (!hasSubstantialToolOutput(task) && verifiedFiles.length === 0) {
    return { ok: false, reason: '工具步骤无有效输出，无法确认目标已达成' }
  }

  return { ok: true }
}

export function rejectReflectionPassWithoutEvidence(
  task: AgentTask,
  reflection: TaskReflectionResult,
): TaskReflectionResult {
  if (reflection.verdict !== 'pass') {
    return reflection
  }

  const evidence = validateTaskPassEvidence(task)
  if (evidence.ok) {
    return reflection
  }

  return {
    ...reflection,
    verdict: 'fail',
    reason: evidence.reason,
    summary: reflection.summary
      ? `${reflection.summary}（系统校验：${evidence.reason}）`
      : `系统校验未通过：${evidence.reason}`,
  }
}
