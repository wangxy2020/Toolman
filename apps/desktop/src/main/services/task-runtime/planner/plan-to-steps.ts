import { randomUUID } from 'node:crypto'

import {
  parseTaskToolStepInput,
  type AgentTask,
  type TaskPlan,
  type TaskPlanStep,
  type TaskStepRecord,
} from '@toolman/shared'

import { normalizePlannerToolStep, isUnsupportedPlannerTool } from './planner-tool-utils'

export function taskPlanStepToTaskStepRecord(
  step: TaskPlanStep,
  task?: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): TaskStepRecord {
  if (step.tool) {
    if (task && isUnsupportedPlannerTool(step.tool.toolName, task)) {
      throw new Error(`规划使用了不支持的工具：${step.tool.toolName}`)
    }

    const normalized = task
      ? normalizePlannerToolStep(step.tool.toolName, step.tool.argsJson, task)
      : { toolName: step.tool.toolName, argsJson: step.tool.argsJson }

    parseTaskToolStepInput({
      toolName: normalized.toolName,
      argsJson: normalized.argsJson,
    })
    return {
      id: randomUUID(),
      kind: 'tool',
      title: step.title,
      status: 'pending',
      input: {
        toolName: normalized.toolName,
        argsJson: normalized.argsJson,
      },
      retryCount: 0,
    }
  }

  return {
    id: randomUUID(),
    kind: step.kind,
    title: step.title,
    status: 'pending',
    input: {
      description: step.description,
      plannedKind: step.kind,
    },
    retryCount: 0,
  }
}

export function taskPlanToStepRecords(
  plan: TaskPlan,
  task?: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>,
): TaskStepRecord[] {
  return plan.steps.map((step) => taskPlanStepToTaskStepRecord(step, task))
}

export function countExecutablePlanSteps(plan: TaskPlan): number {
  return plan.steps.filter((step) => Boolean(step.tool)).length
}
