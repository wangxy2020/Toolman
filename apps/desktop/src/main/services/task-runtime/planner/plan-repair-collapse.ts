import type { TaskPlan, TaskPlanStep, TaskPlanToolStep } from '@toolman/shared'
import {
  buildDirectoryListingBashTool,
  buildExcelAnalysisBashTool,
  buildExportToolForGoal,
  extractOutputFileName,
  extractQuotedPath,
  isCanonicalExcelAnalysisBash,
  isDirectoryExportStep,
  isDirectoryListingBashCommand,
  isFsListStep,
  isRiskyDirectoryListingBash,
  parseToolArgsJson,
  repairToolStep,
  resolveToolBaseName,
  stringifyToolArgs,
} from './plan-repair-tools.js'
import { looksLikeDirectoryListingGoal, looksLikeExcelAnalysisGoal } from './plan-repair-goals.js'

type TaskPlanContext = Pick<import('@toolman/shared').AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>

export function collapseDirectoryListingPlan(plan: TaskPlan): TaskPlan {
  if (looksLikeExcelAnalysisGoal(plan.goal) || !looksLikeDirectoryListingGoal(plan.goal)) {
    return plan
  }

  const upgraded = plan.steps.map((step) => repairTaskPlanStep(step, plan.goal))

  const listIdx = upgraded.findIndex((step) => isFsListStep(step))
  const exportIdx = upgraded.findIndex(
    (step, index) => index !== listIdx && isDirectoryExportStep(step),
  )

  const outputPath = extractOutputFileName(
    exportIdx >= 0 ? upgraded[exportIdx]! : { kind: 'output', title: plan.goal, description: '' },
    plan.goal,
  )
  const mergedStep: TaskPlanStep = {
    kind: 'tool',
    title: '扫描工作目录并导出清单',
    description: '单步自包含：列出目录并写入文件',
    tool: buildDirectoryListingBashTool(outputPath),
  }

  if (listIdx >= 0 && exportIdx >= 0 && listIdx !== exportIdx) {
    const remove = new Set([listIdx, exportIdx])
    return {
      ...plan,
      steps: [mergedStep, ...upgraded.filter((_, index) => !remove.has(index))],
    }
  }

  if (listIdx >= 0 && exportIdx < 0 && /导出|生成|excel|csv|xlsx|表格|清单|write|export/i.test(plan.goal)) {
    return {
      ...plan,
      steps: [mergedStep, ...upgraded.filter((_, index) => index !== listIdx)],
    }
  }

  return { ...plan, steps: upgraded }
}

function extractDirectoryPath(step: TaskPlanStep): string {
  const blob = `${step.title} ${step.description ?? ''}`
  const dotSlash = blob.match(/(?:路径|目录|path)[：:\s]*[`'"]?(\.[^`'"\s]+|[\w./-]+)[`'"]?/i)
  if (dotSlash?.[1]) return dotSlash[1]

  if (/当前|工作目录|本目录|this directory/i.test(blob)) {
    return '.'
  }

  return '.'
}

function normalizeToolArgsJson(tool: TaskPlanToolStep): TaskPlanToolStep {
  const argsJson = tool.argsJson?.trim() || '{}'
  try {
    JSON.parse(argsJson)
    return { toolName: tool.toolName.trim(), argsJson }
  } catch {
    return { toolName: tool.toolName.trim(), argsJson: '{}' }
  }
}

function coerceKindToTool(step: TaskPlanStep, goal: string, task?: TaskPlanContext): TaskPlanStep | null {
  const text = `${step.title} ${step.description ?? ''}`.toLowerCase()

  if (step.kind === 'output' || step.kind === 'transform') {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  if (step.kind === 'scan') {
    if (looksLikeExcelAnalysisGoal(goal) || /excel|xlsx|价格表|表格/.test(text)) {
      return {
        ...step,
        kind: 'tool',
        tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
      }
    }
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (step.kind === 'index') {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_glob',
        argsJson: stringifyToolArgs({ pattern: '**/*' }),
      }),
    }
  }

  if (step.kind === 'read') {
    const path = extractQuotedPath(`${step.title} ${step.description ?? ''}`) ?? 'README.md'
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_read',
        argsJson: stringifyToolArgs({ path }),
      }),
    }
  }

  if (/写入|导出|生成|write|export|csv|excel|xlsx|表格|报告|统计/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  if (/列出|扫描|list|scan|文件夹/.test(text) || (/目录/.test(text) && !/导出|写入|生成|csv|excel|xlsx|表格|统计|报告/.test(text))) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (/fs_list|list_dir|list_files/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (/fs_write|write_file|create_file/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  return null
}

export function repairTaskPlanStep(step: TaskPlanStep, goal: string, task?: TaskPlanContext): TaskPlanStep {
  if (step.tool?.toolName?.trim()) {
    const repaired = repairToolStep(step.tool, goal, step, task)
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(repaired),
    }
  }

  const coerced = coerceKindToTool(step, goal, task)
  return coerced ?? step
}

export function repairTaskPlan(plan: TaskPlan, task?: TaskPlanContext): TaskPlan {
  const goal = plan.goal
  const steps = plan.steps.map((step) => repairTaskPlanStep(step, goal, task))
  if (looksLikeExcelAnalysisGoal(goal)) {
    const normalized = steps.map((step) => {
      if (!step.tool?.toolName?.trim()) return step
      const base = resolveToolBaseName(step.tool.toolName)
      if (
        step.tool.toolName.startsWith('mcp__') &&
        (base.includes('excel') || base === 'read_excel' || base === 'review_excel')
      ) {
        return step
      }
      if (base === 'fs_glob' || base === 'read_excel' || base === 'review_excel') {
        return step
      }
      if (base !== 'bash' && base !== 'fs_write') return step
      const args = parseToolArgsJson(step.tool.argsJson)
      const command = typeof args.command === 'string' ? args.command : ''
      if (
        base === 'bash' &&
        command.trim() &&
        isCanonicalExcelAnalysisBash(command) &&
        !isDirectoryListingBashCommand(command) &&
        !isRiskyDirectoryListingBash(command)
      ) {
        return step
      }
      return {
        ...step,
        kind: 'tool' as const,
        tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
      }
    })
    const hasExcelBash = normalized.some(
      (step) =>
        step.tool &&
        resolveToolBaseName(step.tool.toolName) === 'bash' &&
        isCanonicalExcelAnalysisBash(
          String(parseToolArgsJson(step.tool.argsJson).command ?? ''),
        ),
    )
    const hasExcelMcp = normalized.some(
      (step) =>
        step.tool &&
        (resolveToolBaseName(step.tool.toolName) === 'read_excel' ||
          resolveToolBaseName(step.tool.toolName) === 'fs_glob'),
    )
    if (!hasExcelBash && !hasExcelMcp) {
      return {
        ...plan,
        steps: [
          {
            kind: 'tool',
            title: '扫描 Excel 价格表并生成统计报告',
            tool: buildExcelAnalysisBashTool(
              extractOutputFileName({ kind: 'output', title: goal, description: '' }, goal),
            ),
          },
        ],
      }
    }
    return { ...plan, steps: normalized }
  }
  return collapseDirectoryListingPlan({ ...plan, steps })
}

