import type { TaskPlan } from '@toolman/shared'
import { looksLikeDirectoryListingGoal, looksLikeExcelAnalysisGoal } from './plan-repair-goals.js'
import { repairTaskPlan } from './plan-repair-collapse.js'
import {
  buildDirectoryListingBashTool,
  buildExcelAnalysisBashTool,
  extractOutputFileName,
  stringifyToolArgs,
} from './plan-repair-tools.js'

type TaskPlanContext = Pick<import('@toolman/shared').AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>

export function buildHeuristicTaskPlan(goal: string, _task?: TaskPlanContext): TaskPlan | null {
  const trimmed = goal.trim()
  if (!trimmed) return null

  if (looksLikeExcelAnalysisGoal(trimmed)) {
    const outputPath = extractOutputFileName(
      { kind: 'output', title: trimmed, description: '' },
      trimmed,
    )
    return {
      goal: trimmed,
      summary: '系统自动补全：扫描 Excel 价格表并生成汇总 CSV',
      steps: [
        {
          kind: 'tool',
          title: '扫描 Excel 价格表并生成统计报告',
          tool: buildExcelAnalysisBashTool(outputPath),
        },
      ],
    }
  }

  if (looksLikeDirectoryListingGoal(trimmed)) {
    const outputPath = extractOutputFileName(
      { kind: 'output', title: trimmed, description: '' },
      trimmed,
    )
    return {
      goal: trimmed,
      summary: '系统自动补全：扫描工作目录并导出清单',
      steps: [
        {
          kind: 'tool',
          title: '扫描工作目录并导出清单',
          tool: buildDirectoryListingBashTool(outputPath),
        },
      ],
    }
  }

  if (/文件|目录|folder|file|list|read|write|创建|删除|修改/.test(trimmed)) {
    return {
      goal: trimmed,
      summary: '系统自动补全：列出工作目录',
      steps: [
        {
          kind: 'tool',
          title: '列出工作目录',
          tool: {
            toolName: 'fs_list',
            argsJson: stringifyToolArgs({ path: '.' }),
          },
        },
      ],
    }
  }

  return null
}

export function buildGenericFallbackPlan(goal: string): TaskPlan {
  const trimmed = goal.trim()
  return {
    goal: trimmed,
    summary: '系统自动补全：先探查工作目录',
    steps: [
      {
        kind: 'tool',
        title: '列出工作目录',
        tool: {
          toolName: 'fs_list',
          argsJson: stringifyToolArgs({ path: '.' }),
        },
      },
    ],
  }
}

export function ensureExecutableTaskPlan(plan: TaskPlan, task?: TaskPlanContext): TaskPlan {
  const repaired = repairTaskPlan(plan, task)
  const hasTool = repaired.steps.some((step) => Boolean(step.tool?.toolName))
  if (hasTool) return repaired

  return buildHeuristicTaskPlan(repaired.goal, task) ?? buildGenericFallbackPlan(repaired.goal)
}
