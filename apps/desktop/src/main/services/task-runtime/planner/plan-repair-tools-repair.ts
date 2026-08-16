import type { TaskPlanStep, TaskPlanToolStep } from '@toolman/shared'
import { looksLikeDirectoryListingGoal, looksLikeExcelAnalysisGoal } from './plan-repair-goals.js'
import {
  buildDirectoryListingBashTool,
  buildExcelAnalysisBashTool,
  extractOutputFileName,
  isCanonicalExcelAnalysisBash,
} from './plan-repair-tools-builders.js'

type TaskPlanContext = Pick<import('@toolman/shared').AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>

export function buildDirectoryListingWriteTool(outputPath: string): TaskPlanToolStep {
  return buildDirectoryListingBashTool(outputPath)
}

export function buildExportToolForGoal(
  goal: string,
  step: TaskPlanStep,
  _task?: TaskPlanContext,
): TaskPlanToolStep {
  const path = extractOutputFileName(step, goal)
  if (looksLikeExcelAnalysisGoal(goal)) {
    return buildExcelAnalysisBashTool(path)
  }
  return buildDirectoryListingWriteTool(path)
}

export function isDirectoryListingBashCommand(command: string): boolean {
  return /序号.*文件名称|os\.listdir\s*\(\s*['"]\.['"]\s*\)/.test(command)
}

export function resolveToolBaseName(toolName: string): string {
  return (toolName.includes('__') ? toolName.split('__').pop() : toolName)?.toLowerCase() ?? toolName.toLowerCase()
}

export function parseToolArgsJson(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }
  return {}
}

export function isRiskyDirectoryListingBash(command: string): boolean {
  const lower = command.toLowerCase()
  if (!lower.includes('python')) return false
  return /python3?\s+-c\s/.test(lower)
}

export function repairToolStep(
  tool: TaskPlanToolStep,
  goal: string,
  step: TaskPlanStep,
  _task?: TaskPlanContext,
): TaskPlanToolStep {
  const base = resolveToolBaseName(tool.toolName)
  const args = parseToolArgsJson(tool.argsJson)
  const outputPath = extractOutputFileName(step, goal)

  if (base.includes('excel') && tool.toolName.startsWith('mcp__')) {
    return tool
  }
  if (base === 'read_excel' || base === 'review_excel' || base === 'fs_glob') {
    return tool
  }

  if (base === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    if (looksLikeExcelAnalysisGoal(goal)) {
      if (
        !command.trim() ||
        !isCanonicalExcelAnalysisBash(command) ||
        isRiskyDirectoryListingBash(command) ||
        isDirectoryListingBashCommand(command)
      ) {
        return buildExcelAnalysisBashTool(outputPath)
      }
    } else if (command.trim() && isRiskyDirectoryListingBash(command)) {
      return buildDirectoryListingBashTool(outputPath)
    }
  }

  if (base === 'fs_write') {
    const path = typeof args.path === 'string' ? args.path : outputPath
    const content = typeof args.content === 'string' ? args.content.trim() : ''
    const placeholderOnly = !content || /^path,type,name\n?$/i.test(content) || content.length < 48
    if (looksLikeExcelAnalysisGoal(goal) && (placeholderOnly || /\.xlsx?$/i.test(path))) {
      return buildExcelAnalysisBashTool(path.endsWith('.csv') ? path : outputPath)
    }
    if (/\.xlsx?$/i.test(path) || (looksLikeDirectoryListingGoal(goal) && placeholderOnly)) {
      return buildDirectoryListingBashTool(path)
    }
  }

  return tool
}

export function isFsListStep(step: TaskPlanStep): boolean {
  if (!step.tool?.toolName?.trim()) {
    return step.kind === 'scan'
  }
  return resolveToolBaseName(step.tool.toolName) === 'fs_list'
}

export function isDirectoryExportStep(step: TaskPlanStep): boolean {
  if (!step.tool?.toolName?.trim()) {
    return step.kind === 'output' || step.kind === 'transform'
  }
  const base = resolveToolBaseName(step.tool.toolName)
  return base === 'bash' || base === 'fs_write'
}

/** Merge fs_list + export into one bash step; upgrade placeholder fs_write to bash. */
